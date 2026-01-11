// DOM Elements
const uploadInput = document.getElementById('upload');
const imageContainer = document.getElementById('image-container');
const previewImage = document.getElementById('preview-image');
const placeholderText = document.getElementById('placeholder-text');
const processBtn = document.getElementById('processBtn');
const btnText = document.getElementById('btnText');
const statusDiv = document.getElementById('status');
const resultSection = document.getElementById('resultSection');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadLink = document.getElementById('downloadLink');

// Global variables
let cropper = null;
const AI_VERSION = '1.5.5';

// --- 1. Upload & Initialize Cropper ---
uploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Cleanup previous state
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    placeholderText.classList.add('hidden');
    imageContainer.classList.remove('hidden');
    resultSection.classList.add('hidden');
    updateStatus('', 'hidden');

    // Load image for Cropper
    const url = URL.createObjectURL(file);
    previewImage.src = url;

    // Initialize Cropper once image loads
    previewImage.onload = () => {
        cropper = new Cropper(previewImage, {
            aspectRatio: 1, // Force square crop for passport
            viewMode: 1,    // Restrict crop box to canvas
            dragMode: 'move',
            autoCropArea: 0.8,
            guides: true,
            center: true,
            highlight: false,
            background: false,
        });
        processBtn.disabled = false;
    };
});

// --- 2. Process Button Click ---
processBtn.addEventListener('click', async () => {
    if (!cropper) return;

    setLoading(true, "Getting cropped image...");
    updateStatus("Starting process...", "bg-blue-100 text-blue-800");

    // 1. Get the cropped result as a high-quality square canvas
    const croppedCanvas = cropper.getCroppedCanvas({
        width: 800,  // Ensure high resolution base
        height: 800,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    if (!croppedCanvas) {
        setLoading(false);
        return updateStatus("Could not crop image. Please try again.", "bg-red-100 text-red-800");
    }

    // 2. Convert cropped canvas to a Blob for the AI
    croppedCanvas.toBlob(async (blob) => {
        if (!blob) {
             setLoading(false);
             return updateStatus("Failed to create image blob.", "bg-red-100 text-red-800");
        }
        await runBackgroundRemoval(blob);
    }, 'image/jpeg', 0.95);
});

// --- 3. AI Background Removal & Tiling ---
async function runBackgroundRemoval(imageBlob) {
    try {
        updateStatus("Step 1/3: Downloading AI Brain (Wait ~20s)...", "bg-yellow-100 text-yellow-800");

        // DYNAMIC IMPORT: This fixes the CDN 404 issues.
        // It loads the module only when needed, using the modern '+esm' endpoint.
        const { default: removeBackground } = await import(`https://cdn.jsdelivr.net/npm/@imgly/background-removal@${AI_VERSION}/+esm`);

        const config = {
            // Point to the correct location for the WASM model files
            publicPath: `https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@${AI_VERSION}/dist/`,
            progress: (key, current, total) => {
                const pct = Math.round((current / total) * 100);
                if (pct) updateStatus(`Downloading AI: ${pct}%`, "bg-yellow-100 text-yellow-800");
            }
        };

        updateStatus("Step 2/3: Removing background from crop...", "bg-blue-100 text-blue-800");
        
        // Run AI on the cropped blob
        const outputBlob = await removeBackground(imageBlob, config);
        const processedImg = await loadImage(URL.createObjectURL(outputBlob));

        updateStatus("Step 3/3: Generating 4x6 sheet...", "bg-blue-100 text-blue-800");

        // Setup 4x6 Canvas (1800x1200 @ 300 DPI)
        canvas.width = 1800;
        canvas.height = 1200;
        
        // Fill Background
        ctx.fillStyle = document.getElementById('bgColor').value;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tile 6 photos (2x2 inches = 600px)
        const photoSize = 600;
        for (let i = 0; i < 6; i++) {
            const x = (i % 3) * photoSize;
            const y = Math.floor(i / 3) * photoSize;
            // Since input is already a square crop, draw directly
            ctx.drawImage(processedImg, 0, 0, processedImg.width, processedImg.height, x, y, photoSize, photoSize);
        }

        // Finalize
        downloadLink.href = canvas.toDataURL('image/jpeg', 0.95);
        downloadLink.download = "passport-sheet-4x6.jpg";
        resultSection.classList.remove('hidden');
        updateStatus("Success! Sheet ready below.", "bg-green-100 text-green-800");

    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}. See console.`, "bg-red-100 text-red-800");
    } finally {
        setLoading(false);
    }
}

// --- Helper Functions ---
function setLoading(isLoading, text = "") {
    processBtn.disabled = isLoading;
    btnText.innerText = isLoading ? text : "Crop & Generate 4x6 Sheet";
    if (cropper) isLoading ? cropper.disable() : cropper.enable();
}

function updateStatus(msg, classes) {
    statusDiv.className = `p-3 rounded-lg text-center text-sm font-bold ${classes}`;
    statusDiv.innerText = msg;
    statusDiv.classList.toggle('hidden', !msg);
}

function loadImage(url) {
    return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
}