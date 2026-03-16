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

      // Must start with :::
      if (pos + 3 > max) return false;
      if (state.src.slice(pos, pos + 3) !== ':::') return false;
      pos += 3;

      // Info string after :::
      var params = state.src.slice(pos, max).trim();
      if (!params || (name && !params.startsWith(name))) return false;

      // Extract title (text after type)
      var info = params.slice(name.length).trim();

      // Find the closing :::
      var nextLine = startLine;
      for (;;) {
        nextLine++;
        if (nextLine >= endLine) return false; // no closing mark
        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];
        if (pos < max && state.src.slice(pos, pos + 3) === ':::') {
          var after = state.src.slice(pos + 3, max).trim();
          if (after === '') break;
        }
      }

      if (silent) return true;

      // Open token
      var token = state.push('container_' + name + '_open', 'div', 1);
      token.markup = ':::';
      token.block = true;
      token.info = info;
      token.map = [startLine, nextLine];

      // Tokenize inside
      state.md.block.tokenize(state, startLine + 1, nextLine);

      // Close token
      token = state.push('container_' + name + '_close', 'div', -1);
      token.markup = ':::';
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
