# 医療安全マニュアル スマホ版

このフォルダは、ポケットマニュアルと災害マニュアルだけを閲覧するためのGitHub Pages配布用フォルダです。

## 使い方

GitHub Pagesでは、このフォルダの中身をリポジトリのルートに置き、`index.html` を公開してください。

アプリのハンバーガーメニューから「最新の状態に更新」を押すと、GitHub Pages上の最新データと全PDFを自動で再取得します。更新完了後は自動で画面を再読み込みし、取得したマニュアルはオフラインでも閲覧できます。更新時は約22MBをダウンロードします。

含まれるもの:

- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `service-worker.js`
- `data/manuals.js`
- `assets/pdfs/pocket_manual/`
- `assets/pdfs/disaster_manual/`
- `assets/yurino-logo-clean.webp`
- `vendor/pdfjs/`（Apache-2.0）
- `icons/`

Excel、Python、更新bat、作業済みファイルは含めません。

## 更新方法

元アプリ側でPDFや `data/manuals.js` を更新したあと、元フォルダで次を実行すると、この配布用フォルダを作り直せます。最終更新日は、生成された `data/manuals.js` のメタデータから表示します。

```bat
runtime\python\python.exe build_github_pages_mobile.py
```
