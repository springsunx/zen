import { t } from "../i18n/index.js";

const STORAGE_KEY = "zen.aiQuickPrompts";

function defaults() {
  return [
    { id: "summary", label: t("ai.preview.summary"), instruction: t("ai.preview.summaryPrompt"), enabled: true },
    { id: "key-points", label: t("ai.preview.keyPoints"), instruction: t("ai.preview.keyPointsPrompt"), enabled: true },
    { id: "todos", label: t("ai.preview.todos"), instruction: t("ai.preview.todosPrompt"), enabled: true },
    { id: "check-errors", label: t("ai.preview.checkErrors"), instruction: t("ai.preview.checkErrorsPrompt"), enabled: true },
  ];
}

function normalize(list) {
  if (!Array.isArray(list)) return null;
  const items = list
    .filter(item => item && typeof item.id === "string" && typeof item.label === "string" && typeof item.instruction === "string")
    .map(item => ({ id: item.id, label: item.label, instruction: item.instruction, enabled: item.enabled !== false }));
  return items;
}

export function getAIQuickPrompts() {
  try {
    const saved = normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (saved) return saved;
  } catch {}
  return defaults();
}

export function saveAIQuickPrompts(prompts) {
  const normalized = normalize(prompts) || defaults();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  window.dispatchEvent(new Event("ai-quick-prompts:change"));
  return normalized;
}

export function resetAIQuickPrompts() {
  const prompts = defaults();
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  window.dispatchEvent(new Event("ai-quick-prompts:change"));
  return prompts;
}
