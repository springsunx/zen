(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('katex'));
  } else if (typeof define === 'function' && define.amd) {
    define(['katex'], factory);
  } else {
    global.mdItPluginKatex = { katex: factory(global.katex) };
  }
}(this, function (katex) {
  'use strict';

  // Test if potential opening or closing delimiter
  // Assumes that there is a "$" at state.src[pos]
  function isValidDelim(state, pos) {
    var prevChar, nextChar,
      max = state.posMax,
      can_open = true,
      can_close = true;

    prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
    nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;

    // Check non-whitespace conditions for opening and closing, and
    // check that closing delimiter isn't followed by a number
    if (prevChar === 0x20 /* " " */ || prevChar === 0x09 /* \t */ ||
      (nextChar >= 0x30 /* "0" */ && nextChar <= 0x39 /* "9" */)) {
      can_close = false;
    }
    if (nextChar === 0x20 /* " " */ || nextChar === 0x09 /* \t */) {
      can_open = false;
    }

    return {
      can_open: can_open,
      can_close: can_close
    };
  }

  function math_inline(state, silent) {
    var start, match, token, res, pos, esc_count;

    if (state.src[state.pos] !== "$") { return false; }

    res = isValidDelim(state, state.pos);
    if (!res.can_open) {
      if (!silent) { state.pending += "$"; }
      state.pos += 1;
      return false;
    }

    // First check for and bypass all escaped delimiters
    // This loop will assume that the first leading backtick can not
    // be the first character in state.src, which is known since
    // we have found an opening delimiter already.
    start = state.pos + 1;
    match = start;
    while ((match = state.src.indexOf("$", match)) !== -1) {
      // Found potential $, look for escapes, pos will point to
      // first non escape when complete
      pos = match - 1;
      while (state.src[pos] === "\\") { pos -= 1; }
      // Even number of escapes, potential closing delimiter
      if (((match - pos) % 2) == 1) { break; }
      match += 1;
    }

    // No closing delimiter found.  Consume $ and continue.
    if (match === -1) {
      if (!silent) { state.pending += "$"; }
      state.pos = start;
      return false;
    }

    // Check if we have empty content, ie: $$.  Do not parse.
    if (match - start === 0) {
      if (!silent) { state.pending += "$$"; }
      state.pos = start + 1;
      return false;
    }

    // Check for valid closing delimiter
    res = isValidDelim(state, match);
    if (!res.can_close) {
      if (!silent) { state.pending += "$"; }
      state.pos = start;
      return false;
    }

    if (!silent) {
      token = state.push('math_inline', 'math', 0);
      token.markup = "$";
      token.content = state.src.slice(start, match);
    }

    state.pos = match + 1;
    return true;
  }

  function math_block(state, start, end, silent) {
    var firstLine, lastLine, next, lastPos, found = false, token,
      pos = state.bMarks[start] + state.tShift[start],
      max = state.eMarks[start];

    if (pos + 2 > max) { return false; }
    if (state.src.slice(pos, pos + 2) !== "$$") { return false; }

    pos += 2;
    firstLine = state.src.slice(pos, max);

    if (silent) { return true; }
    if (firstLine.trim().slice(-2) === "$$") {
      // Single line expression
      firstLine = firstLine.trim().slice(0, -2);
      found = true;
    }

    // Search for end of block
    for (next = start; !found; ) {
      next++;

      if (next >= end) { break; }

      pos = state.bMarks[next] + state.tShift[next];
      max = state.eMarks[next];

      if (pos < max && state.tShift[next] < state.blkIndent) {
        // non-empty line with negative indent should stop the list
        break;
      }

      if (state.src.slice(pos, max).trim().slice(-2) === "$$") {
        lastPos = state.src.slice(0, max).lastIndexOf("$$");
        lastLine = state.src.slice(pos, lastPos);
        found = true;
      }
    }

    if (!found) { return false; }

    state.line = next + 1;

    token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = (firstLine && firstLine.trim() ? firstLine + "\n" : "")
      + state.getLines(start + 1, next, state.tShift[start], true)
      + (lastLine && lastLine.trim() ? lastLine : "");
    token.map = [start, state.line];
    token.markup = "$$";
    return true;
  }

  // Render inline math
  function renderMathInline(tokens, idx) {
    try {
      return katex.renderToString(tokens[idx].content, {
        throwOnError: false,
        displayMode: false
      });
    } catch (err) {
      return '<span class="katex-error" title="' + err.message + '">' 
        + tokens[idx].content + '</span>';
    }
  }

  // Render block math
  function renderMathBlock(tokens, idx) {
    try {
      return katex.renderToString(tokens[idx].content, {
        throwOnError: false,
        displayMode: true
      });
    } catch (err) {
      return '<div class="katex-error" title="' + err.message + '">' 
        + tokens[idx].content + '</div>';
    }
  }

  // Main plugin function
  function katexPlugin(md, options) {
    options = options || {};

    // Set KaTeX options
    var katexOptions = {
      throwOnError: false,
      displayMode: false
    };

    if (options.throwOnError !== undefined) {
      katexOptions.throwOnError = options.throwOnError;
    }

    // Add inline math rule
    md.inline.ruler.after('escape', 'math_inline', math_inline);
    md.renderer.rules.math_inline = renderMathInline;

    // Add block math rule
    md.block.ruler.after('blockquote', 'math_block', math_block, {
      alt: ['paragraph', 'reference', 'blockquote', 'list']
    });
    md.renderer.rules.math_block = renderMathBlock;
  }

  return katexPlugin;
}));
