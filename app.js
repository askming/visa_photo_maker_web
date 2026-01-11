// 1. IMPORT TRANSFORMERS V3 (The Fix)
// We use the official Hugging Face CDN. This version supports the new architecture.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4';

// 2. CONFIGURATION
// Skip local model checks to force fetching the correct files from the Hub
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
let segmenter = null; // The AI Model

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

// --- 3. AI PROCESSING (RMBG-1.4) ---
processBtn.addEventListener('click', async () => {
    if (!cropper) return;
    processBtn.disabled = true;

    try {
        // A. Get High-Res Crop
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1024, // High resolution for better AI accuracy
            height: 1024,
            imageSmoothingQuality: 'high'
        });
        const cropUrl = croppedCanvas.toDataURL('image/png');

        // B. Load Model (Lazy Load)
        if (!segmenter) {
            updateStatus("Downloading RMBG-1.4 Model (70MB)... This happens once.", true);
            
            // This is the SOTA model for background removal
            segmenter = await pipeline('image-segmentation', 'briaai/RMBG-1.4', {
                device: 'webgpu', // Try GPU first, fallback to CPU automatically
            });
        }

        // C. Run Inference
        updateStatus("AI is removing background...", true);
        const output = await segmenter(cropUrl);

        // D. Composite Result
        updateStatus("Generating Final Sheet...", true);
        
        // The output is a list of masks. For this model, output[0] is the mask.
        const mask = output[0].mask; 
        await compositeImage(croppedCanvas, mask);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, false);
        processBtn.disabled = false;
    }
});

// --- 4. COMPOSITING ---
async function compositeImage(originalCanvas, maskRawImage) {
    // 1. Convert the AI mask (RawImage) to a Canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskRawImage.width;
    maskCanvas.height = maskRawImage.height;
    const maskCtx = maskCanvas.getContext('2d');
    
    // Put mask data
    const maskData = new ImageData(
        new Uint8ClampedArray(maskRawImage.data),
        maskRawImage.width,
        maskRawImage.height
    );
    maskCtx.putImageData(maskData, 0, 0);

    // 2. Create Composition Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalCanvas.width;
    tempCanvas.height = originalCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 3. Draw Mask (Grayscale)
    // We scale the mask to match the original image size exactly
    tempCtx.drawImage(maskCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

    // 4. Source-In (Keep only what overlaps with the white parts of the mask)
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(originalCanvas, 0, 0);

    // 5. Load result as Image for final tiling
    const subjectImg = new Image();
    subjectImg.onload = () => finalizeOutput(subjectImg);
    subjectImg.src = tempCanvas.toDataURL();
}

// --- 5. FINAL OUTPUT GENERATOR ---
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
        // 4x6 Sheet (1800x1200)
        canvas.width = 1800; 
        canvas.height = 1200;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const reqCount = parseInt(photoCount.value) || 6;
        const cols = Math.floor(canvas.width / targetW);
        const rows = Math.floor(canvas.height / targetH);
        const limit = Math.min(reqCount, cols * rows);

        // Centering
        const startX = (canvas.width - (cols * targetW)) / 2;
        const startY = (canvas.height - (rows * targetH)) / 2;

        ctx.strokeStyle = '#e5e7eb'; // Light grey guide
        ctx.lineWidth = 2;

        for (let i = 0; i < limit; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const x = startX + (c * targetW);
            const y = startY + (r * targetH);

            ctx.drawImage(subjectImg, x, y, targetW, targetH);
            
            // Draw cutting guide ON TOP
            ctx.strokeRect(x, y, targetW, targetH);
        }
        downloadLink.download = "passport-sheet.jpg";
    }

    downloadLink.href = canvas.toDataURL('image/jpeg', 0.95);
    
    // UI Cleanup
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