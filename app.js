// 1. IMPORT STABLE LIBRARY (v2.17.2)
// This version guarantees support for RMBG-1.4
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// 2. CONFIGURATION
env.allowLocalModels = false;
env.useBrowserCache = true;

// DOM Elements
const uploadInput = document.getElementById('upload');
const cropSection = document.getElementById('cropSection');
const optionsSection = document.getElementById('optionsSection');
const actionSection = document.getElementById('actionSection');
const previewImage = document.getElementById('previewImage');
const countrySelect = document.getElementById('countrySelect');
const outputMode = document.getElementById('outputMode');
const photoCount = document.getElementById('photoCount');
const qtyContainer = document.getElementById('qtyContainer');
const processBtn = document.getElementById('processBtn');
const statusContainer = document.getElementById('statusContainer');
const statusText = document.getElementById('statusText');
const resultSection = document.getElementById('resultSection');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadLink = document.getElementById('downloadLink');

// State
let cropper = null;
let segmenter = null;

// --- 1. HANDLE UPLOAD ---
uploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    cropSection.classList.remove('hidden');
    optionsSection.classList.remove('hidden');
    actionSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    statusContainer.classList.add('hidden');

    const url = URL.createObjectURL(file);
    previewImage.src = url;

    previewImage.onload = () => {
        initCropper();
    };
});

function initCropper() {
    const aspectRatio = parseFloat(countrySelect.value);
    
    cropper = new Cropper(previewImage, {
        aspectRatio: aspectRatio,
        viewMode: 1, 
        dragMode: 'move',
        autoCropArea: 0.85,
        guides: true,
        center: true,
        background: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
    });
}

// --- 2. UI HANDLERS ---
countrySelect.addEventListener('change', () => {
    if (cropper) cropper.setAspectRatio(parseFloat(countrySelect.value));
});

outputMode.addEventListener('change', () => {
    if (outputMode.value === 'single') {
        qtyContainer.classList.add('hidden');
    } else {
        qtyContainer.classList.remove('hidden');
    }
});

// --- 3. RUN AI (RMBG-1.4) ---
processBtn.addEventListener('click', async () => {
    if (!cropper) return;
    processBtn.disabled = true;

    try {
        // A. Get High-Res Crop
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1024,
            height: 1024,
            imageSmoothingQuality: 'high'
        });
        const cropUrl = croppedCanvas.toDataURL('image/png');

        // B. Load Model
        if (!segmenter) {
            updateStatus("Downloading AI Model (RMBG-1.4)... This happens once.", true);
            // 'Xenova/birefnet' is also an option, but RMBG-1.4 is standard for v2.17.2
            segmenter = await pipeline('image-segmentation', 'briaai/RMBG-1.4');
        }

        // C. Run Inference
        updateStatus("Processing (High Precision)...", true);
        const output = await segmenter(cropUrl);

        // D. Composite
        updateStatus("Generating Final Sheet...", true);
        
        // In v2.17.2, the output is an array of masks.
        // We need to convert the first mask to an ImageBitmap.
        const mask = output[0].mask; 
        await compositeImage(croppedCanvas, mask);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, false);
        processBtn.disabled = false;
    }
});

// --- 4. COMPOSITING ---
async function compositeImage(originalCanvas, maskRaw) {
    // Convert the mask (which comes as a RawImage in v2) to a canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskRaw.width;
    maskCanvas.height = maskRaw.height;
    const maskCtx = maskCanvas.getContext('2d');
    
    // Draw the mask data
    // In v2.17.2, .mask might be a 'RawImage' object which has .toCanvas() method? 
    // Or we might need to putImageData. Let's try the safest way.
    
    // Check if it has a .toCanvas() (common in Xenova utils)
    let maskBitmap;
    if (typeof maskRaw.toCanvas === 'function') {
        const c = maskRaw.toCanvas();
        maskBitmap = c;
    } else {
        // Fallback: Create from pixel data
        const imageData = new ImageData(
            new Uint8ClampedArray(maskRaw.data),
            maskRaw.width,
            maskRaw.height
        );
        maskCtx.putImageData(imageData, 0, 0);
        maskBitmap = maskCanvas;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalCanvas.width;
    tempCanvas.height = originalCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw Mask
    tempCtx.drawImage(maskBitmap, 0, 0, tempCanvas.width, tempCanvas.height);

    // Source-In Composite
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(originalCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

    const subjectImg = new Image();
    subjectImg.onload = () => finalizeOutput(subjectImg);
    subjectImg.src = tempCanvas.toDataURL();
}

// --- 5. SHEET GENERATION ---
function finalizeOutput(subjectImg) {
    const isSingle = outputMode.value === 'single';
    const bg = document.getElementById('bgColor').value;
    const option = countrySelect.options[countrySelect.selectedIndex];
    const targetW = parseInt(option.dataset.w) || 600;
    const targetH = parseInt(option.dataset.h) || 600;

    if (isSingle) {
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(subjectImg, 0, 0, targetW, targetH);
        downloadLink.download = "passport-headshot.png";
    } else {
        canvas.width = 1800; 
        canvas.height = 1200;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const reqCount = parseInt(photoCount.value) || 6;
        const cols = Math.floor(canvas.width / targetW);
        const rows = Math.floor(canvas.height / targetH);
        const limit = Math.min(reqCount, cols * rows);

        const startX = (canvas.width - (cols * targetW)) / 2;
        const startY = (canvas.height - (rows * targetH)) / 2;

        ctx.strokeStyle = '#e5e7eb'; // Light grey
        ctx.lineWidth = 2;

        for (let i = 0; i < limit; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const x = startX + (c * targetW);
            const y = startY + (r * targetH);

            ctx.drawImage(subjectImg, x, y, targetW, targetH);
            ctx.strokeRect(x, y, targetW, targetH);
        }
        downloadLink.download = "passport-sheet.jpg";
    }

    downloadLink.href = canvas.toDataURL('image/jpeg', 0.95);
    
    statusContainer.classList.add('hidden');
    resultSection.classList.remove('hidden');
    processBtn.disabled = false;
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function updateStatus(msg, showSpinner) {
    statusContainer.classList.remove('hidden');
    statusText.innerText = msg;
    const spinner = statusContainer.querySelector('.spinner');
    if (showSpinner) spinner.classList.remove('hidden');
    else spinner.classList.add('hidden');
}