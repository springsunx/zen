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

export function cleanMarkdownLinks(text) {
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

export function extractHeadingsFromMarkdown(markdown) {
  if (!markdown) return [];
  const lines = String(markdown).split("\n");
  let inCode = false, fence = '';
  let inToc = false;
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.includes('<!-- toc:start -->')) { inToc = true; continue; }
    if (t.includes('<!-- toc:end -->')) { inToc = false; continue; }
    if (inToc) continue;
    if (t.startsWith('```') || t.startsWith('~~~')) {
      if (!inCode) { inCode = true; fence = t.slice(0, 3); }
      else if (t.startsWith(fence)) { inCode = false; fence = ''; }
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      const level = m[1].length;
      let text = m[2].trim();
      const { cleanedText, customId } = extractCustomId(text);
      text = cleanMarkdownLinks(cleanedText);
      out.push({ level, text, customId });
    }
  }
  return out;
}

export function buildTocMarkdown(headings, titleText) {
  if (!headings || headings.length === 0) return '';
  const minLevel = Math.min(...headings.map(h => h.level));
  const lines = [];
  lines.push('<!-- toc:start -->');
  lines.push(titleText);
  lines.push('===');
  for (const h of headings) {
    const indent = '  '.repeat(Math.max(0, h.level - minLevel));
    const id = h.customId || generateId(h.text);
    lines.push(`${indent}- [${h.text}](#${id})`);
  }
  lines.push('<!-- toc:end -->');
  return lines.join("\n");
}

export function injectOrReplaceToc(content, tocBlock) {
  const startIdx = content.indexOf('<!-- toc:start -->');
  const endMarker = '<!-- toc:end -->';
  const endIdx = content.indexOf(endMarker);
  const block = String(tocBlock || '').replace(/\s+$/, '') + "\n\n";
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    let after = endIdx + endMarker.length;
    while (after < content.length && (content[after] === "\n" || content[after] === "\r")) after++;
    return content.substring(0, startIdx) + block + content.substring(after);
  }
  const rest = content.replace(/^(?:\r?\n)+/, '');
  return block + rest;
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

// Build markdown-it link_open rule based on unified helpers
export function buildLinkOpen(opts = {}) {
  return function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefAttr = token.attrs?.find(attr => attr[0] === 'href');
    if (hrefAttr) {
      if (hrefAttr[1].startsWith('#')) {
        token.attrPush(['class', 'internal-anchor-link']);
        token.attrPush(['data-anchor-link', 'true']);
        if (opts.anchorPrefix) {
          const raw = hrefAttr[1].replace(/^#/, '');
          token.attrSet('href', '#' + opts.anchorPrefix + raw);
        }
      } else {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
    }
    return self.renderToken(tokens, idx, options);
  };
}
