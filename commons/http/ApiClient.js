import ApiCache from '../storage/ApiCache.js';
import BackendHealth from '../net/BackendHealth.js';
import NotesCache from '../storage/NotesCache.js';
import { showToast } from "../components/Toast.jsx";

// ─── Cache helpers ───

async function getCached(url) {
  try { return await ApiCache.get(url); } catch (_) { return null; }
}

async function setCached(url, data) {
  try { await ApiCache.set(url, data); } catch (_) {}
}

async function getNoteCacheFallback(url) {
  try {
    const match = url.match(/\/api\/notes\/(\d+)\/?/);
    if (!match) return null;
    const nid = parseInt(match[1], 10);
    const note = await NotesCache.get(nid);
    if (note) return note;
    const fromList = await ApiCache.findNoteById(nid);
    if (fromList) { try { await NotesCache.set(fromList); } catch (_) {} return fromList; }
  } catch (_) {}
  return null;
}

// ─── Core request ───

async function request(method, url, payload, opts) {
  const isApiGet = method === 'GET' && url.startsWith('/api/');

  // 1. Offline / backend unhealthy → serve from cache if available
  if (isApiGet && (BackendHealth.shouldSkipNetwork() || !navigator.onLine)) {
    const cached = await getCached(url);
    if (cached) return cached;
  }

  // 2. Build fetch options
  const options = { method, headers: {}, ...opts };
  if (payload instanceof FormData) {
    options.body = payload;
  } else if (payload) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(payload);
  }

  // 3. Execute fetch
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    // Network error → try cache, then handle offline/connection errors
    if (isApiGet) {
      const cached = await getCached(url);
      if (cached) return cached;
      const noteFallback = await getNoteCacheFallback(url);
      if (noteFallback) return noteFallback;
    }
    return handleNetworkError(networkError);
  }

  // 4. Handle HTTP errors (non-2xx)
  if (!response.ok) {
    if (isApiGet) {
      const cached = await getCached(url);
      if (cached) return cached;
    }
    return handleHttpError(response);
  }

  // 5. Success → cache GET responses, return parsed body
  if (isApiGet) {
    try { await setCached(url, await response.clone().json()); } catch (_) {}
  }
  try { BackendHealth.clearFailure(); } catch (_) {}
  const isJson = response.headers.get('content-type')?.includes('application/json');
  return isJson ? await response.json() : null;
}

// ─── Error handlers ───

function handleHttpError(response) {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (isJson) {
    return response.json().then(body => {
      const err = new Error(body?.message || response.statusText);
      err.code = body?.code;
      try { err.body = body; } catch (_) {}
      if (body?.referencedBy) { try { err.referencedBy = body.referencedBy; } catch (_) {} }
      const skipCodes = ['NO_USERS', 'NO_SESSION', 'INVALID_EMAIL', 'INVALID_PASSWORD', 'INCORRECT_EMAIL', 'INCORRECT_PASSWORD', 'IMAGE_IN_USE'];
      if (!skipCodes.includes(body?.code)) {
        showToast(body?.message || 'An unexpected error occurred');
      }
      if (body?.code !== 'IMAGE_IN_USE') console.error('API error:', body);
      throw err;
    });
  }
  showToast('An unexpected error occurred');
  try { BackendHealth.clearFailure(); } catch (_) {}
  throw new Error(response.statusText);
}

function handleNetworkError(error) {
  if (!navigator.onLine) {
    showToast('No internet connection.');
    try { BackendHealth.markFailure(); } catch (_) {}
    console.error('Network error:', error);
    throw error;
  }
  if (error instanceof TypeError && (
    error.message.includes('fetch') ||
    error.message.includes('Load failed') ||
    error.message.includes('NetworkError')
  )) {
    showToast('Connection failed.');
    try { BackendHealth.markFailure(); } catch (_) {}
    console.error('Fetch error:', error);
    throw error;
  }
  throw error;
}

// ─── Users ───

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

// ─── Focus Modes ───

