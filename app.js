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
// This initializes the MediaPipe solution
function initMediaPipe() {
    if (selfieSegmentation) return; // Already loaded

    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
            // Point to Google's reliable CDN for the model files
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });

    selfieSegmentation.setOptions({
        modelSelection: 1, // 0 = Fast, 1 = High Quality
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
    
    // Initialize AI in background so it's ready
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
    updateStatus("Processing with Google AI...", "bg-blue-50 text-blue-700 border-blue-200");

    try {
        // Get high-res crop
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 800, // Good balance for MediaPipe
            height: 800,
        });

        if (!croppedCanvas) throw new Error("Could not crop image.");

        // Send to MediaPipe
        // This triggers 'onAIResults' when done
        await selfieSegmentation.send({image: croppedCanvas});

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-50 text-red-700 border-red-200");
        processBtn.disabled = false;
    }
});

// --- 5. AI RESULT HANDLER ---
function onAIResults(results) {
    // MediaPipe returns:
    // results.image (Original)
    // results.segmentationMask (The 'Cutout' Map)
    
    updateStatus("Generating Sheet...", "bg-yellow-50 text-yellow-700 border-yellow-200");

    // 1. Create a temporary canvas to composite the result
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = results.image.width;
    tempCanvas.height = results.image.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 2. Draw the Mask
    tempCtx.drawImage(results.segmentationMask, 0, 0, tempCanvas.width, tempCanvas.height);

    // 3. Composite: Keep only the person (source-in)
    // Everything that is 'white' in the mask keeps the image.
    // Everything 'black' becomes transparent.
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(results.image, 0, 0, tempCanvas.width, tempCanvas.height);

    // 4. Create an Image object from this result
    const subjectImg = new Image();
    subjectImg.onload = () => {
        generateSheet(subjectImg);
    };
    subjectImg.src = tempCanvas.toDataURL();
}

// --- 6. TILE GENERATOR ---
function generateSheet(subjectImg) {
    canvas.width = 1800;
    canvas.height = 1200;

    // Fill Background Color (User Selection)
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