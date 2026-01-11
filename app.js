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
    selfieSegmentation.setOptions({ modelSelection: 1 }); // High Quality
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
    
    initMediaPipe();
    processBtn.disabled = false;
}

// --- 3. UI HANDLERS ---
countrySelect.addEventListener('change', () => {
    if (cropper) {
        cropper.setAspectRatio(parseFloat(countrySelect.value));
    }
});

outputMode.addEventListener('change', () => {
    if (outputMode.value === 'single') {
        qtyContainer.classList.add('hidden');
    } else {
        qtyContainer.classList.remove('hidden');
    }
});

// --- 4. PROCESS BUTTON ---
processBtn.addEventListener('click', async () => {
    if (!cropper || !selfieSegmentation) return;

    processBtn.disabled = true;
    updateStatus("Processing (Smooth Mode)...", "bg-blue-50 text-blue-700 border-blue-200");

    try {
        // Get crop (High Quality)
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 800, 
            height: 800,
            imageSmoothingQuality: 'high'
        });

        if (!croppedCanvas) throw new Error("Could not crop image.");
        await selfieSegmentation.send({image: croppedCanvas});

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-50 text-red-700 border-red-200");
        processBtn.disabled = false;
    }
});

// --- 5. AI RESULT HANDLER (Restored Smoothness) ---
function onAIResults(results) {
    updateStatus("Generating Final Output...", "bg-yellow-50 text-yellow-700 border-yellow-200");

    // 1. Setup Temp Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = results.image.width;
    tempCanvas.height = results.image.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 2. Draw Mask
    // We removed the "Erosion/Threshold" loop here. 
    // This goes back to the standard smooth mask you liked.
    tempCtx.drawImage(results.segmentationMask, 0, 0, tempCanvas.width, tempCanvas.height);

    // 3. Composite Person
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(results.image, 0, 0, tempCanvas.width, tempCanvas.height);

    // 4. Generate Final Result
    const subjectImg = new Image();
    subjectImg.onload = () => {
        finalizeOutput(subjectImg);
    };
    subjectImg.src = tempCanvas.toDataURL();
}

// --- 6. FINAL GENERATION (Single or Sheet) ---
function finalizeOutput(subjectImg) {
    const isSingle = outputMode.value === 'single';
    const bg = document.getElementById('bgColor').value;
    
    // Get target dimensions from the select dropdown data attributes
    const option = countrySelect.options[countrySelect.selectedIndex];
    // Dimensions in pixels @ 300 DPI
    const targetW = parseInt(option.dataset.w) || 600;
    const targetH = parseInt(option.dataset.h) || 600;

    if (isSingle) {
        // --- SINGLE HEADSHOT MODE ---
        canvas.width = targetW;
        canvas.height = targetH;
        
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(subjectImg, 0, 0, targetW, targetH);
        
        downloadLink.download = "passport-headshot.jpg";
    } 
    else {
        // --- 4x6 SHEET MODE ---
        // 4x6 inches @ 300 DPI = 1200x1800 (Landscape)
        canvas.width = 1800; 
        canvas.height = 1200;

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tiling Logic
        const reqCount = parseInt(photoCount.value) || 6;
        
        // Calculate max columns/rows
        const cols = Math.floor(canvas.width / targetW);
        const rows = Math.floor(canvas.height / targetH);
        const maxFit = cols * rows;
        
        // Use user count, but don't exceed what physically fits
        const limit = Math.min(reqCount, maxFit);

        // Calculate centering offsets (margin)
        const totalW = cols * targetW;
        const totalH = rows * targetH;
        const marginX = (canvas.width - totalW) / 2;
        const marginY = (canvas.height - totalH) / 2;

        ctx.strokeStyle = '#cccccc'; // Grey cutting guide
        ctx.lineWidth = 2;

        for (let i = 0; i < limit; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            
            const x = marginX + (c * targetW);
            const y = marginY + (r * targetH);

            // Draw Photo
            ctx.drawImage(subjectImg, x, y, targetW, targetH);
            
            // Draw Cutting Border
            ctx.strokeRect(x, y, targetW, targetH);
        }

        downloadLink.download = "passport-sheet-4x6.jpg";
    }

    // Finalize
    downloadLink.href = canvas.toDataURL('image/jpeg', 1.0);
    
    resultSection.classList.remove('hidden');
    updateStatus("Success!", "bg-green-50 text-green-700 border-green-200");
    processBtn.disabled = false;
    
    // Scroll to result
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function updateStatus(msg, classes) {
    statusContainer.className = `p-4 rounded-lg text-center text-sm font-bold border ${classes}`;
    statusContainer.innerText = msg;
    statusContainer.classList.toggle('hidden', !msg);
}