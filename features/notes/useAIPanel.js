import { useState, useRef, useLayoutEffect } from "../../assets/preact.esm.js";

export default function useAIPanel({ textareaRef, updateContent, pendingCursorPos, noteId }) {
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiSelectedText, setAiSelectedText] = useState("");
  const aiSavedSelection = useRef(null); // { start, end } saved before opening AI panel

  // Keep the side panel open between notes, but never carry a selection or
  // conversation from one note into another.
  useLayoutEffect(() => {
    setAiMessages([]);
    setAiSelectedText("");
    aiSavedSelection.current = null;
  }, [noteId]);

  function captureCurrentSelection() {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const selectedText = textareaRef.current.value.substring(start, end);
      aiSavedSelection.current = { start, end };
      setAiSelectedText(selectedText);
      return selectedText;
    } else {
      setAiSelectedText("");
      return "";
    }
  }

  function handleOpenAI() {
    // Save the current CodeMirror selection before the assistant takes focus.
    captureCurrentSelection();
    setShowAIModal(true);
  }

  function handleAIInsert(text) {
    if (textareaRef.current) {
      const ta = textareaRef.current;
      const pos = ta.selectionStart;
      const before = ta.value.substring(0, pos);
      const after = ta.value.substring(ta.selectionEnd);
      updateContent(before + text + after);
    }
    setAiSelectedText("");
    setShowAIModal(false);
  }

  function handleAIReplace(text) {
    // Replace selected text (saved when AI panel opened) with AI result
    const sel = aiSavedSelection.current;
    if (textareaRef.current && sel && sel.start !== sel.end) {
      const ta = textareaRef.current;
      const before = ta.value.substring(0, sel.start);
      const after = ta.value.substring(sel.end);
      updateContent(before + text + after);
      pendingCursorPos.current = { start: sel.start + text.length, end: sel.start + text.length };
    } else {
      // No selection — replace entire content
      updateContent(text);
    }
    aiSavedSelection.current = null;
    setAiSelectedText("");
    setShowAIModal(false);
    setTimeout(() => { if (textareaRef.current) textareaRef.current.focus(); }, 50);
  }

  function handleCloseAI() {
    setAiSelectedText("");
    setShowAIModal(false);
    setTimeout(() => { if (textareaRef.current) textareaRef.current.focus(); }, 50);
  }

  return {
    showAIModal,
    aiMessages,
    setAiMessages,
    aiSelectedText,
    aiSavedSelection,
    captureCurrentSelection,
    handleOpenAI,
    handleAIInsert,
    handleAIReplace,
    handleCloseAI,
  };
}
