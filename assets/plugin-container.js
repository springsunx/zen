(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.mdItPluginContainer = factory();
  }
}(this, function () {
  // Minimal container plugin compatible with markdown-it
  function containerPlugin(md, name, opts) {
    opts = opts || {};

    function containerRule(state, startLine, endLine, silent) {
      // Ignore if indented as code
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;

      var pos = state.bMarks[startLine] + state.tShift[startLine];
      var max = state.eMarks[startLine];

      // Accept markers with 3 or more colons (::: or ::::)
      var markerPos = state.bMarks[startLine] + state.tShift[startLine];
      var lineMax = state.eMarks[startLine];
      // Count leading colons
      var colonCount = 0;
      while (markerPos + colonCount < lineMax && state.src.charCodeAt(markerPos + colonCount) === 0x3A /* : */) {
        colonCount++;
      }
      if (colonCount < 3) return false;
      var markerStr = state.src.slice(markerPos, markerPos + colonCount);
      var pos = markerPos + colonCount;
      // Params after marker
      var params = state.src.slice(pos, lineMax).trim();
if (!params) return false;
var firstSpace = params.indexOf(' ');
var typeName = (firstSpace === -1 ? params : params.slice(0, firstSpace)).toLowerCase();
if (opts.validate && typeof opts.validate === 'function') {
  if (!opts.validate(params)) return false;
} else if (name && typeName !== name) {
  return false;
}
// Title is whatever after the first token (type name)
var info = firstSpace === -1 ? '' : params.slice(firstSpace + 1).trim();
// Find the closing marker with the same colon count
      var nextLine = startLine;
      for (;;) {
        nextLine++;
        if (nextLine >= endLine) return false; // no closing mark
        var closePos = state.bMarks[nextLine] + state.tShift[nextLine];
        var closeMax = state.eMarks[nextLine];
        if (closePos < closeMax) {
          if (state.src.slice(closePos, closePos + colonCount) === markerStr) {
            var after = state.src.slice(closePos + colonCount, closeMax).trim();
            if (after === '') break;
          }
        }
      }
      if (silent) return true;
      // Open token
      var token = state.push('container_' + name + '_open', 'div', 1);
      token.markup = markerStr;
      token.block = true;
      token.info = info;
      token.map = [startLine, nextLine];
      // Tokenize inside
      state.md.block.tokenize(state, startLine + 1, nextLine);
      // Close token
      token = state.push('container_' + name + '_close', 'div', -1);
      token.markup = markerStr;
      token.block = true;
      state.line = nextLine + 1;
      return true;
      }
md.block.ruler.before('fence', 'container_' + name, containerRule, {
      alt: ['paragraph', 'reference', 'blockquote', 'list']
    });

    // Rendering hooks
    if (opts && typeof opts.render === 'function') {
      md.renderer.rules['container_' + name + '_open'] = function (tokens, idx) {
        return opts.render(tokens, idx);
      };
      md.renderer.rules['container_' + name + '_close'] = function (tokens, idx) {
        return opts.render(tokens, idx);
      };
    }
  }

  return { container: containerPlugin };
}));