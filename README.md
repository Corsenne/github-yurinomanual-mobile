# 医療安全マニュアル スマホ版

このフォルダは、ポケットマニュアルと災害マニュアルだけを閲覧するためのGitHub Pages配布用フォルダです。

## 使い方

GitHub Pagesでは、このフォルダの中身をリポジトリのルートに置き、`index.html` を公開してください。

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

元アプリ側でPDFや `data/rules.js` を更新したあと、元フォルダで次を実行すると、この配布用フォルダを作り直せます。

```bat
runtime\python\python.exe build_github_pages_mobile.py
```
