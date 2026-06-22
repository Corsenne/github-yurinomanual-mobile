const archive = window.MANUAL_ARCHIVE;
const manualMeta = {
  pocket: {
    title: "ポケットマニュアル",
    updatedAt: archive.metadata?.pocketUpdatedAt || "未設定",
  },
  disaster: {
    title: "災害マニュアル",
    updatedAt: archive.metadata?.disasterUpdatedAt || "未設定",
  },
};

const state = {
  view: "home",
  mode: "pocket",
  homeQuery: "",
  query: "",
  chapterNo: "",
};

const els = {
  homeView: document.querySelector("#homeView"),
  manualView: document.querySelector("#manualView"),
  menuButton: document.querySelector("#menuButton"),
  headerMenu: document.querySelector("#headerMenu"),
  homeButton: document.querySelector("#homeButton"),
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
  installButton: document.querySelector("#installButton"),
  updateButton: document.querySelector("#updateButton"),
  updateStatus: document.querySelector("#updateStatus"),
};

let deferredInstallPrompt = null;
let serviceWorkerReady = null;
const mobileMenuQuery = window.matchMedia("(max-width: 759px)");

function setMenuOpen(open, restoreFocus = false) {
  if (!mobileMenuQuery.matches) {
    els.headerMenu.hidden = false;
    els.menuButton.hidden = true;
    els.menuButton.setAttribute("aria-expanded", "false");
    return;
  }
  els.menuButton.hidden = false;
  els.headerMenu.hidden = !open;
  els.menuButton.setAttribute("aria-expanded", String(open));
  els.menuButton.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  if (!open && restoreFocus) {
    els.menuButton.focus();
  }
}

function closeMenu(restoreFocus = false) {
  setMenuOpen(false, restoreFocus);
}

function syncMenuLayout() {
  setMenuOpen(false);
}

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
  }
  render();
}

function renderHome() {
  els.homeView.hidden = state.view !== "home";
  els.manualView.hidden = state.view !== "manual";
  els.homeButton.hidden = state.view === "home";
  els.modeTabsWrap.hidden = state.view !== "manual";

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


  els.itemList.innerHTML = items
    .map((item) => {
      return `
        <button class="item-button" type="button" data-id="${escapeHtml(item.serial)}">
          <span class="item-title">${escapeHtml(itemLabel(item))}</span>
          <span class="item-meta">${escapeHtml(itemMeta(item))}</span>
        </button>
      `;
    })
    .join("");
}


function setMode(mode) {
  if (routeMode() === mode) {
    return;
  }
  window.location.hash = mode;
}

function openManualItem(mode, serial) {
  const items = mode === "disaster" ? disasterItems() : pocketItems();
  const item = items.find((candidate) => candidate.serial === serial);
  if (!item) {
    return;
  }
  const params = new URLSearchParams({
    src: item.pdfPath,
    title: itemLabelFor(mode, item),
    mode,
    serial: item.serial,
  });
  if (mode === "pocket" && item.chapterNo) {
    params.set("chapter", item.chapterNo);
  }
  window.location.href = `pdf-viewer.html?${params.toString()}`;
}

function render() {
  renderHome();
  if (state.view === "home") {
    return;
  }
  renderControls();
  renderList();
}

function setUpdateStatus(message) {
  if (els.updateStatus) {
    els.updateStatus.textContent = message;
  }
}

function waitForWorkerActivation(worker, timeout = 10000) {
  if (!worker || worker.state === "activated") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, timeout);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        window.clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function updateLatest() {
  if (!navigator.onLine) {
    setUpdateStatus("インターネット接続を確認してください");
    return;
  }
  if (!serviceWorkerReady) {
    setUpdateStatus("この環境では更新機能を利用できません");
    return;
  }
  els.updateButton.disabled = true;
  setUpdateStatus("GitHubの最新版を確認中…");
  try {
    const registration = await serviceWorkerReady;
    await registration.update();
    await waitForWorkerActivation(registration.installing || registration.waiting);
    const worker = registration.active || navigator.serviceWorker.controller;
    if (!worker) {
      throw new Error("Service Worker is not ready");
    }
    setUpdateStatus("最新版をダウンロード中…");
    worker.postMessage({ type: "REFRESH_LATEST" });
  } catch (error) {
    console.error(error);
    els.updateButton.disabled = false;
    setUpdateStatus("更新に失敗しました。通信状態を確認してください");
  }
}

function setupPwa() {
  if ("serviceWorker" in navigator) {
    serviceWorkerReady = navigator.serviceWorker
      .register("service-worker.js", { updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        return registration;
      })
      .catch(() => {
        setUpdateStatus("更新機能の準備に失敗しました");
      });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "REFRESH_PROGRESS") {
        setUpdateStatus(`ダウンロード中 ${event.data.done}/${event.data.total}`);
      }
      if (event.data?.type === "REFRESH_DONE") {
        setUpdateStatus(`更新完了 ${event.data.done}/${event.data.total}`);
        window.setTimeout(() => window.location.reload(), 700);
      }
      if (event.data?.type === "REFRESH_ERROR") {
        els.updateButton.disabled = false;
        setUpdateStatus(`更新エラー ${event.data.done}/${event.data.total}`);
      }
    });
  } else {
    setUpdateStatus("このブラウザでは更新機能を利用できません");
    els.updateButton.disabled = true;
  }
}

els.modeTabs.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
    closeMenu();
  });
});

els.menuButton.addEventListener("click", () => {
  setMenuOpen(els.menuButton.getAttribute("aria-expanded") !== "true");
});

document.addEventListener("click", (event) => {
  if (mobileMenuQuery.matches && !event.target.closest(".mobile-header")) {
    closeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.menuButton.getAttribute("aria-expanded") === "true") {
    closeMenu(true);
  }
});

mobileMenuQuery.addEventListener("change", syncMenuLayout);

els.homeButton.addEventListener("click", () => {
  history.pushState("", document.title, window.location.pathname + window.location.search);
  applyRoute();
  closeMenu();
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
  render();
});

els.chapterSelect.addEventListener("change", (event) => {
  state.chapterNo = event.target.value;
  render();
});

els.itemList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) {
    return;
  }
  openManualItem(state.mode, button.dataset.id);
});

els.updateButton.addEventListener("click", () => updateLatest());

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
syncMenuLayout();
applyRoute();
setupPwa();
