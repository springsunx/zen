function useMarkdownFormatter({ textareaRef, setContent }) {
  function insertAtCursor(text) {
    if (textareaRef.current === null) {
      return;
    }

    const textarea = textareaRef.current;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const newPosition = startPos + text.length;
    textarea.replaceRange(startPos, endPos, text, newPosition);
    setContent(textarea.value);
    textarea.focus();
  }

  function applyMarkdownFormat(format) {
    if (textareaRef.current === null) {
      return;
    }

    const textarea = textareaRef.current;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const selectedText = textarea.value.substring(startPos, endPos);

    let formattedText = "";
    let cursorOffset = 0;

    switch (format) {
      case "bold":
        formattedText = `**${selectedText}**`;
        cursorOffset = selectedText ? formattedText.length : 2;
        break;
      case "italic":
        formattedText = `*${selectedText}*`;
        cursorOffset = selectedText ? formattedText.length : 1;
        break;
      case "strikethrough":
        formattedText = `~~${selectedText}~~`;
        cursorOffset = selectedText ? formattedText.length : 2;
        break;
      case "highlight":
        formattedText = `==${selectedText}==`;
        cursorOffset = selectedText ? formattedText.length : 2;
        break;
      case "code":
        formattedText = `\`${selectedText}\``;
        cursorOffset = selectedText ? formattedText.length : 1;
        break;
      case "codeblock":
        if (selectedText) {
          formattedText = `\`\`\`\n${selectedText}\n\`\`\``;
          cursorOffset = selectedText ? formattedText.length : 0;
        } else {
          formattedText = `\`\`\`\n\n\`\`\``;
          cursorOffset = 4; // position cursor inside the empty block
        }
        break;
      case "h1":
        formattedText = `# ${selectedText}`;
        cursorOffset = selectedText ? formattedText.length : 2;
        break;
      case "h2":
        formattedText = `## ${selectedText}`;
        cursorOffset = selectedText ? formattedText.length : 3;
        break;
      case "h3":
        formattedText = `### ${selectedText}`;
        cursorOffset = selectedText ? formattedText.length : 4;
        break;
      case "ul":
        formattedText = `- ${selectedText}`;
        cursorOffset = selectedText ? formattedText.length : 2;
        break;
      case "ol":
        formattedText = `1. ${selectedText}`;
        cursorOffset = selectedText ? formattedText.length : 3;
        break;
      case "todo":
        formattedText = `- [ ] ${selectedText}`;
        cursorOffset = selectedText ? formattedText.length : 6;
        break;
      case "quote":
        formattedText = `> ${selectedText}`;
        cursorOffset = selectedText ? formattedText.length : 2;
        break;
      case "hr":
        formattedText = `\n---\n`;
        cursorOffset = formattedText.length;
        break;
      case "link":
        if (selectedText) {
          formattedText = `[${selectedText}](url)`;
          cursorOffset = formattedText.length - 4; // Position cursor at "url"
        } else {
          formattedText = `[]()`;
          cursorOffset = 1;
        }
        break;
    }

    const newPosition = startPos + cursorOffset;
    textarea.replaceRange(startPos, endPos, formattedText, newPosition);
    setContent(textarea.value);
    textarea.focus();
  }

  return {
    insertAtCursor,
    applyMarkdownFormat
  };
}

export default useMarkdownFormatter;
