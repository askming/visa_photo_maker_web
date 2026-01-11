// DOM Elements
const uploadInput = document.getElementById('upload');
const cropSection = document.getElementById('cropSection');
const previewImage = document.getElementById('previewImage');
const countrySelect = document.getElementById('countrySelect');
const processBtn = document.getElementById('processBtn');
const statusContainer = document.getElementById('statusContainer');
const resultSection = document.getElementById('resultSection');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadLink = document.getElementById('downloadLink');

// Global Variables
let cropper = null;
let selfieSegmentation = null;

// --- 1. SETUP GOOGLE AI ---
function initMediaPipe() {
    if (selfieSegmentation) return;

    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });

    selfieSegmentation.setOptions({
        modelSelection: 1, // 1 = High Quality
    });

    selfieSegmentation.onResults(onAIResults);
}

// --- 2. HANDLE UPLOAD ---
uploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    cropSection.classList.remove('hidden');
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
    
    initMediaPipe();
    processBtn.disabled = false;
}

// --- 3. HANDLE COUNTRY CHANGE ---
countrySelect.addEventListener('change', () => {
    if (cropper) {
        cropper.setAspectRatio(parseFloat(countrySelect.value));
    }
});

// --- 4. PROCESS BUTTON ---
processBtn.addEventListener('click', async () => {
    if (!cropper || !selfieSegmentation) return;

    processBtn.disabled = true;
    updateStatus("Processing (Shrinking Edges to Remove Noise)...", "bg-blue-50 text-blue-700 border-blue-200");

    try {
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 800,
            height: 800,
        });

        if (!croppedCanvas) throw new Error("Could not crop image.");

        await selfieSegmentation.send({image: croppedCanvas});

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-50 text-red-700 border-red-200");
        processBtn.disabled = false;
    }
});

// --- 5. AI RESULT HANDLER (The "Shrink & Soften" Fix) ---
function onAIResults(results) {
    updateStatus("Creating Sheet with Cutting Guides...", "bg-yellow-50 text-yellow-700 border-yellow-200");

    const width = results.image.width;
    const height = results.image.height;

    // 1. Prepare Layers
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');

    // 2. SMART EROSION (The "Shrink" Step)
    // First, draw the raw mask
    maskCtx.drawImage(results.segmentationMask, 0, 0, width, height);
    
    // Apply a blur. This spreads the edge pixels out.
    // By cutting ONLY the very high-confidence pixels later, we effectively 
    // "shave off" the outer blurry layer, shrinking the mask.
    maskCtx.filter = 'blur(4px)'; 
    maskCtx.drawImage(maskCanvas, 0, 0);
    maskCtx.filter = 'none'; // Reset

    // 3. APPLY THRESHOLD & COMPOSITE
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw the blurred mask
    tempCtx.drawImage(maskCanvas, 0, 0);

    // Get pixel data to apply the "High Threshold"
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const confidence = data[i]; // Red channel
        
        // AGGRESSIVE CUT: Only keep pixels that are extremely confident (>200/255).
        // Because we blurred it first, this high threshold forces the edge 
        // to retreat inward, removing the "halo" noise.
        if (confidence > 200) { 
            data[i+3] = 255; // Keep Opaque
        } else {
            data[i+3] = 0;   // Delete Transparent
        }
    }
    tempCtx.putImageData(imageData, 0, 0);

    // 4. Draw the original person inside this "Shrunk" mask
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(results.image, 0, 0);

    // 5. Generate Final Sheet
    const subjectImg = new Image();
    subjectImg.onload = () => {
        generateSheet(subjectImg);
    };
    subjectImg.src = tempCanvas.toDataURL();
}

// --- 6. TILE GENERATOR (With Cutting Guides) ---
function generateSheet(subjectImg) {
    canvas.width = 1800;
    canvas.height = 1200;

    // Fill Background
    ctx.fillStyle = document.getElementById('bgColor').value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const size = 600; 
    
    // Fit image logic
    const ratio = subjectImg.width / subjectImg.height;
    let dw, dh;
    
    if (ratio > 1) { dw = size; dh = size / ratio; }
    else { dh = size; dw = size * ratio; }

    const ox = (size - dw) / 2;
    const oy = (size - dh) / 2;

    for (let i = 0; i < 6; i++) {
        const gx = (i % 3) * size;
        const gy = Math.floor(i / 3) * size;

        // 1. Draw Photo
        ctx.drawImage(subjectImg, gx + ox, gy + oy, dw, dh);
        
        // 2. Draw Cutting Guide (Light Grey Border)
        // We draw this AFTER the photo to ensure it sits on top
        ctx.strokeStyle = '#d1d5db'; // Tailwind gray-300
        ctx.lineWidth = 2;           // Thin line for cutting
        ctx.strokeRect(gx, gy, size, size);
    }

    downloadLink.href = canvas.toDataURL('image/jpeg', 1.0);
    downloadLink.download = "passport-sheet.jpg";
    
    resultSection.classList.remove('hidden');
    updateStatus("Success! Ready to print.", "bg-green-50 text-green-700 border-green-200");
    processBtn.disabled = false;
}

function updateStatus(msg, classes) {
    statusContainer.className = `p-4 rounded-lg text-center text-sm font-bold border ${classes}`;
    statusContainer.innerText = msg;
    statusContainer.classList.toggle('hidden', !msg);
}