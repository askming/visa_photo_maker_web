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

    // Reset previous state
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    cropSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    updateStatus('', 'hidden');

    // Load image
    const url = URL.createObjectURL(file);
    previewImage.src = url;

    // Wait for image load to init Cropper
    previewImage.onload = () => {
        initCropper();
    };
});

// Initialize Cropper instance
function initCropper() {
    const aspectRatio = parseFloat(countrySelect.value);
    
    cropper = new Cropper(previewImage, {
        aspectRatio: aspectRatio,
        viewMode: 1,      // Restrict crop box to image bounds
        dragMode: 'move', // Allow moving the image
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
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

    // UI Updates
    processBtn.disabled = true;
    updateStatus("Step 1/3: Downloading AI Brain (Wait ~30s)...", "bg-yellow-100 text-yellow-800");

    try {
        // A. Get the cropped image from Cropper.js
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1000, // High resolution for quality
            height: 1000,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        if (!croppedCanvas) throw new Error("Could not crop image. Please try again.");

        // B. Convert Canvas to Blob for the AI
        const imageBlob = await new Promise(resolve => croppedCanvas.toBlob(resolve, 'image/jpeg', 0.95));

        // C. Check if Library is Loaded
        // The script in index.html creates 'window.imgly'
        if (typeof imgly === 'undefined') {
            throw new Error("AI Library failed to load. Check your internet connection.");
        }

        // D. Configure AI (Point to UNPKG for data)
        // This fixes the "Resource Not Found" error
        const config = {
            publicPath: "https://unpkg.com/@imgly/background-removal-data@1.5.5/dist/",
            progress: (key, current, total) => {
                const percent = Math.round((current / total) * 100);
                if (percent) updateStatus(`Downloading AI Model: ${percent}%`, "bg-yellow-100 text-yellow-800");
            }
        };

        // E. Run Background Removal
        updateStatus("Step 2/3: Removing Background...", "bg-blue-100 text-blue-800");
        const removedBgBlob = await imgly.removeBackground(imageBlob, config);
        const subjectImg = await loadImage(URL.createObjectURL(removedBgBlob));

        // F. Generate Sheet
        updateStatus("Step 3/3: Generating 4x6 Sheet...", "bg-blue-100 text-blue-800");
        generateSheet(subjectImg);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-100 text-red-800");
        processBtn.disabled = false;
    }
});

// --- 4. GENERATE 4x6 SHEET ---
function generateSheet(subjectImg) {
    // 4x6 inches @ 300 DPI = 1200x1800 px
    // (We use 1800x1200 for landscape 6x4 paper)
    canvas.width = 1800;
    canvas.height = 1200;

    // Fill Background
    ctx.fillStyle = document.getElementById('bgColor').value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tile 6 Photos
    // Target size for each photo on the sheet (2 inches = 600px)
    const size = 600; 
    
    // We need to fit the cropped image (which might be rectangular) into the 600x600 slot
    // keeping aspect ratio correct.
    const aspectRatio = subjectImg.width / subjectImg.height;
    let drawWidth, drawHeight;

    if (aspectRatio > 1) {
        // Wider than tall
        drawWidth = size;
        drawHeight = size / aspectRatio;
    } else {
        // Taller than wide (Standard passport)
        drawHeight = size;
        drawWidth = size * aspectRatio;
    }
    
    // Centering offsets
    const offsetX = (size - drawWidth) / 2;
    const offsetY = (size - drawHeight) / 2;

    for (let i = 0; i < 6; i++) {
        const gridX = (i % 3) * size; // Column position
        const gridY = Math.floor(i / 3) * size; // Row position
        
        ctx.drawImage(subjectImg, gridX + offsetX, gridY + offsetY, drawWidth, drawHeight);
    }

    // Finish
    downloadLink.href = canvas.toDataURL('image/jpeg', 1.0);
    downloadLink.download = "passport-sheet.jpg";
    
    resultSection.classList.remove('hidden');
    updateStatus("Success! Download your sheet below.", "bg-green-100 text-green-800");
    processBtn.disabled = false;
}

// Helpers
function updateStatus(msg, classes) {
    statusContainer.className = `p-4 rounded-lg text-center text-sm font-bold ${classes}`;
    statusContainer.innerText = msg;
    statusContainer.classList.toggle('hidden', !msg);
}

function loadImage(url) {
    return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
}