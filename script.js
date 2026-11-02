'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

/* ---------- Helpers & state ---------- */
const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const els = {
    uploadArea: $('#upload-area'),
    fileInput: $('#file-input'),
    workspace: $('#workspace'),
    viewer: $('#viewer'),
    output: $('#output'),
    resultsSection: $('#results-section'),
    resultsCount: $('#results-count'),
    cropBtn: $('#crop-button'),
    clearSel: $('#clear-sel'),
    removeFile: $('#remove-file'),
    zoomIn: $('#zoom-in'),
    zoomOut: $('#zoom-out'),
    zoomFit: $('#zoom-fit'),
    zoomLabel: $('#zoom-label'),
    rotateLeft: $('#rotate-left'),
    rotateRight: $('#rotate-right'),
    format: $('#format'),
    quality: $('#quality'),
    qualityVal: $('#quality-val'),
    qualityWrap: $('#quality-wrap'),
    ratioGroup: $('#ratio-group'),
    fileInfo: $('#file-info'),
    selInfo: $('#sel-info'),
    downloadAll: $('#download-all'),
    clearAll: $('#clear-all'),
    themeBtn: $('#theme-btn'),
    toast: $('#toast'),
    ocrLang: $('#ocr-lang'),
    extractBtn: $('#extract-btn'),
    textSection: $('#text-section'),
    ocrText: $('#ocr-text'),
    ocrStatus: $('#ocr-status'),
    copyText: $('#copy-text'),
    downloadText: $('#download-text'),
    clearText: $('#clear-text'),
    closeText: $('#close-text'),
    pdfSize: $('#pdf-size'),
    makePdf: $('#make-pdf'),
};

const state = {
    source: null,      // { type: 'image', img } | { type: 'pdf', pdf }
    baseName: 'crop',
    rotation: 0,
    zoom: 1,
    ratio: 0,          // 0 = free, otherwise width / height
    pages: [],         // { wrap, canvas, baseW, number }
    sel: null,         // { page, x, y, w, h } as fractions (0-1) of the page
    results: [],
    nextId: 1,
    token: 0,          // guards against overlapping renders
    objectUrl: null,
};

let drag = null;
let toastTimer = null;

/* The selection element is created once and moved between pages. */
const selEl = document.createElement('div');
selEl.className = 'selection';
selEl.hidden = true;
['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((h) => {
    const s = document.createElement('span');
    s.className = 'handle ' + (h.length === 2 ? 'corner' : 'edge');
    s.dataset.handle = h;
    selEl.appendChild(s);
});

function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('cropper-theme', theme); } catch (_) { /* ignore */ }
}
(function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('cropper-theme'); } catch (_) { /* ignore */ }
    const prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
})();
els.themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

/* ---------- File loading ---------- */
els.uploadArea.addEventListener('click', () => els.fileInput.click());
els.uploadArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.fileInput.click();
    }
});
els.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.uploadArea.classList.add('dragover');
});
els.uploadArea.addEventListener('dragleave', () => els.uploadArea.classList.remove('dragover'));
els.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.uploadArea.classList.remove('dragover');
    loadFile(e.dataTransfer.files[0]);
});
// Dropping anywhere else on the page also loads the file (instead of navigating away).
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
els.fileInput.addEventListener('change', (e) => {
    loadFile(e.target.files[0]);
    e.target.value = ''; // allow re-selecting the same file
});
document.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) {
        loadFile(file);
        toast('Image pasted from clipboard');
    }
});

async function loadFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
        toast('Unsupported file type. Use an image or PDF.');
        return;
    }

    try {
        if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
        state.objectUrl = null;

        if (isPdf) {
            const data = new Uint8Array(await file.arrayBuffer());
            const pdf = await pdfjsLib.getDocument({ data }).promise;
            state.source = { type: 'pdf', pdf };
            els.fileInfo.textContent = `${file.name} · PDF · ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`;
        } else {
            const url = URL.createObjectURL(file);
            state.objectUrl = url;
            const img = await new Promise((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = () => reject(new Error('Could not decode image'));
                im.src = url;
            });
            state.source = { type: 'image', img };
            els.fileInfo.textContent = `${file.name} · ${img.naturalWidth} × ${img.naturalHeight} px`;
        }
    } catch (err) {
        console.error(err);
        toast('Could not open that file.');
        return;
    }

    state.baseName = file.name.replace(/\.[^.]+$/, '') || 'crop';
    state.rotation = 0;
    els.workspace.hidden = false;
    els.uploadArea.classList.add('compact');
    $('#upload-hint').textContent = 'Drop or choose another file to replace the current one';
    renderAll(true);
}

