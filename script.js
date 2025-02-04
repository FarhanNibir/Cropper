const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const pdfContainer = document.getElementById('pdf-container');
const output = document.getElementById('output');
const cropButton = document.getElementById('crop-button');
let startX, startY, endX, endY;
let cropping = false;
let activeCanvas = null;
let cropArea = document.createElement('div');
cropArea.classList.add('crop-area');
document.body.appendChild(cropArea);

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '#e3e3e3';
});
uploadArea.addEventListener('dragleave', () => uploadArea.style.backgroundColor = '');
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '';
    handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

function handleFile(file) {
    if (!file) return;
    if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = () => renderPDF(new Uint8Array(reader.result));
        reader.readAsArrayBuffer(file);
    } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => loadImage(e.target.result);
        reader.readAsDataURL(file);
    }
}

function loadImage(src) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.addEventListener('mousedown', startSelection);
        pdfContainer.appendChild(canvas);
        cropButton.style.display = 'block';
    };
}

async function renderPDF(pdfData) {
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    pdfContainer.innerHTML = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        canvas.addEventListener('mousedown', startSelection);
        pdfContainer.appendChild(canvas);
    }
    cropButton.style.display = 'block';
}

function startSelection(event) {
    activeCanvas = event.target;
    cropping = true;
    startX = event.offsetX;
    startY = event.offsetY;
    cropArea.style.display = 'block';
    cropArea.style.left = event.pageX + 'px';
    cropArea.style.top = event.pageY + 'px';
    cropArea.style.width = '0px';
    cropArea.style.height = '0px';
}

document.addEventListener('mousemove', (event) => {
    if (!cropping) return;
    cropArea.style.width = Math.abs(event.pageX - parseInt(cropArea.style.left)) + 'px';
    cropArea.style.height = Math.abs(event.pageY - parseInt(cropArea.style.top)) + 'px';
});

document.addEventListener('mouseup', () => {
    cropping = false;
});

cropButton.addEventListener('click', () => {
    if (!activeCanvas || startX == null || startY == null) {
        alert('Please select an area to crop!');
        return;
    }
    cropSelectedArea(activeCanvas, startX, startY, parseInt(cropArea.style.width), parseInt(cropArea.style.height));
});

function cropSelectedArea(canvas, startX, startY, width, height) {
    if (width === 0 || height === 0) {
        alert('Please select a valid area to crop.');
        return;
    }
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = width;
    croppedCanvas.height = height;
    const croppedCtx = croppedCanvas.getContext('2d');
    croppedCtx.drawImage(canvas, startX, startY, width, height, 0, 0, width, height);
    const croppedImage = new Image();
    croppedImage.src = croppedCanvas.toDataURL();
    output.appendChild(croppedImage);
    cropArea.style.display = 'none';
}