// DOM Elements
const uploadInput = document.getElementById('upload');
const wrapper = document.getElementById('wrapper');
const previewImage = document.getElementById('preview-image');
const placeholderText = document.getElementById('placeholder-text');
const processBtn = document.getElementById('processBtn');
const statusDiv = document.getElementById('status');
const resultSection = document.getElementById('resultSection');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadLink = document.getElementById('downloadLink');

// State
let cropper = null;

// --- 1. HANDLE UPLOAD ---
uploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset UI
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    placeholderText.classList.add('hidden');
    wrapper.classList.remove('hidden');
    resultSection.classList.add('hidden');
    updateStatus('', 'hidden');

    // Load Image
    const url = URL.createObjectURL(file);
    previewImage.src = url;

    // Initialize Cropper (Wait for image to load first)
    previewImage.onload = () => {
        cropper = new Cropper(previewImage, {
            aspectRatio: 1, // Square for passport
            viewMode: 1,    // 1 = Restrict crop box to not exceed image
            dragMode: 'move',
            autoCropArea: 0.8,
            responsive: true,
        });
        processBtn.disabled = false;
    };
});

// --- 2. PROCESS BUTTON ---
processBtn.addEventListener('click', async () => {
    if (!cropper) return;
    
    // Lock UI
    processBtn.disabled = true;
    processBtn.innerText = "Processing...";
    
    try {
        // A. Get Cropped Image (High Quality)
        const croppedCanvas = cropper.getCroppedCanvas({
            width: 1000, 
            height: 1000
        });
        
        if (!croppedCanvas) throw new Error("Could not crop image");

        // B. Convert to Blob
        const blob = await new Promise(resolve => croppedCanvas.toBlob(resolve, 'image/jpeg', 0.95));

        // C. Check Library
        // The script in index.html creates a global 'imgly' object
        if (typeof imgly === 'undefined') {
            throw new Error("AI Library failed to load. Please refresh the page.");
        }

        updateStatus("Step 1/2: Downloading AI Brain (Wait ~20s)...", "bg-yellow-100 text-yellow-800");

        // D. Configure AI
        // We use UNPKG for the data because it is more reliable for folder access
        const config = {
            publicPath: "https://unpkg.com/@imgly/background-removal-data@1.5.5/dist/",
            progress: (key, current, total) => {
                const pct = Math.round((current / total) * 100);
                if (pct) updateStatus(`Downloading AI: ${pct}%`, "bg-yellow-100 text-yellow-800");
            }
        };

        // E. Run Background Removal
        updateStatus("Step 2/2: Removing Background...", "bg-blue-100 text-blue-800");
        const removedBgBlob = await imgly.removeBackground(blob, config);
        const subjectImg = await loadImage(URL.createObjectURL(removedBgBlob));

        // F. Generate 4x6 Sheet
        generateSheet(subjectImg);

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, "bg-red-100 text-red-800");
        processBtn.disabled = false;
        processBtn.innerText = "Crop & Process";
    }
});

// --- 3. GENERATE SHEET ---
function generateSheet(subjectImg) {
    // 4x6 inches @ 300 DPI = 1200x1800 pixels
    // Note: Standard landscape is 6x4 (1800x1200)
    canvas.width = 1800;
    canvas.height = 1200;

    // Fill Background
    ctx.fillStyle = document.getElementById('bgColor').value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tile 6 Images (2x2 inches = 600px)
    const size = 600;
    for (let i = 0; i < 6; i++) {
        const x = (i % 3) * size;
        const y = Math.floor(i / 3) * size;
        
        // Draw the square subject directly
        ctx.drawImage(subjectImg, x, y, size, size);
    }

    // Finish
    downloadLink.href = canvas.toDataURL('image/jpeg', 0.95);
    downloadLink.download = "passport-sheet.jpg";
    
    resultSection.classList.remove('hidden');
    updateStatus("Success! Sheet Ready.", "bg-green-100 text-green-800");
    processBtn.disabled = false;
    processBtn.innerText = "Crop & Process";
}

// Helpers
function updateStatus(msg, classes) {
    statusDiv.className = `p-3 rounded-lg text-center text-sm font-bold ${classes}`;
    statusDiv.innerText = msg;
    statusDiv.classList.toggle('hidden', !msg);
}

function loadImage(url) {
    return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
}