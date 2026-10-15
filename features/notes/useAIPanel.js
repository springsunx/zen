import { useState, useRef } from "../../assets/preact.esm.js";

export default function useAIPanel({ textareaRef, updateContent, pendingCursorPos }) {
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiSelectedText, setAiSelectedText] = useState("");
  const aiSavedSelection = useRef(null); // { start, end } saved before opening AI panel

  function handleOpenAI() {
    // Save current textarea selection before AI panel takes focus
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      aiSavedSelection.current = { start, end };
      setAiSelectedText(textareaRef.current.value.substring(start, end));
    } else {
      setAiSelectedText("");
    }
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
    handleOpenAI,
    handleAIInsert,
    handleAIReplace,
    handleCloseAI,
  };
}
