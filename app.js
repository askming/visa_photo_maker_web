// DOM Elements
const uploadInput = document.getElementById('upload');
const cropArea = document.getElementById('cropArea');
const resultArea = document.getElementById('resultArea');
const placeholder = document.getElementById('placeholder');
const previewImage = document.getElementById('previewImage');
const countrySelect = document.getElementById('countrySelect');
const tuningSection = document.getElementById('tuningSection');
const outputMode = document.getElementById('outputMode');
const processBtn = document.getElementById('processBtn');
const reprocessBtn = document.getElementById('reprocessBtn');
const editCropBtn = document.getElementById('editCropBtn');
const statusContainer = document.getElementById('statusContainer');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadLink = document.getElementById('downloadLink');

// Sliders
const rangeShrink = document.getElementById('rangeShrink');
const rangeSoft = document.getElementById('rangeSoft');
const rangeCut = document.getElementById('rangeCut');

// State
let cropper = null;
let segmenter = null;
let lastResult = null; // Stores the raw AI output for re-tuning

// --- 1. SETUP GOOGLE AI (Reliable Engine) ---
function initMediaPipe() {
    if (segmenter) return;
    segmenter = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    segmenter.setOptions({ modelSelection: 1 }); // 1 = Landscape (High Quality)
    segmenter.onResults(onAIResults);
}

// --- 2. UPLOAD & CROP ---
uploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (cropper) cropper.destroy();
    
    cropArea.classList.remove('hidden');
    resultArea.classList.add('hidden');
    placeholder.classList.add('hidden');
    tuningSection.classList.add('hidden');
    
    previewImage.src = URL.createObjectURL(file);
    previewImage.onload = () => {
        const ratio = parseFloat(countrySelect.value);
        cropper = new Cropper(previewImage, {
            aspectRatio: ratio,
            viewMode: 1,
            autoCropArea: 0.85
        });
        processBtn.disabled = false;
        initMediaPipe();
    };
});

countrySelect.addEventListener('change', () => {
    if (cropper) cropper.setAspectRatio(parseFloat(countrySelect.value));
});

// --- 3. PROCESS BUTTON ---
processBtn.addEventListener('click', async () => {
    if (!cropper) return;
    processBtn.disabled = true;
    updateStatus("Processing...");

    const croppedCanvas = cropper.getCroppedCanvas({ width: 800, height: 800 });
    await segmenter.send({ image: croppedCanvas });
});

// --- 4. AI CALLBACK & TUNING ---
function onAIResults(results) {
    lastResult = results; // Save for slider adjustments
    applyMask(); // Run the mask logic
    
    // UI Updates
    cropArea.classList.add('hidden');
    resultArea.classList.remove('hidden');
    tuningSection.classList.remove('hidden');
    processBtn.disabled = false;
    updateStatus("Done!");
}

// --- 5. THE TUNABLE MASK LOGIC (The Fix) ---
function applyMask() {
    if (!lastResult) return;

    const shrinkVal = parseFloat(rangeShrink.value); // e.g. 2.0
    const softVal = parseFloat(rangeSoft.value);     // e.g. 2.0
    const cutVal = parseFloat(rangeCut.value);       // e.g. 0.5

    // Update labels
    document.getElementById('valShrink').innerText = shrinkVal.toFixed(1);
    document.getElementById('valSoft').innerText = softVal.toFixed(1);
    document.getElementById('valCut').innerText = cutVal.toFixed(2);

    const width = lastResult.image.width;
    const height = lastResult.image.height;

    // A. Draw Raw Mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(lastResult.segmentationMask, 0, 0, width, height);

    // B. Shrink (Erosion via Blur + Threshold)
    // If we blur the mask and then cut it high, the white area shrinks.
    if (shrinkVal > 0) {
        maskCtx.filter = `blur(${shrinkVal}px)`;
        maskCtx.drawImage(maskCanvas, 0, 0, width, height); // Apply blur in place
        maskCtx.filter = 'none';
    }

    // C. Apply Cut Threshold
    const imageData = maskCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const threshold = cutVal * 255;

    for (let i = 0; i < data.length; i += 4) {
        // data[i] is Red channel (mask confidence 0-255)
        if (data[i] > threshold) {
            data[i+3] = 255; // Keep Opaque
        } else {
            data[i+3] = 0;   // Make Transparent
        }
    }
    maskCtx.putImageData(imageData, 0, 0);

    // D. Soften Edges (Final Blur)
    if (softVal > 0) {
        // Create a temp canvas to hold the hard cut
        const hardCutCanvas = document.createElement('canvas');
        hardCutCanvas.width = width;
        hardCutCanvas.height = height;
        hardCutCanvas.getContext('2d').putImageData(imageData, 0, 0);
        
        // Clear main mask and draw the hard cut with blur
        maskCtx.clearRect(0,0,width,height);
        maskCtx.filter = `blur(${softVal}px)`;
        maskCtx.drawImage(hardCutCanvas, 0, 0);
        maskCtx.filter = 'none';
    }

    // E. Composite
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw Mask
    tempCtx.drawImage(maskCanvas, 0, 0);
    // Source-In (Keep person)
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.drawImage(lastResult.image, 0, 0);

    // F. Final Output
    const subjectImg = new Image();
    subjectImg.onload = () => generateOutput(subjectImg);
    subjectImg.src = tempCanvas.toDataURL();
}

// Button listener for slider apply
reprocessBtn.addEventListener('click', applyMask);
// Also live update on slider change (optional, might be slow on old phones)
rangeShrink.addEventListener('change', applyMask);
rangeSoft.addEventListener('change', applyMask);
rangeCut.addEventListener('change', applyMask);

// --- 6. OUTPUT GENERATOR ---
function generateOutput(subjectImg) {
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
        downloadLink.download = "passport-single.jpg";
    } else {
        // Sheet Mode
        canvas.width = 1800; canvas.height = 1200;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const cols = Math.floor(canvas.width / targetW);
        const rows = Math.floor(canvas.height / targetH);
        const limit = cols * rows; // Max fit
        
        const startX = (canvas.width - (cols * targetW)) / 2;
        const startY = (canvas.height - (rows * targetH)) / 2;

        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 2;

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
}

// Back Button
editCropBtn.addEventListener('click', () => {
    resultArea.classList.add('hidden');
    tuningSection.classList.add('hidden');
    cropArea.classList.remove('hidden');
});

function updateStatus(msg) {
    statusContainer.classList.remove('hidden');
    statusContainer.innerText = msg;
}