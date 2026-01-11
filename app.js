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
        modelSelection: 1, // 1 = High Quality (slower but better edges)
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
    updateStatus("Processing (Applying Hard Cut Filter)...", "bg-blue-50 text-blue-700 border-blue-200");

    try {
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 800,
            height: 800,
        });

        if (!croppedCanvas) throw new Error("Could not crop image.");

        // Send to MediaPipe
        await selfieSegmentation.send({image: croppedCanvas});

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-50 text-red-700 border-red-200");
        processBtn.disabled = false;
    }
});

// --- 5. AI RESULT HANDLER (IMPROVED) ---
function onAIResults(results) {
    updateStatus("Generating Sheet with Cutting Guides...", "bg-yellow-50 text-yellow-700 border-yellow-200");

    // 1. Setup Temp Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = results.image.width;
    tempCanvas.height = results.image.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 2. DRAW MASK
    tempCtx.drawImage(results.segmentationMask, 0, 0, tempCanvas.width, tempCanvas.height);

    // --- FIX: HARD CUT FILTER ---
    // This removes the "fuzzy" residuals by forcing pixels to be either 100% visible or 100% transparent.
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // data[i] is the Red channel (0-255). 
        // If the confidence is high enough (>100), keep it. Otherwise, delete it.
        const confidence = data[i]; 
        if (confidence > 100) { 
            data[i+3] = 255; // Fully Opaque (Keep)
        } else {
            data[i+3] = 0;   // Fully Transparent (Delete)
        }
    }
    // Put the "Cleaned" mask back
    tempCtx.putImageData(imageData, 0, 0);

    // 3. COMPOSITE
    // Now we draw the original person ON TOP of the cleaned mask
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(results.image, 0, 0, tempCanvas.width, tempCanvas.height);

    // 4. GENERATE FINAL
    const subjectImg = new Image();
    subjectImg.onload = () => {
        generateSheet(subjectImg);
    };
    subjectImg.src = tempCanvas.toDataURL();
}

// --- 6. TILE GENERATOR (WITH GREY BORDERS) ---
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

    // Setup Cutting Guide Style
    ctx.strokeStyle = '#cccccc'; // Light Grey
    ctx.lineWidth = 4;           // Thickness (4px on 300DPI is very thin)

    for (let i = 0; i < 6; i++) {
        const gx = (i % 3) * size;
        const gy = Math.floor(i / 3) * size;

        // Draw Photo
        ctx.drawImage(subjectImg, gx + ox, gy + oy, dw, dh);
        
        // --- FIX: DRAW CUTTING BORDER ---
        // Draw a rectangle around the photo slot
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