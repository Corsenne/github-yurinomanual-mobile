const archive = window.MANUAL_ARCHIVE;
const state = {
  mode: "pocket",
  query: "",
  chapterNo: "",
  selectedId: "",
};

const els = {
  modeTabs: document.querySelectorAll("[data-mode]"),
  searchInput: document.querySelector("#searchInput"),
  chapterSelect: document.querySelector("#chapterSelect"),
  listTitle: document.querySelector("#listTitle"),
  itemCount: document.querySelector("#itemCount"),
  itemList: document.querySelector("#itemList"),
  viewerTitle: document.querySelector("#viewerTitle"),
  openPdf: document.querySelector("#openPdf"),
  pdfViewer: document.querySelector("#pdfViewer"),
  installButton: document.querySelector("#installButton"),
  offlineButton: document.querySelector("#offlineButton"),
  offlineStatus: document.querySelector("#offlineStatus"),
};

let deferredInstallPrompt = null;
let serviceWorkerReady = null;

function normalize(value) {
  return String(value || "").toLocaleLowerCase("ja-JP").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function assetPath(path) {
  return path;
}

function pdfViewerSrc(path) {
  return `${assetPath(path)}#toolbar=1&navpanes=0&view=FitH`;
}

function pocketChapters() {
  return archive.pocketManual?.chapters || [];
}

function pocketItems() {
  return archive.pocketManual?.items || [];
}

function disasterItems() {
  return archive.disasterManual?.items || [];
}

function selectedPocketChapter() {
  const chapters = pocketChapters();
  if (state.chapterNo && chapters.some((chapter) => chapter.chapterNo === state.chapterNo)) {
    return state.chapterNo;
  }
  return chapters.find((chapter) => chapter.chapterNo !== "0" && Number(chapter.count || 0) > 0)?.chapterNo || "";
}

function renderControls() {
  els.modeTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  });

  if (state.mode === "pocket" && !state.query) {
    const selected = selectedPocketChapter();
    state.chapterNo = selected;
    els.chapterSelect.hidden = false;
    els.chapterSelect.innerHTML = pocketChapters()
      .filter((chapter) => chapter.chapterNo !== "0")
      .map(
        (chapter) =>
          `<option value="${escapeHtml(chapter.chapterNo)}"${chapter.chapterNo === selected ? " selected" : ""}>
            ${escapeHtml(chapter.chapterNo)}. ${escapeHtml(chapter.chapterName)}
          </option>`,
      )
      .join("");
  } else {
    els.chapterSelect.hidden = true;
  }
}

function filteredItems() {
  const query = normalize(state.query);
  if (state.mode === "disaster") {
    const items = disasterItems();
    if (!query) {
      return items;
    }
    return items.filter((item) => normalize([item.title, item.searchText].filter(Boolean).join(" ")).includes(query));
  }

  let items = pocketItems();
  if (query) {
    return items.filter((item) => normalize(item.searchText).includes(query));
  }

  const chapterNo = selectedPocketChapter();
  return chapterNo ? items.filter((item) => item.chapterNo === "0" || item.chapterNo === chapterNo) : items;
}

function itemLabel(item) {
  if (state.mode === "disaster") {
    return item.number && item.number !== "0" ? `${item.number}. ${item.title}` : item.title;
  }
  return [item.itemNo, item.title].filter(Boolean).join("  ");
}

function itemMeta(item) {
  if (state.mode === "disaster") {
    return "災害マニュアル";
  }
  return `${item.chapterNo}. ${item.chapterName}`;
}

function renderList() {
  const items = filteredItems();
  els.listTitle.textContent = state.mode === "pocket" ? "ポケットマニュアル" : "災害マニュアル";
  els.itemCount.textContent = `${items.length.toLocaleString("ja-JP")}件`;

  if (!items.length) {
    els.itemList.innerHTML = `<div class="empty-message">該当する項目はありません。</div>`;
    renderEmptyViewer();
    return;
  }

  if (!state.selectedId || !items.some((item) => item.serial === state.selectedId)) {
    state.selectedId = items[0].serial;
  }

  els.itemList.innerHTML = items
    .map((item) => {
      const active = item.serial === state.selectedId ? " is-active" : "";
      return `
        <button class="item-button${active}" type="button" data-id="${escapeHtml(item.serial)}">
          <span class="item-title">${escapeHtml(itemLabel(item))}</span>
          <span class="item-meta">${escapeHtml(itemMeta(item))}</span>
        </button>
      `;
    })
    .join("");

  renderSelectedItem();
}

