import * as pdfjsLib from "./vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";

const params = new URLSearchParams(window.location.search);
const source = params.get("src") || "";
const title = params.get("title") || "PDF";
const mode = params.get("mode") === "disaster" ? "disaster" : "pocket";
const serial = params.get("serial") || "";
const chapter = params.get("chapter") || "";
const initialPage = params.get("page") || "1";
const backButton = document.querySelector("#viewerBackButton");
const titleElement = document.querySelector("#pdfTitle");
const scrollArea = document.querySelector("#pdfCanvasScroll");
const pagesElement = document.querySelector("#pdfPages");
const loadingElement = document.querySelector("#pdfLoading");
const errorElement = document.querySelector("#pdfError");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomInButton = document.querySelector("#zoomInButton");
const zoomFitButton = document.querySelector("#zoomFitButton");
const zoomLabel = document.querySelector("#zoomLabel");
const previousPageButton = document.querySelector("#previousPageButton");
const nextPageButton = document.querySelector("#nextPageButton");
const pageLabel = document.querySelector("#pageLabel");

let pdfDocument = null;
let fitScale = 1;
let scale = 1;
let generation = 0;
let pageObserver = null;
let resizeTimer = 0;
let scrollFrame = 0;
let currentPage = 1;
let pinchStartDistance = 0;
let pinchStartScale = 1;
let pinchTargetScale = 1;
let wasPinching = false;
const pointers = new Map();
const renderTasks = new Set();

function itemLabel(item) {
  if (mode === "disaster") {
    return item.number && item.number !== "0" ? `${item.number}. ${item.title}` : item.title;
  }
  return [item.itemNo, item.title].filter(Boolean).join("  ");
}

function chapterItems() {
  const archive = window.MANUAL_ARCHIVE || {};
  if (mode === "disaster") {
    return archive.disasterManual?.items || [];
  }
  const items = archive.pocketManual?.items || [];
  const current = items.find((item) => item.serial === serial);
  const chapterNo = chapter || current?.chapterNo || "";
  return chapterNo ? items.filter((item) => item.chapterNo === chapterNo) : [];
}

const manualItems = chapterItems();
const currentItemIndex = manualItems.findIndex((item) => item.serial === serial);

function goToItem(index, page = "1") {
  const item = manualItems[index];
  if (!item) {
    return;
  }
  const nextParams = new URLSearchParams({
    src: item.pdfPath,
    title: itemLabel(item),
    mode,
    serial: item.serial,
  });
  if (mode === "pocket" && item.chapterNo) {
    nextParams.set("chapter", item.chapterNo);
  }
  nextParams.set("page", page);
  window.location.href = `pdf-viewer.html?${nextParams.toString()}`;
}

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
  window.location.href = "index.html";
}

function clampScale(value) {
  return Math.min(fitScale * 4, Math.max(fitScale * 0.5, value));
}

function updateZoomControls(displayScale = scale) {
  const ratio = displayScale / fitScale;
  zoomLabel.textContent = `${Math.round(ratio * 100)}%`;
  zoomOutButton.disabled = ratio <= 0.51;
  zoomInButton.disabled = ratio >= 3.99;
}

function updatePageControls() {
  const totalPages = pdfDocument?.numPages || 1;
  const hasCurrentItem = currentItemIndex >= 0;
  const isFirstItem = !hasCurrentItem || currentItemIndex === 0;
  const isLastItem = !hasCurrentItem || currentItemIndex === manualItems.length - 1;
  currentPage = Math.min(totalPages, Math.max(1, currentPage));
  pageLabel.textContent = hasCurrentItem
    ? `資料 ${currentItemIndex + 1}/${manualItems.length}・${currentPage}/${totalPages}ページ`
    : `${currentPage} / ${totalPages}`;
  previousPageButton.disabled = currentPage <= 1 && isFirstItem;
  nextPageButton.disabled = currentPage >= totalPages && isLastItem;
}

