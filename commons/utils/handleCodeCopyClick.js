import { showToast } from "../components/Toast.jsx";

const COPIED_DURATION = 2000;

export default function handleCodeCopyClick(e) {
  const button = e.target.closest('.code-copy-button');
  if (button === null) {
    return false;
  }

  const code = button.closest('.code-block')?.querySelector('pre code');
  if (code == null) {
    return false;
  }

  copyText(code.textContent)
    .then(() => {
      showCopiedState(button);
    })
    .catch(() => {
      showToast("Couldn't copy code.");
    });

  return true;
}

// The clipboard API only exists in a secure context, so an app served over plain HTTP
// on a non-loopback host would otherwise leave the button throwing on every click.
function copyText(text) {
  if (typeof navigator.clipboard !== "undefined") {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    try {
      textarea.select();
      document.execCommand("copy") ? resolve() : reject(new Error("copy was rejected"));
    } catch (error) {
      reject(error);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}

function showCopiedState(button) {
  if (button.dataset.copiedTimeoutId != null) {
    clearTimeout(parseInt(button.dataset.copiedTimeoutId, 10));
  }

  button.classList.add("is-copied");

  const timeoutId = setTimeout(() => {
    button.classList.remove("is-copied");
    delete button.dataset.copiedTimeoutId;
  }, COPIED_DURATION);

  button.dataset.copiedTimeoutId = timeoutId;
}
