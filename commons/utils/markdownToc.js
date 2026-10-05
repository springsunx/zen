// Unified Markdown ID & TOC utilities (pure functions)
export function generateId(text) {
  if (!text) return 'heading';
  const out = String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return out || 'heading';
}

export function cleanCustomId(id) {
  if (!id) return '';
  return String(id)
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[\x00-\x1F\x7F<>"']/g, '')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .replace(/-+/g, '-');
}

export function extractCustomId(text) {
  if (!text) return { cleanedText: text, customId: null };
  const match = String(text).match(/\s*\{#([^}]+)\}\s*$/);
  if (!match) return { cleanedText: String(text).trim(), customId: null };
  const id = cleanCustomId(match[1]);
  if (!id) return { cleanedText: String(text).trim(), customId: null };
  const cleanedText = String(text).substring(0, match.index).trim();
  return { cleanedText, customId: id };
}

function cleanMarkdownLinks(text) {
  if (!text) return text;
  const linkRegex = /\[([^\]]+?)\]\([^)]+\)/g;
  return String(text).replace(linkRegex, '$1').trim();
}

export function normalizeId(x) {
  return String(x || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[\.:]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function expandAnchorCandidates(idRaw) {
  const out = [];
  const uniq = new Set();
  const push = (v) => { if (v && !uniq.has(v)) { uniq.add(v); out.push(v); } };
  push(idRaw);
  try { push(decodeURIComponent(idRaw)); } catch {}
  push(String(idRaw).trim().toLowerCase().replace(/\s+/g, '-').replace(/^-+|-+$/g, ''));
  return out;
}

export function findAnchor(root, idRaw) {
  const candidates = expandAnchorCandidates(idRaw);
  const all = (root || document).querySelectorAll('[id]');
  const norm = normalizeId;
  let element = null;
  for (const cid of candidates) {
    try { element = (root || document).getElementById ? (root || document).getElementById(cid) : (root || document).querySelector('[id="'+cid+'"]'); } catch {}
    if (element) break;
    const c = norm(cid);
    for (const el of all) {
      const e = norm(el.id);
      if (e === c) { element = el; break; }
      const dash = e.indexOf('-');
      if (dash > 0 && e.substring(dash + 1) === c) { element = el; break; }
    }
    if (element) break;
  }
  return element;
}
// Build markdown-it heading_open rule based on unified helpers
export function buildHeadingOpen(opts = {}) {
  return function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    // find inline token until heading_close
    let headingText = '';
    let inlineToken = null;
    for (let i = idx + 1; i < tokens.length && tokens[i].type !== 'heading_close'; i++) {
      if (tokens[i].type === 'inline') { inlineToken = tokens[i]; headingText = inlineToken.content; break; }
    }
    if (headingText && inlineToken) {
      const { cleanedText, customId } = extractCustomId(headingText);
      const id = customId || generateId(headingText);
      if (!opts.stripHeadingIds) {
        // set id if not exists
        const attrs = token.attrs || (token.attrs = []);
        let hasId = false;
        for (const a of attrs) { if (a[0] === 'id') { hasId = true; break; } }
        if (!hasId && id) token.attrSet('id', id);
        if (opts.anchorPrefix) {
          const idAttr = token.attrs?.find(a => a[0] === 'id');
          if (idAttr && idAttr[1] && !idAttr[1].startsWith(opts.anchorPrefix)) {
            idAttr[1] = opts.anchorPrefix + idAttr[1];
          }
        }
      }
      if (cleanedText !== headingText) {
        inlineToken.content = cleanedText;
        if (inlineToken.children) {
          inlineToken.children = inlineToken.children.filter(child => {
            if (child.type !== 'text') return true;
            const { cleanedText: childCleaned } = extractCustomId(child.content);
            if (childCleaned) child.content = childCleaned;
            return childCleaned !== '';
          });
          if (inlineToken.children.length === 0) {
            inlineToken.children.push({ type: 'text', content: '' });
          }
        }
      }
    }
    return self.renderToken(tokens, idx, options);
  };
}

// Check if a URL points to a video attachment
export function isVideoAttachmentLink(url) {
  if (!url) return false;
  try {
    const pathname = url.split('?')[0].split('#')[0].toLowerCase();
    return pathname.startsWith('/attachments/') && VIDEO_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.m4v'];

// Parse video size from link text, e.g. "alt text =500x300" → { label: "alt text", width: "500", height: "300" }
// Compatible with imgSize plugin new syntax: =WIDTHxHEIGHT, =WIDTHx, =xHEIGHT
function parseVideoSizeFromText(text) {
  if (!text) return null;
  const s = String(text);
  const eqIdx = s.lastIndexOf('=');
  if (eqIdx === -1 || eqIdx + 3 > s.length) return null;
  // '=' must be preceded by whitespace or be at position 0
  if (eqIdx !== 0 && s.charCodeAt(eqIdx - 1) !== 32 && s.charCodeAt(eqIdx - 1) !== 9) return null;

  let pos = eqIdx + 1;
  let width = null;
  let height = null;

  // parse digits for width
  if (pos < s.length && s.charCodeAt(pos) >= 48 && s.charCodeAt(pos) <= 57) {
    const start = pos;
    while (pos < s.length && s.charCodeAt(pos) >= 48 && s.charCodeAt(pos) <= 57) pos++;
    width = s.slice(start, pos);
    if (pos >= s.length || s.charCodeAt(pos) !== 120) return null; // must have 'x'
    pos++;
  } else if (pos < s.length && s.charCodeAt(pos) === 120) {
    pos++; // skip 'x' for =xHEIGHT
  } else {
    return null;
  }

  // parse digits for height
  if (pos < s.length) {
    const start = pos;
    while (pos < s.length && s.charCodeAt(pos) >= 48 && s.charCodeAt(pos) <= 57) pos++;
    if (pos > start) height = s.slice(start, pos);
  }

  // remaining must be whitespace
  while (pos < s.length) {
    if (s.charCodeAt(pos) !== 32 && s.charCodeAt(pos) !== 9) return null;
    pos++;
  }

  if (!width && !height) return null;

  const label = s.slice(0, eqIdx).trimEnd();
  return { label, width, height };
}

// Build markdown-it link_open rule based on unified helpers
export function buildLinkOpen(opts = {}) {
  return function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefAttr = token.attrs?.find(attr => attr[0] === 'href');
    if (hrefAttr) {
      // Video attachment: replace link with <video> element
      if (isVideoAttachmentLink(hrefAttr[1])) {
        env._isVideoLink = true;
        const src = hrefAttr[1];
        let attrs = `controls preload="metadata" src="${src}"`;

        // Parse size from text token: [text =500x300](url)
        const textToken = tokens[idx + 1];
        if (textToken && textToken.type === 'text') {
          const sizeInfo = parseVideoSizeFromText(textToken.content);
          if (sizeInfo) {
            if (sizeInfo.width) attrs += ` width="${sizeInfo.width}"`;
            if (sizeInfo.height) attrs += ` height="${sizeInfo.height}"`;
            // Remove size suffix from text token
            textToken.content = sizeInfo.label;
          }
        }

        return `<video ${attrs}>`;
      }

      env._isVideoLink = false;

      if (hrefAttr[1].startsWith('#')) {
        token.attrPush(['class', 'internal-anchor-link']);
        token.attrPush(['data-anchor-link', 'true']);
        if (opts.anchorPrefix) {
          const raw = hrefAttr[1].replace(/^#/, '');
          token.attrSet('href', '#' + opts.anchorPrefix + raw);
        }
      } else {
        const match = hrefAttr[1].match(/^\/notes\/(\d+)$/);
        if (match) {
          token.attrSet('data-note-id', match[1]);
        } else {
          token.attrSet('target', '_blank');
          token.attrSet('rel', 'noopener noreferrer');
        }
      }
    }
    return self.renderToken(tokens, idx, options);
  };
}

// Build markdown-it link_close rule that handles video tags
export function buildLinkClose() {
  return function(tokens, idx, options, env, self) {
    if (env._isVideoLink === true) {
      env._isVideoLink = false;
      return '</video>';
    }
    return self.renderToken(tokens, idx, options);
  };
}