async function getFocusModes() {
  const resp = await request('GET', '/api/focus');
  return Array.isArray(resp) ? resp : [];
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

// ─── Notes ───

async function getNotes(tagId, focusId, isArchived, isDeleted, page, isUntagged) {
  let url = "/api/notes/";
  const params = new URLSearchParams();
  if (tagId) params.append('tagId', tagId);
  else if (focusId) params.append('focusId', focusId);
  if (isUntagged === true) params.append('isUntagged', "true");
  if (page) params.append('page', page);
  if (isArchived) params.append('isArchived', "true");
  else if (isDeleted) params.append('isDeleted', "true");
  if (params.toString()) url += '?' + params.toString();

  const resp = await request('GET', url);
  try {
    const arr = Array.isArray(resp?.notes) ? resp.notes : (Array.isArray(resp) ? resp : []);
    for (const n of arr) { await NotesCache.set(n); }
  } catch (_) {}
  return resp;
}

async function getNoteById(noteId) {
  // Circuit-breaker: if recent failures and cache exists, skip network
  try {
    const lastFail = parseInt(sessionStorage.getItem('api_fail_notes_detail') || '0', 10);
    if (Date.now() - lastFail < 30000) {
      const cached = await getNoteCacheFallback(`/api/notes/${noteId}`);
      if (cached) return cached;
    }
  } catch (_) {}

  try {
    const note = await request('GET', `/api/notes/${noteId}`);
    try { await NotesCache.set(note); } catch (_) {}
    return note;
  } catch (e) {
    try { sessionStorage.setItem('api_fail_notes_detail', String(Date.now())); } catch (_) {}
    const cached = await getNoteCacheFallback(`/api/notes/${noteId}`);
    if (cached) return cached;
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

async function bulkAddTag(ids, tagId, tagName) {
  return await request('PUT', '/api/notes/bulk/tag/', { ids, tagId, tagName });
}

async function bulkRemoveTag(ids, tagId) {
  return await request('DELETE', '/api/notes/bulk/tag/', { ids, tagId });
}

async function unarchiveNote(noteId) {
  return await request('PUT', `/api/notes/${noteId}/unarchive/`);
}

async function getBacklinks(noteId) {
  return await request('GET', `/api/notes/${noteId}/backlinks/`);
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

// ─── Tags ───

async function getTags(focusId, isArchived, isDeleted, section) {
  let url = "/api/tags";
  const params = [];
  if (focusId) params.push('focusId=' + focusId);
  if (isArchived) params.push('isArchived=true');
  if (isDeleted) params.push('isDeleted=true');
  if (section) params.push('section=' + section);
  if (params.length) url += '?' + params.join('&');

  const resp = await request('GET', url);
  if (resp?.tags && Array.isArray(resp.tags)) {
    window.__untaggedCount = resp.untaggedCount;
    return resp.tags;
  }
  window.__untaggedCount = resp?.untaggedCount || 0;
  return [];
}

async function searchTags(query) {
  const resp = await request('GET', `/api/tags?query=${query}`);
  if (resp?.tags && Array.isArray(resp.tags)) return resp.tags;
  return [];
}

async function updateTag(tag) {
  return await request('PUT', `/api/tags/${tag.tagId}`, tag);
}

async function deleteTag(tagId) {
  return await request('DELETE', `/api/tags/${tagId}`);
}

async function reorderTags(order) {
  return await request('PUT', '/api/tags/reorder/', { order });
}

async function moveTag(tagId, parentId, parentName) {
  return await request('PATCH', `/api/tags/${tagId}/parent/`, { parentId, parentName });
}

// ─── AI ───

async function getAIConfigs() {
  const resp = await request('GET', '/api/ai/configs/');
  return Array.isArray(resp) ? resp : [];
}

async function createAIConfig(config) {
  return await request('POST', '/api/ai/configs/', config);
}

async function updateAIConfig(configId, config) {
  return await request('PUT', `/api/ai/configs/${configId}/`, config);
}

async function deleteAIConfig(configId) {
  return await request('DELETE', `/api/ai/configs/${configId}/`);
}

async function setDefaultAIConfig(configId) {
  return await request('PUT', `/api/ai/configs/${configId}/default/`);
}

async function processWithAI(configId, instruction, fullContent, selectedText) {
  return await request('POST', '/api/ai/process/', { configId, instruction, fullContent, selectedText });
}

async function fetchAIModels(baseUrl, apiKey, skipTlsVerify) {
  const resp = await request('POST', '/api/ai/models/', { baseUrl, apiKey, skipTlsVerify: skipTlsVerify || false });
  return Array.isArray(resp) ? resp : [];
}

// ─── Images ───

async function getImages(tagId, focusId, page) {
  let url = "/api/images/";
  const params = new URLSearchParams();
  if (tagId) params.append('tagId', tagId);
  else if (focusId) params.append('focusId', focusId);
  if (page) params.append('page', page);
  if (params.toString()) url += '?' + params.toString();

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

async function deleteImage(filename) {
  return await request('DELETE', `/api/images/${encodeURIComponent(filename)}/`);
}

async function forceDeleteImage(filename) {
  return await request('DELETE', `/api/images/${encodeURIComponent(filename)}/?force=true`);
}

async function cleanupImages() {
  return await request('POST', '/api/images/cleanup');
}

// ─── Search ───

async function search(query) {
  return await request('GET', `/api/search?query=${query}`);
}

// ─── Intelligence ───

async function getSimilarImages(filename) {
  return await request('GET', `/api/intelligence/similarity/images/${filename}/`);
}

// ─── Import / Export ───

async function importFile(formData) {
  return await request('POST', '/api/import/', formData);
}

async function exportNotes() {
  const response = await fetch('/api/export/', { method: 'GET', headers: {} });
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'zen-export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

// ─── Templates ───

async function getTemplates(tagId, isUntagged) {
  let url = "/api/templates/";
  const params = [];
  if (tagId) params.push('tagId=' + tagId);
  if (isUntagged) params.push('isUntagged=true');
  if (params.length) url += '?' + params.join('&');
  return await request('GET', url);
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

// ─── MCP Tokens ───

async function getTokens() {
  return await request('GET', '/api/mcp/tokens/');
}

async function createToken(payload) {
  return await request('POST', '/api/mcp/tokens/', payload);
}

async function deleteToken(tokenId) {
  return await request('DELETE', `/api/mcp/tokens/${tokenId}/`);
}

// ─── Canvases ───

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
  bulkAddTag,
  bulkRemoveTag,
  unarchiveNote,
  getBacklinks,
  pinNote,
  unpinNote,
  clearTrash,
  getTags,
  searchTags,
  updateTag,
  deleteTag,
  reorderTags,
  moveTag,
  getAIConfigs,
  createAIConfig,
  updateAIConfig,
  deleteAIConfig,
  setDefaultAIConfig,
  processWithAI,
  fetchAIModels,
  getImages,
  uploadImage,
  deleteImage,
  forceDeleteImage,
  cleanupImages,
  search,
  getSimilarImages,
  importFile,
  exportNotes,
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
};