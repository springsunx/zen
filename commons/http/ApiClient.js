
import ApiCache from '../storage/ApiCache.js';
import BackendHealth from '../net/BackendHealth.js';
import NotesCache from '../storage/NotesCache.js';
import ApiCacheFind from '../storage/ApiCache.js';
import { showToast } from "../components/Toast.jsx";

async function request(method, url, payload, opts) {
  const isApiGet = method === 'GET' && url.startsWith('/api/');
  if (BackendHealth.shouldSkipNetwork() && isApiGet) {
    const cached = await ApiCache.get(url);
    if (cached) return cached;
    // If no cache, avoid network but return null to let caller handle gracefully
  }
  if (!navigator.onLine && isApiGet) {
    const cached = await ApiCache.get(url);
    if (cached) {
      return cached;
    }
  }
  const options = {
    method: method,
    headers: {},
    ...opts,
  };

  if (payload instanceof FormData) {
    options.body = payload;
  } else if (payload) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(payload);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      if (isApiGet) {
        const cached = await ApiCache.get(url);
        if (cached) return cached;
      }
      throw response;
    }

    if (isApiGet) {
      try { await ApiCache.set(url, await response.clone().json()); } catch(_) {}
    }
    try { BackendHealth.clearFailure(); } catch(_) {}
    const isJsonResponse = response.headers.get('content-type')?.includes('application/json');
    return isJsonResponse ? await response.json() : null;
  } catch (error) {
        if (isApiGet) {
      try {
        const cached = await ApiCache.get(url);
        if (cached) {
          return cached;
        }
      } catch (_) {}
    }
    // Prefer handling HTTP Response errors first
    if (error instanceof Response) {
      const isJsonResponse = error.headers.get('content-type')?.includes('application/json');
      if (isJsonResponse) {
        const body = await error.json();
        const err = new Error(body?.message || error.statusText);
        err.code = body?.code;
        try { err.body = body; } catch(_) {}
        if (body && body.referencedBy) { try { err.referencedBy = body.referencedBy; } catch(_) {} }
        const skipCodes = ['NO_USERS', 'NO_SESSION', 'INVALID_EMAIL', 'INVALID_PASSWORD', 'INCORRECT_EMAIL', 'INCORRECT_PASSWORD', 'IMAGE_IN_USE'];
        if (!skipCodes.includes(body?.code)) {
          const message = body?.message || 'An unexpected error occurred';
          showToast(message);
        }
        if (body?.code !== 'IMAGE_IN_USE') console.error('API error:', body);
        throw err;
      }
      showToast('An unexpected error occurred');
      try { BackendHealth.clearFailure(); } catch(_) {}
      throw new Error(error.statusText);
    }

    // Network/offline errors (TypeError or offline)
    if (!navigator.onLine) {
      showToast('No internet connection.');
      try { BackendHealth.markFailure(); } catch(_) {}
      console.error('Network error:', error);
      throw error;
    }
    if (error instanceof TypeError && (
      error.message.includes('fetch') ||
      error.message.includes('Load failed') ||
      error.message.includes('NetworkError')
    )) {
      showToast('Connection failed.');
      try { BackendHealth.markFailure(); } catch(_) {}
      console.error('Fetch error:', error);
      throw error;
    }

    // Extra fallback for note detail: try NotesCache and cached lists by ID
    try {
      const noteIdMatch = url.match(/\/api\/notes\/(\d+)\/?/);
      if (isApiGet && noteIdMatch) {
        const nid = parseInt(noteIdMatch[1], 10);
        let note = await NotesCache.get(nid);
        if (note) { return note; }
        const fromList = await ApiCacheFind.findNoteById(nid);
        if (fromList) { try { await NotesCache.set(fromList); } catch(_) {} return fromList; }
      }
    } catch (_) {}

    throw error;
  }

}


// Users

async function checkUser() {
  return await request('GET', '/api/users/me');
}

async function createUser(payload) {
  return await request('POST', '/api/users/new', payload);
}

async function login(payload) {
  return await request('POST', '/api/users/login', payload);
}

async function updatePassword(payload) {
  return await request('POST', '/api/users/me/password', payload);
}

async function logout() {
  return await request('POST', '/api/users/logout');
}

// Focus Modes

async function getFocusModes() {
  return await request('GET', '/api/focus');
}

