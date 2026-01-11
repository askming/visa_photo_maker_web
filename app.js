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

// --- 1. HANDLE UPLOAD & INIT CROPPER ---
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

    // Wait for image to load to avoid race conditions
    previewImage.onload = () => {
        initCropper();
    };
});

function initCropper() {
    const aspectRatio = parseFloat(countrySelect.value);
    
    cropper = new Cropper(previewImage, {
        aspectRatio: aspectRatio,
        viewMode: 1, // Restrict crop box to image size
        dragMode: 'move',
        autoCropArea: 0.85,
        guides: true,
        center: true,
        highlight: false,
        background: false,
        zoomable: false, // Simplifies UX
        movable: false,  // Keeps image static, moves crop box instead
        cropBoxMovable: true,
        cropBoxResizable: true,
    });
    
    processBtn.disabled = false;
}

// --- 2. HANDLE COUNTRY CHANGE ---
countrySelect.addEventListener('change', () => {
    if (cropper) {
        cropper.setAspectRatio(parseFloat(countrySelect.value));
    }
});

// --- 3. PROCESS BUTTON ---
processBtn.addEventListener('click', async () => {
    if (!cropper) return;

    processBtn.disabled = true;
    updateStatus("Connecting to AI Library...", "bg-blue-50 text-blue-700 border-blue-200");

    try {
        // A. Get the cropped image
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1000,
            height: 1000,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        if (!croppedCanvas) throw new Error("Could not crop image.");
        const imageBlob = await new Promise(r => croppedCanvas.toBlob(r, 'image/jpeg', 0.95));

        // B. DYNAMIC IMPORT (The Fix)
        // We import the ESM bundle. This works in your screenshots (Status 200).
        updateStatus("Downloading AI Code...", "bg-yellow-50 text-yellow-700 border-yellow-200");
        
        const module = await import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm");
        
        // UNIVERSAL FUNCTION FINDER
        // Handles both 'export default' and 'export named' scenarios
        const removeBackground = module.default || module.removeBackground || module;
        
        if (typeof removeBackground !== 'function') {
            throw new Error("Library loaded but function not found. Please reload.");
        }

        // C. CONFIGURATION (The Data Fix)
        // We point to UNPKG for the .wasm files to avoid 404s
        const config = {
            publicPath: "https://unpkg.com/@imgly/background-removal-data@1.4.5/dist/",
            progress: (key, current, total) => {
                const percent = Math.round((current / total) * 100);
                if (percent) updateStatus(`AI Processing: ${percent}%`, "bg-yellow-50 text-yellow-700 border-yellow-200");
            }
        };

        // D. EXECUTE
        const removedBgBlob = await removeBackground(imageBlob, config);
        const subjectImg = await loadImage(URL.createObjectURL(removedBgBlob));

        // E. GENERATE SHEET
        updateStatus("Creating 4x6 Sheet...", "bg-blue-50 text-blue-700 border-blue-200");
        generateSheet(subjectImg);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-50 text-red-700 border-red-200");
        processBtn.disabled = false;
    }
});

// --- 4. TILE GENERATOR ---
function generateSheet(subjectImg) {
    // 4x6 inches @ 300 DPI = 1200x1800 px (Landscape 6x4 paper: 1800x1200)
    canvas.width = 1800;
    canvas.height = 1200;

    // Background
    ctx.fillStyle = document.getElementById('bgColor').value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tiling Logic
    const size = 600; // 2 inches @ 300 DPI
    
    // Fit logic: contain the image within the square
    const ratio = subjectImg.width / subjectImg.height;
    let dw, dh;
    
    if (ratio > 1) { dw = size; dh = size / ratio; }
    else { dh = size; dw = size * ratio; }

    const ox = (size - dw) / 2;
    const oy = (size - dh) / 2;

    for (let i = 0; i < 6; i++) {
        const gx = (i % 3) * size;
        const gy = Math.floor(i / 3) * size;
        ctx.drawImage(subjectImg, gx + ox, gy + oy, dw, dh);
    }

    // Finish
    downloadLink.href = canvas.toDataURL('image/jpeg', 1.0);
    downloadLink.download = "passport-sheet.jpg";
    
    resultSection.classList.remove('hidden');
    updateStatus("Success! Your sheet is ready.", "bg-green-50 text-green-700 border-green-200");
    processBtn.disabled = false;
}

function updateStatus(msg, classes) {
    statusContainer.className = `p-4 rounded-lg text-center text-sm font-bold border ${classes}`;
    statusContainer.innerText = msg;
    statusContainer.classList.toggle('hidden', !msg);
}

function loadImage(url) {
    return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
}