function updateCurrentPageFromScroll() {
  if (!pdfDocument) {
    return;
  }
  const marker = scrollArea.scrollTop + scrollArea.clientHeight * 0.35;
  let visiblePage = 1;
  for (const sheet of pagesElement.querySelectorAll(".pdf-page-sheet")) {
    if (sheet.offsetTop <= marker) {
      visiblePage = Number(sheet.dataset.pageNumber);
    } else {
      break;
    }
  }
  if (visiblePage !== currentPage) {
    currentPage = visiblePage;
    updatePageControls();
  }
}

function goToPage(pageNumber, behavior = "smooth") {
  if (!pdfDocument) {
    return;
  }
  const targetPage = Math.min(pdfDocument.numPages, Math.max(1, pageNumber));
  const sheet = pagesElement.querySelector(`[data-page-number="${targetPage}"]`);
  if (!sheet) {
    return;
  }
  currentPage = targetPage;
  updatePageControls();
  scrollArea.scrollTo({ top: Math.max(0, sheet.offsetTop - 8), behavior });
}

function goPrevious() {
  if (!pdfDocument) {
    return;
  }
  if (currentPage > 1) {
    goToPage(currentPage - 1);
    return;
  }
  goToItem(currentItemIndex - 1, "last");
}

function goNext() {
  if (!pdfDocument) {
    return;
  }
  if (currentPage < pdfDocument.numPages) {
    goToPage(currentPage + 1);
    return;
  }
  goToItem(currentItemIndex + 1);
}

function cancelRendering() {  for (const task of renderTasks) {
    task.cancel();
  }
  renderTasks.clear();
}

async function renderPage(record, expectedGeneration) {
  if (record.rendered || record.rendering || expectedGeneration !== generation) {
    return;
  }
  record.rendering = true;
  const canvas = document.createElement("canvas");
  const outputScale = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.className = "pdf-page-canvas";
  canvas.width = Math.floor(record.viewport.width * outputScale);
  canvas.height = Math.floor(record.viewport.height * outputScale);
  canvas.style.width = `${Math.ceil(record.viewport.width)}px`;
  canvas.style.height = `${Math.ceil(record.viewport.height)}px`;
  canvas.setAttribute("aria-label", `${record.pageNumber}ページ`);
  record.element.append(canvas);
  const context = canvas.getContext("2d", { alpha: false });
  const renderTask = record.page.render({
    canvasContext: context,
    viewport: record.viewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
  });
  renderTasks.add(renderTask);
  try {
    await renderTask.promise;
    if (expectedGeneration === generation) {
      record.rendered = true;
      record.element.querySelector(".pdf-page-placeholder")?.remove();
    }
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") {
      record.element.classList.add("has-render-error");
    }
  } finally {
    renderTasks.delete(renderTask);
    record.rendering = false;
  }
}

function scrollRatios() {
  return {
    x: (scrollArea.scrollLeft + scrollArea.clientWidth / 2) / Math.max(scrollArea.scrollWidth, 1),
    y: (scrollArea.scrollTop + scrollArea.clientHeight / 2) / Math.max(scrollArea.scrollHeight, 1),
  };
}

function restoreScroll(ratios) {
  scrollArea.scrollLeft = ratios.x * scrollArea.scrollWidth - scrollArea.clientWidth / 2;
  scrollArea.scrollTop = ratios.y * scrollArea.scrollHeight - scrollArea.clientHeight / 2;
}

async function buildPages(nextScale, ratios = { x: 0.5, y: 0 }) {
  scale = clampScale(nextScale);
  const currentGeneration = ++generation;
  cancelRendering();
  pageObserver?.disconnect();
  pagesElement.replaceChildren();
  pagesElement.style.transform = "";
  scrollArea.setAttribute("aria-busy", "true");
  updateZoomControls();

  pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          renderPage(entry.target.pdfRecord, currentGeneration);
        }
      }
    },
    { root: scrollArea, rootMargin: "600px 200px" },
  );

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (currentGeneration !== generation) {
      return;
    }
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const pageElement = document.createElement("section");
    const placeholder = document.createElement("span");
    pageElement.className = "pdf-page-sheet";
    pageElement.dataset.pageNumber = String(pageNumber);
    pageElement.style.width = `${Math.ceil(viewport.width)}px`;
    pageElement.style.height = `${Math.ceil(viewport.height)}px`;
    placeholder.className = "pdf-page-placeholder";
    placeholder.textContent = `${pageNumber} / ${pdfDocument.numPages}`;
    pageElement.append(placeholder);
    pageElement.pdfRecord = { page, viewport, pageNumber, element: pageElement, rendering: false, rendered: false };
    pagesElement.append(pageElement);
    pageObserver.observe(pageElement);
  }

  requestAnimationFrame(() => {
    restoreScroll(ratios);
    scrollArea.setAttribute("aria-busy", "false");
    loadingElement.hidden = true;    updateCurrentPageFromScroll();

  });
}

