const archive = window.MANUAL_ARCHIVE;
const manualMeta = {
  pocket: {
    title: "ポケットマニュアル",
    updatedAt: "2026年6月17日",
  },
  disaster: {
    title: "災害マニュアル",
    updatedAt: "2026年6月17日",
  },
};

const state = {
  view: "home",
  mode: "pocket",
  homeQuery: "",
  query: "",
  chapterNo: "",
  selectedId: "",
  pdfOpen: false,
};

const els = {
  homeView: document.querySelector("#homeView"),
  manualView: document.querySelector("#manualView"),
  homeButton: document.querySelector("#homeButton"),
  pdfBackButton: document.querySelector("#pdfBackButton"),
  modeTabs: document.querySelectorAll("[data-mode]"),
  modeTabsWrap: document.querySelector(".mode-tabs"),
  pocketUpdated: document.querySelector("#pocketUpdated"),
  pocketCount: document.querySelector("#pocketCount"),
  disasterUpdated: document.querySelector("#disasterUpdated"),
  disasterCount: document.querySelector("#disasterCount"),
  manualCards: document.querySelector(".manual-cards"),
  homeSearchInput: document.querySelector("#homeSearchInput"),
  homeSearchResults: document.querySelector("#homeSearchResults"),
  controls: document.querySelector(".controls"),
  searchInput: document.querySelector("#searchInput"),
  chapterField: document.querySelector("#chapterField"),
  chapterSelect: document.querySelector("#chapterSelect"),
  itemPanel: document.querySelector(".item-panel"),
  itemList: document.querySelector("#itemList"),
  viewerPanel: document.querySelector(".viewer-panel"),
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
  return `${assetPath(path)}#toolbar=1&navpanes=0&view=FitH&zoom=page-width`;
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

function allSearchableItems() {
  return [
    ...pocketItems().map((item) => ({ mode: "pocket", item })),
    ...disasterItems().map((item) => ({ mode: "disaster", item })),
  ];
}

function resetManualState() {
  state.query = "";
  state.chapterNo = "";
  state.selectedId = "";
  state.pdfOpen = false;
  els.searchInput.value = "";
}

function routeMode() {
  const hash = window.location.hash.replace("#", "");
  return ["pocket", "disaster"].includes(hash) ? hash : "";
}

function applyRoute() {
  const mode = routeMode();
  if (mode) {
    if (state.mode !== mode) {
      state.mode = mode;
      resetManualState();
    }
    state.view = "manual";
  } else {
    state.view = "home";
    state.pdfOpen = false;
  }
  render();
}

function renderHome() {
  els.homeView.hidden = state.view !== "home";
  els.manualView.hidden = state.view !== "manual";
  els.homeButton.hidden = state.view === "home";
  els.pdfBackButton.hidden = state.view !== "manual" || !state.pdfOpen;
  els.modeTabsWrap.hidden = state.view !== "manual";
  document.body.classList.toggle("is-pdf-open", state.view === "manual" && state.pdfOpen);

  els.pocketUpdated.textContent = `最終更新日 ${manualMeta.pocket.updatedAt}`;
  els.disasterUpdated.textContent = `最終更新日 ${manualMeta.disaster.updatedAt}`;
  els.pocketCount.textContent = `${pocketItems().length.toLocaleString("ja-JP")}件`;
  els.disasterCount.textContent = `${disasterItems().length.toLocaleString("ja-JP")}件`;
  renderHomeSearch();
}

function renderHomeSearch() {
  const query = normalize(state.homeQuery);
  els.homeSearchInput.value = state.homeQuery;

  if (!query) {
    els.manualCards.hidden = false;
    els.homeSearchResults.hidden = true;
    els.homeSearchResults.innerHTML = "";
    return;
  }

  const results = allSearchableItems()
    .filter(({ mode, item }) => normalize([itemLabelFor(mode, item), itemMetaFor(mode, item), item.searchText].join(" ")).includes(query))
    .slice(0, 40);

  els.manualCards.hidden = true;
  els.homeSearchResults.hidden = false;
  if (!results.length) {
    els.homeSearchResults.innerHTML = `<div class="empty-message">該当する項目はありません。</div>`;
    return;
  }

  els.homeSearchResults.innerHTML = results
    .map(({ mode, item }) => {
      const badge = mode === "pocket" ? "ポケット" : "災害";
      return `
        <button class="home-result-button" type="button" data-mode="${escapeHtml(mode)}" data-id="${escapeHtml(item.serial)}">
          <span class="result-badge">${escapeHtml(badge)}</span>
          <span class="item-title">${escapeHtml(itemLabelFor(mode, item))}</span>
          <span class="item-meta">${escapeHtml(itemMetaFor(mode, item))}</span>
        </button>
      `;
    })
    .join("");
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
    els.chapterField.hidden = false;
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
    els.chapterField.hidden = true;
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

function itemLabelFor(mode, item) {
  if (mode === "disaster") {
    return item.number && item.number !== "0" ? `${item.number}. ${item.title}` : item.title;
  }
  return [item.itemNo, item.title].filter(Boolean).join("  ");
}

function itemMetaFor(mode, item) {
  if (mode === "disaster") {
    return "災害マニュアル";
  }
  return `${item.chapterNo}. ${item.chapterName}`;
}

function itemLabel(item) {
  return itemLabelFor(state.mode, item);
}

function itemMeta(item) {
  return itemMetaFor(state.mode, item);
}

function renderList() {
  const items = filteredItems();

  if (!items.length) {
    els.itemList.innerHTML = `<div class="empty-message">該当する項目はありません。</div>`;
    renderEmptyViewer();
    return;
  }

  if (!state.pdfOpen && state.selectedId && !items.some((item) => item.serial === state.selectedId)) {
    state.selectedId = "";
    state.pdfOpen = false;
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
}

function findSelectedItem() {
  const items = state.pdfOpen ? (state.mode === "disaster" ? disasterItems() : pocketItems()) : filteredItems();
  return items.find((item) => item.serial === state.selectedId) || null;
}

function renderEmptyViewer() {
  els.pdfViewer.removeAttribute("src");
}

function renderSelectedItem() {
  const item = findSelectedItem();
  if (!item) {
    renderEmptyViewer();
    return;
  }

  els.pdfViewer.src = pdfViewerSrc(item.pdfPath);
  els.pdfViewer.title = itemLabel(item);
}

function setMode(mode) {
  if (routeMode() === mode) {
    return;
  }
  window.location.hash = mode;
}

function openManualItem(mode, serial) {
  state.mode = mode;
  state.view = "manual";
  state.query = "";
  state.chapterNo = "";
  state.selectedId = serial;
  state.pdfOpen = true;
  els.searchInput.value = "";
  if (routeMode() !== mode) {
    window.location.hash = mode;
  } else {
    render();
  }
}

function render() {
  renderHome();
  if (state.view === "home") {
    renderEmptyViewer();
    return;
  }
  renderControls();
  renderList();
  renderManualPanels();
}

function renderManualPanels() {
  els.controls.hidden = state.pdfOpen;
  els.itemPanel.hidden = state.pdfOpen;
  els.viewerPanel.hidden = !state.pdfOpen;

  if (state.pdfOpen) {
    renderSelectedItem();
  } else {
    renderEmptyViewer();
  }
}

function allManualAssetPaths() {
  const pdfs = [...pocketItems(), ...disasterItems()]
    .map((item) => item.pdfPath)
    .filter(Boolean);
  return [
    "index.html",
    "styles.css?v=20260617-logo-v1",
    "app.js?v=20260617-logo-v1",
    "data/manuals.js",
    "manifest.webmanifest",
    "assets/yurino-logo-clean.png",
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
  const cache = await caches.open("manual-pwa-v8");
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

els.homeButton.addEventListener("click", () => {
  history.pushState("", document.title, window.location.pathname + window.location.search);
  applyRoute();
});

els.pdfBackButton.addEventListener("click", () => {
  state.pdfOpen = false;
  render();
});

els.homeSearchInput.addEventListener("input", (event) => {
  state.homeQuery = event.target.value.trim();
  renderHomeSearch();
});

els.homeSearchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mode][data-id]");
  if (!button) {
    return;
  }
  openManualItem(button.dataset.mode, button.dataset.id);
});

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  state.selectedId = "";
  state.pdfOpen = false;
  render();
});

els.chapterSelect.addEventListener("change", (event) => {
  state.chapterNo = event.target.value;
  state.selectedId = "";
  state.pdfOpen = false;
  render();
});

els.itemList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) {
    return;
  }
  state.selectedId = button.dataset.id;
  state.pdfOpen = true;
  render();
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

window.addEventListener("hashchange", applyRoute);
applyRoute();
setupPwa();