function removeFile() {
    state.token++;
    state.source = null;
    state.pages = [];
    clearSel();
    els.viewer.replaceChildren();
    els.viewer.classList.remove('busy');
    els.workspace.hidden = true;
    els.uploadArea.classList.remove('compact');
    $('#upload-hint').textContent = 'Supports PNG, JPG, WebP, GIF and PDF';
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
}
els.removeFile.addEventListener('click', removeFile);

/* ---------- Rendering ---------- */
function createPage(number) {
    const wrap = document.createElement('div');
    wrap.className = 'page';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    if (number) {
        const badge = document.createElement('span');
        badge.className = 'page-badge';
        badge.textContent = `Page ${number}`;
        wrap.appendChild(badge);
    }
    els.viewer.appendChild(wrap);
    const page = { wrap, canvas, baseW: 0, number: number || 0 };
    state.pages.push(page);
    return page;
}

function drawImagePage(page) {
    const { img } = state.source;
    const rot = state.rotation;
    const swap = rot % 180 !== 0;
    const w = swap ? img.naturalHeight : img.naturalWidth;
    const h = swap ? img.naturalWidth : img.naturalHeight;
    page.canvas.width = w;
    page.canvas.height = h;
    const ctx = page.canvas.getContext('2d');
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    page.baseW = w;
}

async function drawPdfPage(page, pdfPage) {
    const rotation = (pdfPage.rotate + state.rotation) % 360;
    const vp1 = pdfPage.getViewport({ scale: 1, rotation });
    const scale = Math.min(2.5, 3200 / vp1.width);
    const viewport = pdfPage.getViewport({ scale, rotation });
    page.canvas.width = Math.floor(viewport.width);
    page.canvas.height = Math.floor(viewport.height);
    const ctx = page.canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, page.canvas.width, page.canvas.height);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    page.baseW = vp1.width;
}

async function renderAll(fit) {
    const token = ++state.token;
    const src = state.source;
    if (!src) return;
    clearSel();
    els.viewer.replaceChildren();
    state.pages = [];
    els.viewer.classList.add('busy');

    try {
        if (src.type === 'image') {
            const page = createPage(0);
            drawImagePage(page);
            if (fit) state.zoom = fitZoom(page.baseW);
            applyZoom();
        } else {
            for (let i = 1; i <= src.pdf.numPages; i++) {
                if (token !== state.token) return;
                const pdfPage = await src.pdf.getPage(i);
                if (token !== state.token) return;
                const page = createPage(i);
                await drawPdfPage(page, pdfPage);
                if (token !== state.token) return;
                if (fit && i === 1) state.zoom = fitZoom(page.baseW);
                applyZoom();
            }
        }
    } catch (err) {
        console.error(err);
        toast('Failed to render the file.');
    } finally {
        if (token === state.token) els.viewer.classList.remove('busy');
    }
}

/* ---------- Zoom & rotate ---------- */
function fitZoom(baseW) {
    const avail = els.viewer.clientWidth - 40;
    return clamp(Math.min(1, avail / baseW), 0.1, 4);
}
function applyZoom() {
    state.pages.forEach((p) => {
        if (p.baseW) p.wrap.style.width = p.baseW * state.zoom + 'px';
    });
    els.zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
}
function setZoom(z) {
    state.zoom = clamp(z, 0.1, 4);
    applyZoom();
}
els.zoomIn.addEventListener('click', () => setZoom(state.zoom * 1.2));
els.zoomOut.addEventListener('click', () => setZoom(state.zoom / 1.2));
els.zoomFit.addEventListener('click', () => {
    if (state.pages[0]) setZoom(fitZoom(state.pages[0].baseW));
});