function findSelectedItem() {
  return filteredItems().find((item) => item.serial === state.selectedId) || null;
}

function renderEmptyViewer() {
  els.viewerTitle.textContent = "項目を選択してください";
  els.openPdf.hidden = true;
  els.openPdf.removeAttribute("href");
  els.pdfViewer.removeAttribute("src");
}

function renderSelectedItem() {
  const item = findSelectedItem();
  if (!item) {
    renderEmptyViewer();
    return;
  }

  els.viewerTitle.textContent = itemLabel(item);
  els.openPdf.hidden = false;
  els.openPdf.href = assetPath(item.pdfPath);
  els.pdfViewer.src = pdfViewerSrc(item.pdfPath);
  els.pdfViewer.title = itemLabel(item);
}

function setMode(mode) {
  state.mode = mode;
  state.query = "";
  state.chapterNo = "";
  state.selectedId = "";
  els.searchInput.value = "";
  render();
}

function render() {
  renderControls();
  renderList();
}

function allManualAssetPaths() {
  const pdfs = [...pocketItems(), ...disasterItems()]
    .map((item) => item.pdfPath)
    .filter(Boolean);
  return [
    "index.html",
    "styles.css",
    "app.js?v=20260616-pwa-v2",
    "data/manuals.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    ...pdfs,
  ];
}

function setOfflineStatus(message) {
  if (els.offlineStatus) {
    els.offlineStatus.textContent = message;
  }
}

async function refreshOfflineStatus() {
  if (!("caches" in window)) {
    setOfflineStatus("この環境ではオフライン保存を利用できません");
    els.offlineButton.disabled = true;
    return;
  }
  const cache = await caches.open("manual-pwa-v1");
  const paths = allManualAssetPaths();
  const cached = await Promise.all(paths.map((path) => cache.match(path)));
  const cachedCount = cached.filter(Boolean).length;
  if (cachedCount >= paths.length) {
    setOfflineStatus(`保存済み ${cachedCount}/${paths.length}`);
  } else {
    setOfflineStatus(`未保存 ${cachedCount}/${paths.length}`);
  }
}

async function saveOffline() {
  if (!serviceWorkerReady) {
    setOfflineStatus("この環境ではオフライン保存を利用できません");
    return;
  }
  const registration = await serviceWorkerReady;
  const worker = navigator.serviceWorker.controller || registration.active;
  if (!worker) {
    setOfflineStatus("準備中です。数秒後にもう一度押してください");
    return;
  }
  const paths = allManualAssetPaths();
  els.offlineButton.disabled = true;
  setOfflineStatus(`保存中 0/${paths.length}`);
  worker.postMessage({ type: "CACHE_ALL", urls: paths });
}

function setupPwa() {
  if ("serviceWorker" in navigator) {
    serviceWorkerReady = navigator.serviceWorker
      .register("service-worker.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        refreshOfflineStatus();
        return registration;
      })
      .catch(() => {
        setOfflineStatus("オフライン保存の準備に失敗しました");
      });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "CACHE_PROGRESS") {
        setOfflineStatus(`保存中 ${event.data.done}/${event.data.total}`);
      }
      if (event.data?.type === "CACHE_DONE") {
        els.offlineButton.disabled = false;
        setOfflineStatus(`保存済み ${event.data.done}/${event.data.total}`);
      }
      if (event.data?.type === "CACHE_ERROR") {
        els.offlineButton.disabled = false;
        setOfflineStatus(`保存エラー ${event.data.done}/${event.data.total}`);
      }
    });
  } else {
    setOfflineStatus("このブラウザではオフライン保存を利用できません");
    els.offlineButton.disabled = true;
  }
}

els.modeTabs.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  state.selectedId = "";
  render();
});

els.chapterSelect.addEventListener("change", (event) => {
  state.chapterNo = event.target.value;
  state.selectedId = "";
  render();
});

els.itemList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) {
    return;
  }
  state.selectedId = button.dataset.id;
  renderList();
});

els.offlineButton.addEventListener("click", () => saveOffline());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.installButton.hidden = false;
});

els.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    return;
  }
  els.installButton.hidden = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

render();
setupPwa();
