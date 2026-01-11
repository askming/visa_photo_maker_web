// Import Transformers.js from CDN
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

// Configuration: Stop it from looking for local files
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
const resultSection = document.getElementById('resultSection');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadLink = document.getElementById('downloadLink');

// State
let cropper = null;
let matteModel = null; // This will hold our AI

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
    updateStatus('', 'hidden');

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

// --- 3. THE AI PROCESS ---
processBtn.addEventListener('click', async () => {
    if (!cropper) return;
    
    processBtn.disabled = true;

    try {
        // 1. Get Crop
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1024, // ModNet likes higher res
            height: 1024,
            imageSmoothingQuality: 'high'
        });
        if (!croppedCanvas) throw new Error("Could not crop image.");
        
        const imageUrl = croppedCanvas.toDataURL('image/png');

        // 2. Load AI (Lazy Load)
        if (!matteModel) {
            updateStatus("Downloading HD AI Model (40MB)... This happens once.", "bg-blue-100 text-blue-800 border-blue-200");
            
            // We use 'image-segmentation' pipeline with ModNet
            matteModel = await pipeline('image-segmentation', 'Xenova/modnet');
        }

        updateStatus("AI is analyzing hair & edges...", "bg-purple-100 text-purple-800 border-purple-200");

        // 3. Run Inference
        const result = await matteModel(imageUrl);
        
        // ModNet returns a mask (alpha matte)
        // We need to composite it.
        await processOutput(result, croppedCanvas);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-100 text-red-800 border-red-200");
        processBtn.disabled = false;
    }
});

// --- 4. COMPOSITING ---
async function processOutput(prediction, originalCanvas) {
    updateStatus("Generating Final Image...", "bg-yellow-100 text-yellow-800 border-yellow-200");

    // The prediction is a mask. We need to create a canvas from it.
    // Transformers.js returns a mask object that has a .toCanvas() method? 
    // Usually it returns a RawImage or similar.
    
    // For 'image-segmentation' pipeline, the output is usually [{ mask: Jimp/RawImage, label: ... }]
    // Or just the mask if it's ModNet.
    
    // Let's handle the mask data safely
    const mask = prediction[0].mask; // It returns an array of results
    
    // Convert mask to bitmap
    const maskBitmap = await createImageBitmap(mask);

    // Create a temp canvas to combine Image + Mask
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalCanvas.width;
    tempCanvas.height = originalCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw Mask
    tempCtx.drawImage(maskBitmap, 0, 0, tempCanvas.width, tempCanvas.height);

    // Composite Source (Keep only the white parts of mask)
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(originalCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

    // Generate Final
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
        downloadLink.download = "passport-headshot.jpg";
    } else {
        // 4x6 inch @ 300 DPI
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

        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 4;

        for (let i = 0; i < limit; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const x = startX + (c * targetW);
            const y = startY + (r * targetH);

            ctx.drawImage(subjectImg, x, y, targetW, targetH);
            ctx.strokeRect(x, y, targetW, targetH);
        }
        downloadLink.download = "passport-sheet-4x6.jpg";
    }

    downloadLink.href = canvas.toDataURL('image/jpeg', 1.0);
    resultSection.classList.remove('hidden');
    updateStatus("Success! High-Quality Render Complete.", "bg-green-100 text-green-800 border-green-200");
    processBtn.disabled = false;
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function updateStatus(msg, classes) {
    statusContainer.className = `p-4 rounded-lg text-center text-sm font-bold border ${classes}`;
    statusContainer.innerText = msg;
    statusContainer.classList.toggle('hidden', !msg);
}