function rotate(delta) {
    if (!state.source) return;
    state.rotation = (state.rotation + delta + 360) % 360;
    renderAll(true);
}
els.rotateLeft.addEventListener('click', () => rotate(-90));
els.rotateRight.addEventListener('click', () => rotate(90));

/* ---------- Aspect ratio ---------- */
els.ratioGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    els.ratioGroup.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b === btn));
    state.ratio = parseFloat(btn.dataset.ratio) || 0;
    els.viewer.classList.toggle('ratio-locked', !!state.ratio);
    if (state.sel && state.ratio) {
        const { page } = state.sel;
        const W = page.wrap.clientWidth;
        const H = page.wrap.clientHeight;
        const px = fitToRatio(selToPx(W, H), state.ratio, W, H);
        setSel(page, px, W, H);
    }
});

function fitToRatio(r, ratio, W, H) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    let w = r.w;
    let h = w / ratio;
    if (h > H) { h = H; w = h * ratio; }
    if (w > W) { w = W; h = w / ratio; }
    return {
        x: clamp(cx - w / 2, 0, W - w),
        y: clamp(cy - h / 2, 0, H - h),
        w,
        h,
    };
}

/* ---------- Selection ---------- */
function selToPx(W, H) {
    const s = state.sel;
    return { x: s.x * W, y: s.y * H, w: s.w * W, h: s.h * H };
}

function setSel(page, px, W, H) {
    state.sel = { page, x: px.x / W, y: px.y / H, w: px.w / W, h: px.h / H };
    if (selEl.parentNode !== page.wrap) page.wrap.appendChild(selEl);
    updateSelUI();
}

function clearSel() {
    state.sel = null;
    selEl.hidden = true;
    selEl.remove();
    els.selInfo.textContent = 'No selection';
}

function updateSelUI() {
    const s = state.sel;
    if (!s) return clearSel();
    selEl.hidden = false;
    selEl.style.left = s.x * 100 + '%';
    selEl.style.top = s.y * 100 + '%';
    selEl.style.width = s.w * 100 + '%';
    selEl.style.height = s.h * 100 + '%';
    const sw = Math.round(s.w * s.page.canvas.width);
    const sh = Math.round(s.h * s.page.canvas.height);
    const where = s.page.number ? ` · page ${s.page.number}` : '';
    els.selInfo.textContent = `Selection: ${sw} × ${sh} px${where}`;
}

els.clearSel.addEventListener('click', clearSel);

/* Rectangle from a fixed anchor point to the pointer, clamped to the page. */
function rectFromAnchor(ax, ay, px, py, ratio, W, H) {
    const sx = px - ax < 0 ? -1 : 1;
    const sy = py - ay < 0 ? -1 : 1;
    let w = Math.min(Math.abs(px - ax), sx < 0 ? ax : W - ax);
    let h = Math.min(Math.abs(py - ay), sy < 0 ? ay : H - ay);
    if (ratio) {
        if (w / Math.max(h, 0.0001) > ratio) w = h * ratio;
        else h = w / ratio;
    }
    return { x: sx < 0 ? ax - w : ax, y: sy < 0 ? ay - h : ay, w, h };
}

function resizeRect(handle, o, p, W, H, ratio) {
    if (handle.length === 2) {
        const ax = handle.includes('w') ? o.x + o.w : o.x;
        const ay = handle.includes('n') ? o.y + o.h : o.y;
        return rectFromAnchor(ax, ay, p.x, p.y, ratio, W, H);
    }
    let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
    if (handle === 'w') l = p.x;
    if (handle === 'e') r = p.x;
    if (handle === 'n') t = p.y;
    if (handle === 's') b = p.y;
    return {
        x: Math.min(l, r),
        y: Math.min(t, b),
        w: Math.abs(r - l),
        h: Math.abs(b - t),
    };
}