async function createFocusMode(focusMode) {
  return await request('POST', '/api/focus/new', focusMode);
}

async function updateFocusMode(focusMode) {
  return await request('PUT', `/api/focus/${focusMode.focusId}`, focusMode);
}

async function deleteFocusMode(focusId) {
  return await request('DELETE', `/api/focus/${focusId}/`);
}

// Notes

async function getNotes(tagId, focusId, isArchived, isDeleted, page) {
  let url = "/api/notes/";
  const params = new URLSearchParams();

  if (tagId) {
    params.append('tagId', tagId);
  } else if (focusId) {
    params.append('focusId', focusId);
  }

  if (page) {
    params.append('page', page);
  }

  if (isArchived) {
    params.append('isArchived', "true");
  } else if (isDeleted) {
    params.append('isDeleted', "true");
  }

  if (params.toString()) {
    url += '?' + params.toString();
  }

  const resp = await request('GET', url);
  try {
    const arr = Array.isArray(resp?.notes) ? resp.notes : (Array.isArray(resp) ? resp : []);
    for (const n of arr) { await NotesCache.set(n); }
  } catch (_) {}
  return resp;
}

async function getNoteById(noteId) {
  // Circuit-breaker: if recent failures and cache exists, skip network to avoid error spam
  try {
    const failKey = 'api_fail_notes_detail';
    const lastFail = parseInt(sessionStorage.getItem(failKey) || '0', 10);
    const within = Date.now() - lastFail < 30000;
    if (within) {
      const nid = parseInt(noteId, 10);
      const cachedNote = await NotesCache.get(nid);
      if (cachedNote) return cachedNote;
      try {
        const fromList = await ApiCacheFind.findNoteById(nid);
        if (fromList) { try { await NotesCache.set(fromList); } catch(_) {} return fromList; }
      } catch (_) {}
    }
  } catch (_) {}
  try {
    const note = await request('GET', `/api/notes/${noteId}`);
    try { await NotesCache.set(note); } catch(_) {}
    return note;
  } catch (e) {
    try { sessionStorage.setItem('api_fail_notes_detail', String(Date.now())); } catch(_) {}
    let cached = await NotesCache.get(parseInt(noteId, 10));
    if (cached) return cached;
    // try find in cached lists
    try {
      const hit = await ApiCacheFind.findNoteById(parseInt(noteId, 10));
      if (hit) { try { await NotesCache.set(hit); } catch(_) {} return hit; }
    } catch(_) {}
    throw e;
  }
}

async function createNote(note) {
  return await request('POST', '/api/notes/', note);
}

async function updateNote(noteId, note) {
  return await request('PUT', `/api/notes/${noteId}/`, note);
}

async function deleteNote(noteId) {
  return await request('DELETE', `/api/notes/${noteId}`);
}

async function bulkDeleteNotes(ids) {
  return await request('DELETE', '/api/notes/bulk/', { ids });
}

async function restoreNote(noteId) {
  return await request('PUT', `/api/notes/${noteId}/restore/`);
}

async function archiveNote(noteId) {
  return await request('PUT', `/api/notes/${noteId}/archive/`);
}

async function bulkArchiveNotes(ids) {
  return await request('PUT', '/api/notes/bulk/archive/', { ids });
}

async function unarchiveNote(noteId) {
  return await request('PUT', `/api/notes/${noteId}/unarchive/`);
}

async function pinNote(noteId) {
  return await request('PUT', `/api/notes/${noteId}/pin/`);
}

async function unpinNote(noteId) {
  return await request('PUT', `/api/notes/${noteId}/unpin/`);
}

async function clearTrash() {
  return await request('DELETE', '/api/notes/?isDeleted=true');
}

// Tags

async function getTags(focusId) {
  let url = "/api/tags";

  if (focusId) {
    url += `?focusId=${focusId}`;
  }

  const resp = await request('GET', url);
  try {
    const arr = Array.isArray(resp?.notes) ? resp.notes : (Array.isArray(resp) ? resp : []);
    for (const n of arr) { await NotesCache.set(n); }
  } catch (_) {}
  return resp;
}

async function searchTags(query) {
  return await request('GET', `/api/tags?query=${query}`);
}

async function updateTag(tag) {
  return await request('PUT', `/api/tags/${tag.tagId}`, tag);
}

