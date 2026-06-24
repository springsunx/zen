let pending = false;
let timeout = null;

export function requestEditMode() {
  pending = true;
  clearTimeout(timeout);
  timeout = setTimeout(() => { pending = false; }, 10000);
}

export function consumeEditMode() {
  if (pending) {
    pending = false;
    clearTimeout(timeout);
    return true;
  }
  return false;
}