/* ---------- Pointer interaction (mouse, touch, pen) ---------- */
els.viewer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const wrap = e.target.closest('.page');
    if (!wrap) return;
    const page = state.pages.find((p) => p.wrap === wrap);
    if (!page) return;

    const rect = wrap.getBoundingClientRect();
    const pt = {
        x: clamp(e.clientX - rect.left, 0, rect.width),
        y: clamp(e.clientY - rect.top, 0, rect.height),
    };
    const handle = e.target.dataset.handle;
    const onSel = e.target.closest('.selection') && state.sel && state.sel.page === page;

    drag = { page, start: pt, mode: 'create', handle: null, orig: null };
    if (handle && state.sel) {
        drag.mode = 'resize';
        drag.handle = handle;
        drag.orig = selToPx(rect.width, rect.height);
    } else if (onSel) {
        drag.mode = 'move';
        drag.orig = selToPx(rect.width, rect.height);
    } else {
        clearSel();
    }
    wrap.setPointerCapture(e.pointerId);
    e.preventDefault();
});

els.viewer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { page } = drag;
    const rect = page.wrap.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const pt = {
        x: clamp(e.clientX - rect.left, 0, W),
        y: clamp(e.clientY - rect.top, 0, H),
    };

    if (drag.mode === 'create') {
        const r = rectFromAnchor(drag.start.x, drag.start.y, pt.x, pt.y, state.ratio, W, H);
        if (r.w > 0 || r.h > 0) setSel(page, r, W, H);
    } else if (drag.mode === 'move') {
        const o = drag.orig;
        setSel(page, {
            x: clamp(o.x + pt.x - drag.start.x, 0, W - o.w),
            y: clamp(o.y + pt.y - drag.start.y, 0, H - o.h),
            w: o.w,
            h: o.h,
        }, W, H);
    } else if (drag.mode === 'resize') {
        setSel(page, resizeRect(drag.handle, drag.orig, pt, W, H, state.ratio), W, H);
    }
});

