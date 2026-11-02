# Cropper

A browser-based tool for cropping images and PDFs. Select one or more areas on an image or on any page of a PDF, crop them, and collect the results in a gallery. From there you can download them, extract their text with OCR, or combine them into a single PDF. Everything runs locally in your browser, and your files are never uploaded to a server.

## Features

**Loading files**
- Open PNG, JPG, WebP, GIF images and multi-page PDFs
- Drag and drop (anywhere on the page), click to browse, or paste an image from the clipboard

**Selecting and cropping**
- Draw a selection in any direction, then move it or resize it with 8 handles
- Aspect ratio presets: Free, 1:1, 4:3, 3:2, 16:9, 3:4, 9:16
- Live selection size in real pixels, with a rule-of-thirds grid
- Zoom in/out, fit to width, and rotate left/right (works for PDFs too)
- Mouse, touch and pen support
- Crop as many areas as you like, from any page of a PDF

**Results**
- Every crop appears in a gallery with Download, Copy to clipboard, Text and Delete actions
- Export as PNG, JPEG or WebP, with a quality slider for JPEG/WebP
- Download all crops as a ZIP
- Create one PDF from all crops (fit to image, A4 or Letter)

**Text extraction (OCR)**
- Extract text from the current selection or from any cropped result
- Languages: English, Bengali, English + Bengali, Hindi, Arabic, French, Spanish, German
- Edit the extracted text, then copy it or save it as a `.txt` file

**Other**
- Light and dark theme (remembers your choice)
- Keyboard shortcuts

## Getting started

No build step or installation is needed.

1. Keep `index.html`, `style.css` and `script.js` together in one folder.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari).

An internet connection is required the first time, because the PDF, ZIP and OCR libraries load from a CDN and OCR language data is downloaded on first use of each language.

## How to use

1. **Load a file** by dropping it on the page, clicking the upload area, or pasting an image.
2. **Draw a selection** on the image or on a PDF page. Drag it to move it, or drag the handles to resize it.
3. **Crop** with the **Crop** button (or `Enter`). The result is added to the gallery. Repeat for as many areas as you need.
4. **Use the results:**
   - **Download** a single crop, or **Download all (ZIP)**.
   - **Create PDF** to put all crops into one PDF, one per page, in the order they were cropped.
   - **Extract text** (or press `T`) to run OCR on the selection, or press **Text** on a result card.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Crop the current selection |
| `Esc` | Clear the selection |
| `T` | Extract text from the current selection |
| Arrow keys | Nudge the selection by 1px (hold `Shift` for 10px) |
| `+` / `-` | Zoom in / out |
| `0` | Fit to width |

## Project structure

```
index.html   Page layout and toolbar
style.css    Styling, including the dark theme
script.js    All application logic
```

## Built with

- [PDF.js](https://mozilla.github.io/pdf.js/) renders PDF pages
- [jsPDF](https://github.com/parallax/jsPDF) creates PDFs from crops
- [JSZip](https://stuk.github.io/jszip/) bundles crops into a ZIP
- [Tesseract.js](https://github.com/naptha/tesseract.js) performs OCR

## Notes and limitations

- Created PDFs contain images only, so their text is not selectable or searchable.
- WebP export is not supported inside PDFs (JPEG is used instead). WebP image export may not be available in older Safari versions.
- Clipboard image copy depends on browser support.
- On touch devices, dragging on a page draws a selection, so scroll using the area around the pages.
- OCR accuracy depends on image quality. Tight selections around clean, high-contrast text work best.