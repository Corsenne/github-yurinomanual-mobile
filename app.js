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
};

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

function pocketCoverItem() {
  return {
    serial: "pocket-cover",
    chapterNo: "0",
    chapterName: "表紙",
    itemNo: "0",
    title: "表紙",
    pdfPath: "assets/pdfs/ポケットマニュアル/00 ポケットマニュアル表紙.pdf",
    searchText: "ポケットマニュアル 表紙",
  };
}

function disasterItems() {
  return archive.disasterManual?.items || [];
}

function disasterCoverItem() {
  return {
    serial: "disaster-cover",
    number: "0",
    title: "表紙",
    pdfPath: "assets/pdfs/防災ポケットマニュアル/00_表紙.pdf",
    searchText: "防災 災害 マニュアル 表紙",
  };
}

function selectedPocketChapter() {
  const chapters = pocketChapters();
  if (state.chapterNo && chapters.some((chapter) => chapter.chapterNo === state.chapterNo)) {
    return state.chapterNo;
  }
  return chapters.find((chapter) => Number(chapter.count || 0) > 0)?.chapterNo || "";
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
    const items = query ? disasterItems() : [disasterCoverItem(), ...disasterItems()];
    if (!query) {
      return items;
    }
    return items.filter((item) => normalize([item.title, item.searchText].filter(Boolean).join(" ")).includes(query));
  }

  let items = query ? pocketItems() : [pocketCoverItem(), ...pocketItems()];
  if (query) {
    return [pocketCoverItem(), ...items].filter((item) => normalize(item.searchText).includes(query));
  }

  const chapterNo = selectedPocketChapter();
  return chapterNo ? items.filter((item) => item.serial === "pocket-cover" || item.chapterNo === chapterNo) : items;
}

function itemLabel(item) {
  if (state.mode === "disaster") {
    return item.serial === "disaster-cover" ? item.title : `${item.number}. ${item.title}`;
  }
  if (item.serial === "pocket-cover") {
    return item.title;
  }
  return [item.itemNo, item.title].filter(Boolean).join("  ");
}

function itemMeta(item) {
  if (state.mode === "disaster") {
    return "災害マニュアル";
  }
  if (item.serial === "pocket-cover") {
    return "ポケットマニュアル";
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

render();