function endDrag(e) {
    if (!drag) return;
    const { page, mode } = drag;
    drag = null;
    try { page.wrap.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (state.sel && mode !== 'move') {
        const W = page.wrap.clientWidth;
        const H = page.wrap.clientHeight;
        if (state.sel.w * W < 5 || state.sel.h * H < 5) clearSel(); // treat tiny drags as a click
    }
}
els.viewer.addEventListener('pointerup', endDrag);
els.viewer.addEventListener('pointercancel', endDrag);

/* ---------- Export helpers ---------- */
const toBlob = (canvas, type, quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

function extFromMime(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'png';
}

async function exportBlob(canvas) {
    const fmt = els.format.value;
    let src = canvas;
    if (fmt === 'jpeg') { // JPEG has no alpha: flatten onto white
        src = document.createElement('canvas');
        src.width = canvas.width;
        src.height = canvas.height;
        const ctx = src.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, src.width, src.height);
        ctx.drawImage(canvas, 0, 0);
    }
    return toBlob(src, 'image/' + fmt, parseInt(els.quality.value, 10) / 100);
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function syncQualityUI() {
    els.qualityVal.textContent = els.quality.value;
    els.qualityWrap.classList.toggle('disabled', els.format.value === 'png');
}
els.format.addEventListener('change', syncQualityUI);
els.quality.addEventListener('input', syncQualityUI);
syncQualityUI();

/* ---------- Cropping & results ---------- */
function cropSelection() {
    const sel = getSelectionCanvas();
    if (!sel) return;
    addResult(sel.canvas, sel.page.number);
    toast('Cropped! Added to results.');
}

/* Copies the selected area into a new canvas (shared by crop and OCR). */
function getSelectionCanvas() {
    if (!state.sel) {
        toast('Draw a selection on the page first.');
        return null;
    }
    const { page, x, y, w, h } = state.sel;
    const c = page.canvas;
    const sx = Math.round(x * c.width);
    const sy = Math.round(y * c.height);
    const sw = Math.max(1, Math.min(Math.round(w * c.width), c.width - sx));
    const sh = Math.max(1, Math.min(Math.round(h * c.height), c.height - sy));

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);

    return { canvas: out, page };
}
els.cropBtn.addEventListener('click', cropSelection);

function addResult(canvas, pageNo) {
    const id = state.nextId++;
    const name = `${state.baseName}${pageNo ? '_p' + pageNo : ''}_crop${id}`;
    const item = { id, canvas, name, thumbUrl: null, el: null };
    state.results.push(item);
    renderResult(item);
    updateResultsUI();
}

function renderResult(item) {
    const card = document.createElement('div');
    card.className = 'card';

    const thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    const img = document.createElement('img');
    img.alt = item.name;
    thumb.appendChild(img);
    toBlob(item.canvas, 'image/png').then((blob) => {
        item.thumbUrl = URL.createObjectURL(blob);
        img.src = item.thumbUrl;
    });

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = `${item.name} · ${item.canvas.width} × ${item.canvas.height} px`;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(
        makeBtn('Download', async () => {
            const blob = await exportBlob(item.canvas);
            saveBlob(blob, `${item.name}.${extFromMime(blob.type)}`);
        }),
        makeBtn('Copy', async () => {
            try {
                const blob = await toBlob(item.canvas, 'image/png');
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                toast('Copied to clipboard');
            } catch (_) {
                toast('Copy is not supported in this browser.');
            }
        }),
        makeBtn('Text', () => runOcr(item.canvas)),
        makeBtn('Delete', () => deleteResult(item), 'btn-danger'),
    );

    card.append(thumb, meta, actions);
    item.el = card;
    els.output.appendChild(card);
}

function makeBtn(label, onClick, extra) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (extra ? ' ' + extra : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
}

function deleteResult(item) {
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    item.el.remove();
    state.results = state.results.filter((r) => r !== item);
    updateResultsUI();
}

function updateResultsUI() {
    els.resultsCount.textContent = state.results.length;
    els.resultsSection.hidden = state.results.length === 0;
}

els.clearAll.addEventListener('click', () => {
    [...state.results].forEach(deleteResult);
});

els.downloadAll.addEventListener('click', async () => {
    if (!state.results.length) return;
    els.downloadAll.disabled = true;
    try {
        if (state.results.length === 1 || !window.JSZip) {
            for (const item of state.results) {
                const blob = await exportBlob(item.canvas);
                saveBlob(blob, `${item.name}.${extFromMime(blob.type)}`);
            }
            return;
        }
        const zip = new JSZip();
        for (const item of state.results) {
            const blob = await exportBlob(item.canvas);
            zip.file(`${item.name}.${extFromMime(blob.type)}`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveBlob(zipBlob, `${state.baseName}_crops.zip`);
    } finally {
        els.downloadAll.disabled = false;
    }
});

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
    if (!state.source) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
        case 'Enter':
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            cropSelection();
            break;
        case 'Escape':
            clearSel();
            break;
        case 't':
        case 'T':
            extractSelection();
            break;
        case '+':
        case '=':
            setZoom(state.zoom * 1.2);
            break;
        case '-':
        case '_':
            setZoom(state.zoom / 1.2);
            break;
        case '0':
            els.zoomFit.click();
            break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
            if (!state.sel) return;
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const { page, w, h } = state.sel;
            const W = page.wrap.clientWidth;
            const H = page.wrap.clientHeight;
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            const px = selToPx(W, H);
            setSel(page, {
                x: clamp(px.x + dx, 0, W - px.w),
                y: clamp(px.y + dy, 0, H - px.h),
                w: px.w,
                h: px.h,
            }, W, H);
            break;
        }
    }
});

/* ---------- OCR: extract text from a selection or a cropped result ---------- */
const ocr = { workers: {}, busy: false };

function setOcrStatus(msg) {
    els.ocrStatus.textContent = msg;
}

function getOcrWorker(langKey) {
    if (!ocr.workers[langKey]) {
        ocr.workers[langKey] = Tesseract.createWorker(langKey.split('+'), 1, {
            logger: (m) => {
                const pct = Math.round((m.progress || 0) * 100);
                const label = m.status.charAt(0).toUpperCase() + m.status.slice(1);
                setOcrStatus(`${label}… ${pct}%`);
            },
        });
    }
    return ocr.workers[langKey];
}

/* Flatten on white and upscale small crops: Tesseract is much more accurate at larger sizes. */
function prepareForOcr(canvas) {
    const scale = canvas.width < 1200 ? Math.min(3, 1200 / canvas.width) : 1;
    const out = document.createElement('canvas');
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out;
}