async function setScale(nextScale) {
  if (!pdfDocument) {
    return;
  }
  const ratios = scrollRatios();
  await buildPages(nextScale, ratios);
}

function pointerDistance() {
  const values = [...pointers.values()];
  if (values.length < 2) {
    return 0;
  }
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

scrollArea.addEventListener("scroll", () => {
  if (scrollFrame) {
    return;
  }
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    updateCurrentPageFromScroll();
  });
});

scrollArea.addEventListener("pointerdown", (event) => {
  scrollArea.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    pinchStartDistance = pointerDistance();
    pinchStartScale = scale;
    pinchTargetScale = scale;
    wasPinching = true;
  }
});

scrollArea.addEventListener("pointermove", (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) {
    return;
  }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) {
    event.preventDefault();
    const distance = pointerDistance();
    pinchTargetScale = clampScale(pinchStartScale * (distance / Math.max(pinchStartDistance, 1)));
    pagesElement.style.transform = `scale(${pinchTargetScale / scale})`;
    updateZoomControls(pinchTargetScale);
    return;
  }
  if (!wasPinching) {
    scrollArea.scrollLeft -= event.clientX - previous.x;
    scrollArea.scrollTop -= event.clientY - previous.y;
  }
});

async function endPointer(event) {
  pointers.delete(event.pointerId);
  if (wasPinching && pointers.size < 2) {
    const target = pinchTargetScale;
    pagesElement.style.transform = "";
    wasPinching = false;
    await setScale(target);
  }
}

scrollArea.addEventListener("pointerup", endPointer);
scrollArea.addEventListener("pointercancel", endPointer);
scrollArea.addEventListener("wheel", (event) => {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }
  event.preventDefault();
  setScale(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
}, { passive: false });

zoomOutButton.addEventListener("click", () => setScale(scale / 1.25));
zoomInButton.addEventListener("click", () => setScale(scale * 1.25));
zoomFitButton.addEventListener("click", () => setScale(fitScale));
previousPageButton.addEventListener("click", goPrevious);
nextPageButton.addEventListener("click", goNext);
backButton.addEventListener("click", goBack);

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    if (!pdfDocument) {
      return;
    }
    const relativeScale = scale / fitScale;
    const firstPage = await pdfDocument.getPage(1);
    fitScale = Math.max((scrollArea.clientWidth - 16) / firstPage.getViewport({ scale: 1 }).width, 0.1);
    await setScale(fitScale * relativeScale);
  }, 180);
});

async function loadPdf() {
  const pdfUrl = safePdfUrl(source);
  titleElement.textContent = title;
  document.title = `${title} | 医療安全マニュアル必携 β版`;
  if (!pdfUrl) {
    loadingElement.hidden = true;
    errorElement.hidden = false;
    return;
  }
  try {
    pdfDocument = await pdfjsLib.getDocument({
      url: pdfUrl.href,
      useSystemFonts: true,
    }).promise;
    const targetInitialPage = Math.min(
      pdfDocument.numPages,
      Math.max(1, initialPage === "last" ? pdfDocument.numPages : Number(initialPage) || 1),
    );
    currentPage = targetInitialPage;
    updatePageControls();
    const firstPage = await pdfDocument.getPage(1);
    fitScale = Math.max((scrollArea.clientWidth - 16) / firstPage.getViewport({ scale: 1 }).width, 0.1);
    scale = fitScale;
    await buildPages(scale);
    if (targetInitialPage > 1) {
      requestAnimationFrame(() => goToPage(targetInitialPage, "auto"));
    }
  } catch (error) {
    console.error(error);
    loadingElement.hidden = true;
    errorElement.hidden = false;
  }
}

loadPdf();
