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

// --- 1. HANDLE UPLOAD ---
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
    updateStatus("Processing...", "bg-blue-50 text-blue-700 border-blue-200");

    try {
        // A. Get the cropped image
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1000,
            height: 1000,
        });

        if (!croppedCanvas) throw new Error("Could not crop image.");
        const imageBlob = await new Promise(r => croppedCanvas.toBlob(r, 'image/jpeg', 0.95));

        // B. CHECK LIBRARY
        // We check if the global 'imgly' object exists
        if (typeof imgly === 'undefined') {
            throw new Error("AI Library failed to load. Please refresh the page.");
        }

        // C. CONFIGURATION (The Fix for 404s)
        // We point to UNPKG for the model files
        const config = {
            publicPath: "https://unpkg.com/@imgly/background-removal-data@1.5.5/dist/",
            progress: (key, current, total) => {
                const percent = Math.round((current / total) * 100);
                if (percent) updateStatus(`AI Processing: ${percent}%`, "bg-yellow-50 text-yellow-700 border-yellow-200");
            }
        };

        // D. EXECUTE (Global Function)
        updateStatus("Downloading AI Model...", "bg-yellow-50 text-yellow-700 border-yellow-200");
        const removedBgBlob = await imgly.removeBackground(imageBlob, config);
        const subjectImg = await loadImage(URL.createObjectURL(removedBgBlob));

        // E. GENERATE SHEET
        updateStatus("Generating Sheet...", "bg-blue-50 text-blue-700 border-blue-200");
        generateSheet(subjectImg);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-50 text-red-700 border-red-200");
        processBtn.disabled = false;
    }
});

// --- 4. TILE GENERATOR ---
function generateSheet(subjectImg) {
    canvas.width = 1800;
    canvas.height = 1200;

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
        ctx.drawImage(subjectImg, gx + ox, gy + oy, dw, dh);
    }

    downloadLink.href = canvas.toDataURL('image/jpeg', 1.0);
    downloadLink.download = "passport-sheet.jpg";
    
    resultSection.classList.remove('hidden');
    updateStatus("Success! Sheet Ready.", "bg-green-50 text-green-700 border-green-200");
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