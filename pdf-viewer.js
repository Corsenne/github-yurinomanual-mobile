const params = new URLSearchParams(window.location.search);
const source = params.get("src") || "";
const title = params.get("title") || "PDF";
const mode = params.get("mode") === "disaster" ? "disaster" : "pocket";
const backButton = document.querySelector("#viewerBackButton");
const titleElement = document.querySelector("#pdfTitle");
const viewer = document.querySelector("#standalonePdfViewer");
const error = document.querySelector("#pdfError");

function safePdfUrl(path) {
  try {
    const url = new URL(path, window.location.href);
    const pdfRoot = new URL("assets/pdfs/", window.location.href);
    if (url.origin !== pdfRoot.origin || !url.pathname.startsWith(pdfRoot.pathname) || !url.pathname.toLowerCase().endsWith(".pdf")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = `index.html#${mode}`;
}

const pdfUrl = safePdfUrl(source);
titleElement.textContent = title;
document.title = `${title} | 医療安全マニュアル必携 β版`;
backButton.addEventListener("click", goBack);

if (pdfUrl) {
  viewer.src = `${pdfUrl.href}#toolbar=1&navpanes=0&view=FitH&zoom=page-width`;
  viewer.title = title;
} else {
  viewer.hidden = true;
  error.hidden = false;
}