async function runOcr(canvas) {
    if (!window.Tesseract) {
        toast('OCR library failed to load. Check your internet connection.');
        return;
    }
    if (ocr.busy) {
        toast('Text extraction is already running…');
        return;
    }
    ocr.busy = true;
    els.extractBtn.disabled = true;
    els.textSection.hidden = false;
    els.textSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setOcrStatus('Starting OCR engine…');

    const langKey = els.ocrLang.value;
    try {
        const worker = await getOcrWorker(langKey);
        const { data } = await worker.recognize(prepareForOcr(canvas));
        const text = data.text.trim();
        if (!text) {
            setOcrStatus('No text found in that area.');
        } else {
            const current = els.ocrText.value.replace(/\s+$/, '');
            els.ocrText.value = current ? current + '\n\n' + text : text;
            setOcrStatus(`Done · confidence ${Math.round(data.confidence)}%`);
        }
    } catch (err) {
        console.error(err);
        delete ocr.workers[langKey];
        setOcrStatus('Text extraction failed. Check your connection and try again.');
    } finally {
        ocr.busy = false;
        els.extractBtn.disabled = false;
    }
}

function extractSelection() {
    const sel = getSelectionCanvas();
    if (sel) runOcr(sel.canvas);
}
els.extractBtn.addEventListener('click', extractSelection);

els.copyText.addEventListener('click', async () => {
    const text = els.ocrText.value;
    if (!text) return toast('Nothing to copy.');
    try {
        await navigator.clipboard.writeText(text);
    } catch (_) {
        els.ocrText.select();
        document.execCommand('copy');
    }
    toast('Text copied');
});
els.downloadText.addEventListener('click', () => {
    const text = els.ocrText.value;
    if (!text) return toast('Nothing to download.');
    saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${state.baseName}_text.txt`);
});
els.clearText.addEventListener('click', () => {
    els.ocrText.value = '';
    setOcrStatus('');
});
els.closeText.addEventListener('click', () => {
    els.textSection.hidden = true;
});

/* ---------- Create a PDF from the cropped results ---------- */
function canvasToDataUrl(canvas, fmt) {
    if (fmt === 'PNG') return canvas.toDataURL('image/png');
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    return flat.toDataURL('image/jpeg', parseInt(els.quality.value, 10) / 100);
}

async function createPdf() {
    if (!state.results.length) return toast('Crop something first.');
    if (!window.jspdf) return toast('PDF library failed to load. Check your internet connection.');
    const { jsPDF } = window.jspdf;
    const mode = els.pdfSize.value;
    const fmt = els.format.value === 'png' ? 'PNG' : 'JPEG'; // jsPDF has no WebP support
    els.makePdf.disabled = true;
    toast('Building PDF…');

    try {
        let doc = null;
        for (const item of state.results) {
            const { width: w, height: h } = item.canvas;
            let pw, ph, ix, iy, iw, ih;
            if (mode === 'fit') {
                pw = w * 0.75; // px → pt
                ph = h * 0.75;
                ix = iy = 0;
                iw = pw;
                ih = ph;
            } else {
                const [bw, bh] = mode === 'a4' ? [595.28, 841.89] : [612, 792];
                const landscape = w > h;
                pw = landscape ? bh : bw;
                ph = landscape ? bw : bh;
                const margin = 24;
                const s = Math.min((pw - 2 * margin) / w, (ph - 2 * margin) / h);
                iw = w * s;
                ih = h * s;
                ix = (pw - iw) / 2;
                iy = (ph - ih) / 2;
            }
            const orientation = pw > ph ? 'landscape' : 'portrait';
            if (!doc) doc = new jsPDF({ unit: 'pt', format: [pw, ph], orientation });
            else doc.addPage([pw, ph], orientation);
            doc.addImage(canvasToDataUrl(item.canvas, fmt), fmt, ix, iy, iw, ih);
            await new Promise((r) => setTimeout(r)); // let the UI breathe between pages
        }
        doc.save(`${state.baseName}_crops.pdf`);
        toast('PDF created');
    } catch (err) {
        console.error(err);
        toast('Could not create the PDF.');
    } finally {
        els.makePdf.disabled = false;
    }
}
els.makePdf.addEventListener('click', createPdf);

// Re-fit when the window is resized and the user hasn't zoomed manually beyond the container.
window.addEventListener('resize', () => {
    if (state.pages[0] && state.pages[0].baseW * state.zoom > els.viewer.clientWidth) {
        els.zoomFit.click();
    }
});