async function deleteTag(tagId) {
  return await request('DELETE', `/api/tags/${tagId}`);
}

// Images

async function getImages(tagId, focusId, page) {
  let url = "/api/images/";
  const params = new URLSearchParams();

  if (tagId) {
    params.append('tagId', tagId);
  } else if (focusId) {
    params.append('focusId', focusId);
  }

  if (page) {
    params.append('page', page);
  }

  if (params.toString()) {
    url += '?' + params.toString();
  }

  const resp = await request('GET', url);
  try {
    const arr = Array.isArray(resp?.notes) ? resp.notes : (Array.isArray(resp) ? resp : []);
    for (const n of arr) { await NotesCache.set(n); }
  } catch (_) {}
  return resp;
}

async function uploadImage(formData) {
  return await request('POST', '/api/images/', formData);
}

// Search

async function search(query) {
  return await request('GET', `/api/search?query=${query}`);
}

// Intelligence

async function getSimilarImages(filename) {
  return await request('GET', `/api/intelligence/similarity/images/${filename}/`);
}

// Import

async function importFile(formData) {
  return await request('POST', '/api/import/', formData);
}

// Export

async function exportNotes() {
  const response = await fetch('/api/export/', {
    method: 'GET',
    headers: {}
  });

  if (!response.ok) {
    throw new Error('Export failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'zen-export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// Templates

async function getTemplates() {
  return await request('GET', "/api/templates/");
}

async function getTemplateById(templateId) {
  return await request('GET', `/api/templates/${templateId}`);
}

async function createTemplate(template) {
  return await request('POST', '/api/templates/', template);
}

async function updateTemplate(templateId, template) {
  return await request('PUT', `/api/templates/${templateId}`, template);
}

async function deleteTemplate(templateId) {
  return await request('DELETE', `/api/templates/${templateId}`);
}

async function getRecommendedTemplates() {
  return await request('GET', "/api/templates/recommended/");
}

async function incrementTemplateUsage(templateId) {
  return await request('PUT', `/api/templates/${templateId}/usage/`);
}


// MCP Tokens

async function getTokens() {
  return await request('GET', '/api/mcp/tokens/');
}

async function createToken(payload) {
  return await request('POST', '/api/mcp/tokens/', payload);
}

async function deleteToken(tokenId) {
  return await request('DELETE', `/api/mcp/tokens/${tokenId}/`);
}

// Canvases

async function getCanvases() {
  return await request('GET', '/api/canvases/');
}

async function getCanvasById(canvasId) {
  return await request('GET', `/api/canvases/${canvasId}/`);
}

async function createCanvas(canvas) {
  return await request('POST', '/api/canvases/', canvas);
}

async function updateCanvas(canvasId, canvas, opts) {
  return await request('PUT', `/api/canvases/${canvasId}/`, canvas, opts);
}

async function deleteCanvas(canvasId) {
  return await request('DELETE', `/api/canvases/${canvasId}/`);
}

export default {
  request,
  checkUser,
  createUser,
  login,
  updatePassword,
  logout,
  getFocusModes,
  createFocusMode,
  updateFocusMode,
  deleteFocusMode,
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  bulkDeleteNotes,
  restoreNote,
  archiveNote,
  bulkArchiveNotes,
  unarchiveNote,
  pinNote,
  unpinNote,
  clearTrash,
  getTags,
  searchTags,
  updateTag,
  deleteTag,
  getImages,
  deleteImage,
  forceDeleteImage,
  uploadImage,
  search,
  getSimilarImages,
  importFile,
  exportNotes,
  cleanupImages,
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getRecommendedTemplates,
  incrementTemplateUsage,
  getTokens,
  createToken,
  deleteToken,
  getCanvases,
  getCanvasById,
  createCanvas,
  updateCanvas,
  deleteCanvas,
  reorderTags
};

async function reorderTags(order) {
  return await request('PUT', '/api/tags/reorder/', { order });
}

async function deleteImage(filename) {
  return await request('DELETE', `/api/images/${encodeURIComponent(filename)}/`);
}

async function forceDeleteImage(filename) {
  return await request('DELETE', `/api/images/${encodeURIComponent(filename)}/?force=true`);
}

async function cleanupImages() {
  return await request('POST', '/api/images/cleanup');
}
