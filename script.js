let currentImageBase64 = null;
let currentImageDimensions = { width: 0, height: 0 };
let isReady = false;
let globalZIndex = 500;

const workspace = document.getElementById('workspace');
const shutterBtn = document.getElementById('shutter-btn');
const fileInput = document.getElementById('file-input');
const textInput = document.getElementById('text-input');
const uploadStatus = document.getElementById('upload-status');
const toolbar = document.getElementById('toolbar');
const flash = document.getElementById('flash');
const saveDeskBtn = document.getElementById('save-desk-btn');
const thumbnailBar = document.getElementById('thumbnail-bar');

// 图片队列管理
let imageQueue = []; 
let selectedImages = new Set();

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if(files.length === 0) return;
    
    const loadedImages = [];
    
    const readPromises = files.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const base64 = evt.target.result;
                const img = new Image();
                img.onload = () => {
                    resolve({
                        base64: base64,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                        id: Date.now() + Math.random()
                    });
                };
                img.src = base64;
            };
            reader.readAsDataURL(file);
        });
    });

    loadedImages.push(...(await Promise.all(readPromises)));

    loadedImages.forEach(imgData => {
        imageQueue.push(imgData);
        createThumbnail(imgData);
    });
    thumbnailBar.classList.add('visible');
    
    fileInput.value = '';
});

function createThumbnail(imgData) {
    const wrapper = document.createElement('div');
    wrapper.className = 'thumb-wrapper selected';
    selectedImages.add(imgData);
    updateShutterState();

    const img = document.createElement('img');
    img.src = imgData.base64;
    img.className = 'thumb-item';
    
    const check = document.createElement('div');
    check.className = 'check-indicator';
    check.innerHTML = '<i class="fas fa-check"></i>';

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'thumb-delete-btn';
    deleteBtn.innerHTML = '✕';
    
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        
        // 从队列和选中集合中移除
        const idx = imageQueue.indexOf(imgData);
        if (idx > -1) imageQueue.splice(idx, 1);
        selectedImages.delete(imgData);
        
        wrapper.remove();
        updateShutterState();

        if (imageQueue.length === 0) {
            thumbnailBar.classList.remove('visible');
        }
    };

    wrapper.appendChild(img);
    wrapper.appendChild(check);
    wrapper.appendChild(deleteBtn);

    wrapper.onclick = () => toggleSelection(imgData, wrapper);
    
    thumbnailBar.appendChild(wrapper);
    return wrapper;
}

function toggleSelection(imgData, wrapperEl) {
    if (selectedImages.has(imgData)) {
        selectedImages.delete(imgData);
        wrapperEl.classList.remove('selected');
    } else {
        selectedImages.add(imgData);
        wrapperEl.classList.add('selected');
    }
    updateShutterState();
}

let isWebcamOn = false;

function updateShutterState() {
    if (isWebcamOn || selectedImages.size > 0) {
        shutterBtn.style.opacity = '1';
        shutterBtn.style.cursor = 'pointer';
        shutterBtn.classList.add('shutter-ready');
        
        if (selectedImages.size > 0 && !isWebcamOn) {
            const lastSelected = Array.from(selectedImages).pop();
            if(lastSelected) {
                currentImageBase64 = lastSelected.base64;
                currentImageDimensions = { width: lastSelected.width, height: lastSelected.height };
                isReady = true; 
            }
        }
    } else {
        shutterBtn.style.opacity = '0.6';
        shutterBtn.style.cursor = 'not-allowed';
        shutterBtn.classList.remove('shutter-ready');
        isReady = false;
    }
}

async function printBatch(images) {
    for (const imgData of images) {
        flash.classList.add('fire');
        setTimeout(() => flash.classList.remove('fire'), 100);
        createPolaroid(imgData.base64, textInput.value, imgData.width, imgData.height);
        
        await new Promise(r => setTimeout(r, 2000));
    }
}

// --- Webcam / Camera Logic ---
const videoElement = document.getElementById('webcam-feed');
const canvasElement = document.getElementById('snapshot-canvas');
const canvasContext = canvasElement.getContext('2d');
const cameraModal = document.getElementById('camera-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const captureBtn = document.getElementById('capture-btn');

let cameraStream = null;

async function toggleWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("无法访问摄像头：浏览器不支持或未在安全环境(HTTPS/localhost)下运行。");
        return;
    }

    if (isWebcamOn) {
        closeWebcam();
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
            videoElement.srcObject = stream;
            videoElement.play();
            cameraModal.style.display = 'flex';
            cameraStream = stream;
            isWebcamOn = true;
            console.log("Webcam started successfully.");
        } catch (err) {
            console.error("Error accessing webcam: ", err);
            alert("无法访问摄像头，请检查权限设置。错误信息：" + err.message);
            isWebcamOn = false;
            console.log("Webcam failed to start.");
        }
        updateShutterState();
    }
}

function closeWebcam() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
    cameraModal.style.display = 'none';
    isWebcamOn = false;
    updateShutterState();
}

function takeSnapshot() {
    if (!isWebcamOn || !videoElement.srcObject) {
        console.warn("Webcam is not active or video stream not available.");
        return;
    }

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    canvasContext.save();
    canvasContext.scale(-1, 1);
    canvasContext.drawImage(videoElement, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
    canvasContext.restore();

    const capturedBase64 = canvasElement.toDataURL('image/png');
    
    const imgData = {
        base64: capturedBase64,
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
        id: Date.now() + Math.random()
    };

    imageQueue.push(imgData);
    const newThumbWrapper = createThumbnail(imgData); 
    thumbnailBar.classList.add('visible');
    
    // 确保新缩略图可见
    newThumbWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });

    // 屏幕闪烁效果 - 使用重绘强制触发动画
    flash.classList.remove('fire');
    void flash.offsetWidth; 
    flash.classList.add('fire');
    setTimeout(() => flash.classList.remove('fire'), 300);

    const inner = captureBtn.querySelector('.capture-inner');
    inner.style.background = '#333';
    setTimeout(() => inner.style.background = '#ff4757', 100);

    // 暂时隐藏真实缩略图，等动画结束再显示
    newThumbWrapper.style.opacity = '0';

    // 稍微延迟以等待布局更新
    requestAnimationFrame(() => {
        animateFlyToThumb(capturedBase64, newThumbWrapper);
    });
}

function animateFlyToThumb(imgSrc, targetEl) {
    const flyer = document.createElement('img');
    flyer.src = imgSrc;
    flyer.className = 'flyer-animation';
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '15000';
    flyer.style.transition = 'all 0.8s cubic-bezier(0.2, 1, 0.3, 1)';
    flyer.style.borderRadius = '12px';
    flyer.style.pointerEvents = 'none';
    flyer.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
    
    const videoRect = videoElement.getBoundingClientRect();
    flyer.style.top = `${videoRect.top}px`;
    flyer.style.left = `${videoRect.left}px`;
    flyer.style.width = `${videoRect.width}px`;
    flyer.style.height = `${videoRect.height}px`;
    flyer.style.opacity = '1';

    document.body.appendChild(flyer);

    // 强制重绘
    flyer.getBoundingClientRect();

    // 获取目标位置
    const targetRect = targetEl.getBoundingClientRect();
    
    flyer.style.top = `${targetRect.top}px`;
    flyer.style.left = `${targetRect.left}px`;
    flyer.style.width = `${targetRect.width}px`;
    flyer.style.height = `${targetRect.height}px`;
    flyer.style.opacity = '1'; // 保持不透明直到结束

    flyer.addEventListener('transitionend', () => {
        flyer.remove();
        targetEl.style.opacity = '1'; // 显示真实缩略图
        targetEl.style.transition = 'transform 0.2s';
        targetEl.style.transform = 'scale(1.2)'; // 强调效果
        setTimeout(() => targetEl.style.transform = 'none', 200);
    });
}

document.getElementById('camera-lens').addEventListener('click', () => {
    if (!isWebcamOn) {
        toggleWebcam();
    } else {
        takeSnapshot();
    }
});

closeModalBtn.addEventListener('click', closeWebcam);
captureBtn.addEventListener('click', takeSnapshot);

cameraModal.addEventListener('click', (e) => {
    if(e.target === cameraModal) closeWebcam();
});

shutterBtn.addEventListener('click', () => {
    if(!isReady || selectedImages.size === 0) { 
        toolbar.style.transform = "translate(-50%, 5px)";
        setTimeout(() => toolbar.style.transform = "translate(-50%, 0)", 200);
        return;
    }
    
    printBatch(Array.from(selectedImages));
});

const styleSelect = document.getElementById('style-select');
const stylePreview = document.getElementById('style-preview');
const textColorPicker = document.getElementById('text-color-picker');

// 样式绑定的文字颜色配置
const styleColors = {
    'white': '#333333',
    'dots': '#333333',
    'grid': '#333333',
    'flowers': '#333333',
    'gradient': '#333333',
    'black': '#f1f1f1',
    'kraft': '#333333',
    'hearts': '#333333',
    'stars': '#ffffff',
    'candy': '#ff9ff3',
    'ocean': '#0abde3',
    'mint': '#00b894',
    'sunset': '#ffffff',
    'marble': '#333333',
    'holo': '#ffffff',
    'sakura': '#ff8fa3',
    'cyber': '#00f2ea',
    'wood': '#f1f2f6',
    'lemon': '#fab1a0',
    'rainbow': '#ffffff'
};

const customSelect = document.getElementById('custom-select');
const customTrigger = customSelect.querySelector('.custom-select-trigger');
const customOptions = document.getElementById('custom-options');
const textureInput = document.getElementById('texture-input');

// Map to store uploaded custom textures: ID -> Base64
const customTextures = new Map();
let activeCustomId = null;

function generatePreviewHTML(type, uid) {
    if (type === 'add-new') {
         return `
            <svg width="100%" height="100%" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
                <rect width="50" height="50" fill="#f0f0f0" stroke="#ccc" stroke-width="1" />
                <line x1="25" y1="15" x2="25" y2="35" stroke="#999" stroke-width="2" />
                <line x1="15" y1="25" x2="35" y2="25" stroke="#999" stroke-width="2" />
            </svg>
        `;
    }
    
    // Check if it's a custom uploaded texture
    if (type.startsWith('custom-') && customTextures.has(type)) {
        return `<img src="${customTextures.get(type)}" style="width:100%; height:100%; object-fit: cover;">`;
    }

    const config = getStyleConfig(type, uid);
    return `
        <svg width="100%" height="100%" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
            <defs>${config.defs}</defs>
            <rect width="50" height="50" fill="${config.fill}" />
        </svg>
    `;
}

function renderOptions() {
    customOptions.innerHTML = '';

    // 1. Render standard options
    Array.from(styleSelect.options).forEach(option => {
        createOptionElement(option.value, option.text);
    });

    // 2. Render uploaded custom options
    customTextures.forEach((base64, id) => {
        createOptionElement(id, '自定义样式');
    });

    // 3. Render "Add New" button
    createOptionElement('add-new', '添加新样式');
}

function createOptionElement(value, text) {
    const div = document.createElement('div');
    div.className = 'custom-option';
    
    // If it's a custom added style, we use the image directly
    if (value.startsWith('custom-')) {
        div.innerHTML = generatePreviewHTML(value, 'opt-' + value);
    } else if (value === 'add-new') {
        div.innerHTML = generatePreviewHTML(value, 'opt-add-new');
    } else {
        div.innerHTML = generatePreviewHTML(value, 'opt-' + value);
    }
    
    div.dataset.value = value;
    div.title = text;
    
    // Mark selected
    // logic: if current styleSelect value matches (for standard) 
    // OR if current activeCustomId matches (for custom)
    if (styleSelect.value === value || (value.startsWith('custom-') && activeCustomId === value)) {
        div.classList.add('selected');
    }

    div.addEventListener('click', (e) => {
        e.stopPropagation();
        if (value === 'add-new') {
             textureInput.click();
             customOptions.classList.remove('open');
        } else {
            selectStyle(value);
            customOptions.classList.remove('open');
        }
    });

    customOptions.appendChild(div);
}

// Initial Render
renderOptions();

textureInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const base64 = evt.target.result;
        const newId = 'custom-' + Date.now();
        
        customTextures.set(newId, base64);
        
        // Initialize default color for new custom style
        styleColors[newId] = '#333333';

        // Re-render options to include new one
        renderOptions();
        
        // Auto select the new one
        selectStyle(newId);
    };
    reader.readAsDataURL(file);
    textureInput.value = ''; // reset
});

customTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    customOptions.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if(!customSelect.contains(e.target)) {
        customOptions.classList.remove('open');
    }
});

function selectStyle(value) {
    // Update UI selection state
    const options = customOptions.querySelectorAll('.custom-option');
    options.forEach(opt => {
        if(opt.dataset.value === value) opt.classList.add('selected');
        else opt.classList.remove('selected');
    });

    // Handle logic
    if (value.startsWith('custom-')) {
        activeCustomId = value;
        // We don't change styleSelect value to 'custom-' because it's not a valid option there.
        // We can treat it as a special case or just ignore styleSelect value when activeCustomId is set.
        styleSelect.value = ''; // Clear standard selection
    } else {
        activeCustomId = null;
        styleSelect.value = value;
    }

    // Update Text Color Picker
    const currentColor = styleColors[value] || '#333333';
    textColorPicker.value = currentColor;
    textInput.style.color = currentColor;

    updatePreview(value);
}

// Color Picker Listener
textColorPicker.addEventListener('input', (e) => {
    const newColor = e.target.value;
    const currentStyle = activeCustomId || styleSelect.value;
    
    // Update binding
    styleColors[currentStyle] = newColor;
    
    // Update visual
    textInput.style.color = newColor;
});

    // Initialize
    selectStyle(styleSelect.value || 'white'); // Default to white if nothing selected
    
    // Set current year in copyright
    const yearEl = document.getElementById('current-year');
    if(yearEl) {
        const currentYear = new Date().getFullYear();
        // 如果当前年份就是 2025，只显示 2025；否则显示 2025-当前年份
        if (currentYear > 2025) {
            yearEl.textContent = '-' + currentYear;
        } else {
            yearEl.textContent = ''; // 保持为空，前面的 2025 已经有了
        }
    }

    updatePreview(styleSelect.value || 'white');


function updatePreview(type) {
    // Check custom first
    if (type.startsWith('custom-') && customTextures.has(type)) {
         stylePreview.innerHTML = `<img src="${customTextures.get(type)}" style="width:100%; height:100%; object-fit: cover; border-radius: 50%;">`;
    } else if (type === 'add-new') {
        // Should not happen normally as it triggers file input
    } else {
        stylePreview.innerHTML = generatePreviewHTML(type, 'preview');
    }
}

function getStyleConfig(type, uid) {
    let defs = '';
    let fill = '#fff';
    let text = '#333';

    // Check for custom ID
    if (type && type.startsWith('custom-') && customTextures.has(type)) {
        const bg = customTextures.get(type);
        defs = `<pattern id="pat-${uid}" width="100%" height="100%" patternContentUnits="objectBoundingBox">
            <image href="${bg}" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
        </pattern>`;
        fill = `url(#pat-${uid})`;
        text = '#333'; // Default text color for custom
        return { defs, fill, text };
    }

    switch (type) {
        case 'dots':
            defs = `<pattern id="pat-${uid}" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect width="20" height="20" fill="#fff"/>
                <circle cx="10" cy="10" r="2.5" fill="#ff9f43" opacity="0.4"/>
                <circle cx="0" cy="0" r="2.5" fill="#ff9f43" opacity="0.4"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            break;
        case 'grid':
            defs = `<pattern id="pat-${uid}" width="25" height="25" patternUnits="userSpaceOnUse">
                <rect width="25" height="25" fill="#fff"/>
                <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#0984e3" stroke-width="1" opacity="0.15"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            break;
        case 'flowers':
            defs = `<pattern id="pat-${uid}" width="60" height="60" patternUnits="userSpaceOnUse">
                <rect width="60" height="60" fill="#fff5f5"/>
                <g transform="translate(30,30) rotate(15)">
                    <circle r="6" fill="#e17055"/>
                    <circle cy="-8" r="4" fill="#fab1a0"/>
                    <circle cy="8" r="4" fill="#fab1a0"/>
                    <circle cx="-8" r="4" fill="#fab1a0"/>
                    <circle cx="8" r="4" fill="#fab1a0"/>
                </g>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            break;
        case 'gradient':
            defs = `<linearGradient id="pat-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#fff" />
                <stop offset="100%" stop-color="#fdcb6e" />
            </linearGradient>`;
            fill = `url(#pat-${uid})`;
            break;
        case 'black':
            fill = '#222';
            text = '#f1f1f1';
            break;
        case 'kraft':
            defs = `<pattern id="pat-${uid}" width="4" height="4" patternUnits="userSpaceOnUse">
                <rect width="4" height="4" fill="#e0d4b8"/>
                <rect width="1" height="1" fill="#cbbfa0"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            break;
        case 'hearts':
            defs = `<pattern id="pat-${uid}" width="30" height="30" patternUnits="userSpaceOnUse">
                <rect width="30" height="30" fill="#ffeaa7" opacity="0.2"/>
                <rect width="30" height="30" fill="#fff"/>
                <text x="15" y="20" font-size="14" fill="#ff7675" text-anchor="middle" style="font-family:Arial">♥</text>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            break;
        case 'stars':
            defs = `<pattern id="pat-${uid}" width="50" height="50" patternUnits="userSpaceOnUse">
                <rect width="50" height="50" fill="#2c3e50"/>
                <circle cx="25" cy="25" r="1.5" fill="#fff" opacity="0.8"/>
                <circle cx="10" cy="10" r="1" fill="#fff" opacity="0.5"/>
                <circle cx="40" cy="40" r="1" fill="#fff" opacity="0.5"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#fff';
            break;
        case 'candy':
            defs = `<pattern id="pat-${uid}" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="20" height="20" fill="#fff"/>
                <rect width="10" height="20" fill="#ff9ff3"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#ff9ff3';
            break;
        case 'ocean':
            defs = `<pattern id="pat-${uid}" width="40" height="20" patternUnits="userSpaceOnUse">
                <rect width="40" height="20" fill="#48dbfb"/>
                <path d="M0 10 Q10 0 20 10 T40 10" fill="none" stroke="#fff" stroke-width="2" opacity="0.5"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#0abde3';
            break;
        case 'mint':
            defs = `<pattern id="pat-${uid}" width="30" height="30" patternUnits="userSpaceOnUse">
                <rect width="30" height="30" fill="#55efc4"/>
                <circle cx="15" cy="15" r="2" fill="#fff"/>
                <path d="M0 0 L30 0 M0 30 L30 30" stroke="#fff" stroke-width="1" opacity="0.5"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#00b894';
            break;
        case 'sunset':
            defs = `<linearGradient id="pat-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#6c5ce7" />
                <stop offset="50%" stop-color="#ff9f43" />
                <stop offset="100%" stop-color="#ff6b6b" />
            </linearGradient>`;
            fill = `url(#pat-${uid})`;
            text = '#fff';
            break;
        case 'marble':
            defs = `<filter id="marble-noise-${uid}">
                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise"/>
                    <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.3 0" in="noise"/>
                </filter>
                <pattern id="pat-${uid}" width="100" height="100" patternUnits="userSpaceOnUse">
                    <rect width="100" height="100" fill="#f1f2f6"/>
                    <rect width="100" height="100" fill="#636e72" filter="url(#marble-noise-${uid})" opacity="0.5"/>
                </pattern>`;
            fill = `url(#pat-${uid})`;
            break;
        case 'holo':
            defs = `<linearGradient id="pat-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff9a9e"/>
                <stop offset="25%" stop-color="#fad0c4"/>
                <stop offset="50%" stop-color="#a18cd1"/>
                <stop offset="75%" stop-color="#fad0c4"/>
                <stop offset="100%" stop-color="#ff9a9e"/>
            </linearGradient>`;
            fill = `url(#pat-${uid})`;
            text = '#fff';
            break;
        case 'sakura':
            defs = `<pattern id="pat-${uid}" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#ffe6ea"/>
                <g fill="#ffb7b2">
                   <path d="M10 10 Q15 5 20 10 T30 10" opacity="0.6" transform="rotate(45 10 10) scale(0.5)"/>
                   <circle cx="30" cy="30" r="3" opacity="0.5"/>
                   <circle cx="10" cy="30" r="2" opacity="0.4"/>
                   <path d="M25 5 Q30 0 35 5" stroke="#ffb7b2" stroke-width="1" fill="none" opacity="0.5"/>
                </g>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#ff8fa3';
            break;
        case 'cyber':
            defs = `<pattern id="pat-${uid}" width="30" height="30" patternUnits="userSpaceOnUse">
                <rect width="30" height="30" fill="#120458"/>
                <path d="M30 0 L0 30 M0 0 L30 30" stroke="#00f2ea" stroke-width="1" opacity="0.3"/>
                <rect x="0" y="0" width="30" height="30" fill="none" stroke="#ff0055" stroke-width="1" opacity="0.2"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#00f2ea';
            break;
        case 'wood':
            defs = `<pattern id="pat-${uid}" width="20" height="100" patternUnits="userSpaceOnUse">
                <rect width="20" height="100" fill="#8b5a2b"/>
                <path d="M0 0 Q10 25 0 50 T0 100" stroke="#654321" stroke-width="2" fill="none" opacity="0.3"/>
                <path d="M20 0 Q10 25 20 50 T20 100" stroke="#654321" stroke-width="2" fill="none" opacity="0.3"/>
                <path d="M10 0 V100" stroke="#5c4033" stroke-width="1" opacity="0.2"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#f1f2f6';
            break;
        case 'lemon':
            defs = `<pattern id="pat-${uid}" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#ffeaa7"/>
                <circle cx="20" cy="20" r="10" fill="#fff" opacity="0.8"/>
                <circle cx="20" cy="20" r="8" fill="#ffeaa7"/>
                <path d="M20 20 L20 12 M20 20 L28 20 M20 20 L20 28 M20 20 L12 20" stroke="#fff" stroke-width="1"/>
                <path d="M20 20 L26 14 M20 20 L26 26 M20 20 L14 26 M20 20 L14 14" stroke="#fff" stroke-width="1"/>
            </pattern>`;
            fill = `url(#pat-${uid})`;
            text = '#fab1a0';
            break;
        case 'rainbow':
            defs = `<linearGradient id="pat-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff7675"/>
                <stop offset="20%" stop-color="#fab1a0"/>
                <stop offset="40%" stop-color="#ffeaa7"/>
                <stop offset="60%" stop-color="#55efc4"/>
                <stop offset="80%" stop-color="#74b9ff"/>
                <stop offset="100%" stop-color="#a29bfe"/>
            </linearGradient>`;
            fill = `url(#pat-${uid})`;
            text = '#fff';
            break;
        case 'custom':
             // Deprecated/Removed legacy 'custom' case logic in favor of dynamic IDs
             // But kept for safety if old state persists
            if (customTextureBase64) {
                defs = `<pattern id="pat-${uid}" width="100%" height="100%" patternContentUnits="objectBoundingBox">
                    <image href="${customTextureBase64}" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
                </pattern>`;
                fill = `url(#pat-${uid})`;
                text = '#333'; // Default text color for custom
            }
            break;
        default:
    }
    return { defs, fill, text };
}

function createPolaroid(imgSrc, textContent, imgWidth, imgHeight) {
    const uid = Date.now() + Math.random().toString(36).substr(2, 5);
    // Determine current style type: either standard from select or active custom ID
    const styleType = activeCustomId ? activeCustomId : styleSelect.value;
    const div = document.createElement('div');
    const randomAngle = (Math.random() - 0.5) * 12; 
    
    const config = getStyleConfig(styleType, uid);
    
    // Apply dynamic color from styleColors if available
    if (styleColors[styleType]) {
        config.text = styleColors[styleType];
    }

    const maxImageWidth = 300;
    let imageSvgWidth = maxImageWidth;
    let imageSvgHeight = (imgHeight / imgWidth) * imageSvgWidth;

    const maxImageSvgHeight = 400;
    if (imageSvgHeight > maxImageSvgHeight) {
        imageSvgHeight = maxImageSvgHeight;
        imageSvgWidth = (imgWidth / imgHeight) * imageSvgHeight;
    }

    const framePaddingX = 25;
    const framePaddingYTop = 25;
    const framePaddingYBottom = 80;

    const frameSvgWidth = imageSvgWidth + (framePaddingX * 2);
    const frameSvgHeight = imageSvgHeight + framePaddingYTop + framePaddingYBottom;

    const textSvgY = imageSvgHeight + framePaddingYTop + (framePaddingYBottom / 2);

    div.style.setProperty('--random-rotate', `${randomAngle}deg`);
    div.className = 'polaroid-item ejecting';
    
    // Get Camera Position
    const cameraContainer = document.querySelector('.camera-container');
    let startTop = 350; // Default fallback
    let startLeft = window.innerWidth / 2;

    if(cameraContainer) {
        // We need to account for the workspace padding/position if relevant.
        // #workspace has relative position.
        // If cameraContainer is absolute inside workspace, offsetTop/Left are relative to workspace.
        startTop = cameraContainer.offsetTop + 350; 
        startLeft = cameraContainer.offsetLeft + (cameraContainer.offsetWidth / 2);
    }

    const renderScaleFactor = 330 / 350;  
    const finalWidth = frameSvgWidth * renderScaleFactor;
    const finalHeight = frameSvgHeight * renderScaleFactor;

    div.style.width = `${finalWidth}px`;
    div.style.height = `${finalHeight}px`;
    
    // Set initial position (at the slot)
    div.style.left = `${startLeft}px`; 
    // margin-left centers it
    div.style.marginLeft = `${-finalWidth / 2}px`;
    div.style.top = `${startTop}px`;

    // Z-index management: 
    // We want the photo to appear to come OUT of the camera slot. 
    // If it's behind the camera, the bottom part of the camera body covers it.
    // But the slot is at the bottom. 
    // Let's try keeping it behind the camera initially.
    
    if(cameraContainer) {
        // 确保相机在最上层，照片在相机下一层，但都在其他元素之上
        globalZIndex += 2;
        cameraContainer.style.zIndex = globalZIndex;
        div.style.zIndex = globalZIndex - 1;
    } else {
        globalZIndex++;
        div.style.zIndex = globalZIndex;
    }

    // 动画期间禁止交互
    div.style.pointerEvents = 'none';

    div.innerHTML = `
        <div class="delete-btn" title="删除">✕</div>
        <svg viewBox="0 0 ${frameSvgWidth} ${frameSvgHeight}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block; filter: drop-shadow(0 4px 20px rgba(0,0,0,0.15));">
            <defs>
                <clipPath id="clip-${uid}">
                    <rect x="${framePaddingX}" y="${framePaddingYTop}" width="${imageSvgWidth}" height="${imageSvgHeight}" rx="2"/>
                </clipPath>
                <filter id="paper-${uid}">
                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise"/>
                    <feDiffuseLighting in="noise" lighting-color="#fff" surfaceScale="1">
                        <feDistantLight azimuth="45" elevation="60"/>
                    </feDiffuseLighting>
                </filter>
                
                <filter id="pola-${uid}">
                    <feColorMatrix type="matrix" values="
                        1.1 0   0   0   -0.02
                        0   1.05 0  0   -0.02
                        0   0   0.9 0   0.03
                        0   0   0   1   0
                    "/>
                </filter>
                
                <radialGradient id="vig-${uid}" cx="50%" cy="50%" r="70%" fx="50%" fy="50%">
                    <stop offset="40%" stop-color="#000" stop-opacity="0"/>
                    <stop offset="100%" stop-color="#000" stop-opacity="0.4"/>
                </radialGradient>

                ${config.defs}
            </defs>
            <rect width="${frameSvgWidth}" height="${frameSvgHeight}" fill="${config.fill}"/>
            <rect width="${frameSvgWidth}" height="${frameSvgHeight}" fill="#f8f8f8" opacity="0.2" filter="url(#paper-${uid})"/>
            <rect x="${framePaddingX}" y="${framePaddingYTop}" width="${imageSvgWidth}" height="${imageSvgHeight}" fill="#111"/>
            
            <image x="${framePaddingX}" y="${framePaddingYTop}" width="${imageSvgWidth}" height="${imageSvgHeight}" 
                   href="${imgSrc}" preserveAspectRatio="xMidYMid slice" 
                   clip-path="url(#clip-${uid})"
                   filter="url(#pola-${uid})"/>
            
            <rect x="${framePaddingX}" y="${framePaddingYTop}" width="${imageSvgWidth}" height="${imageSvgHeight}" 
                  fill="url(#vig-${uid})" clip-path="url(#clip-${uid})" style="mix-blend-mode: multiply; pointer-events: none;"/>

            <rect class="dev-overlay" x="${framePaddingX}" y="${framePaddingYTop}" width="${imageSvgWidth}" height="${imageSvgHeight}" fill="#050505" />
            <text x="${frameSvgWidth / 2}" y="${textSvgY}" text-anchor="middle" dominant-baseline="middle" font-family="'Caveat', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'SimHei', 'Heiti SC', 'WenQuanYi Micro Hei', sans-serif" font-weight="400" font-size="36" fill="${config.text}">${textContent}</text>
        </svg>
    `;

    workspace.appendChild(div);

    // Use Web Animations API for dynamic ejection
    const dropDistance = 220;
    const anim = div.animate([
        { transform: `translateY(0px) scale(0.85) rotate(0deg)`, opacity: 0 },
        { transform: `translateY(30px) scale(0.9) rotate(0deg)`, opacity: 1, offset: 0.2 },
        { transform: `translateY(${dropDistance - 20}px) scale(1) rotate(0deg)`, offset: 0.6 },
        { transform: `translateY(${dropDistance}px) scale(1) rotate(${randomAngle}deg)` }
    ], {
        duration: 1400,
        easing: 'ease-out',
        fill: 'forwards'
    });

    anim.onfinish = () => {
        div.classList.add('developed');
        div.classList.remove('ejecting');
        
        // 恢复交互
        div.style.pointerEvents = 'auto';
        
        // Set final position
        div.style.top = `${startTop + dropDistance}px`;
        
        // Apply final rotation via transform (overriding the animation fill)
        div.style.transform = `rotate(${randomAngle}deg)`; 
        anim.cancel();
        
        // Bring to front after ejection so it's easily draggable
        globalZIndex++;
        div.style.zIndex = globalZIndex;
    };

    makeDraggable(div);

    div.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        tearAndRemove(div);
    });
    div.addEventListener('dblclick', () => downloadSingle(div, frameSvgWidth, frameSvgHeight));
}

function makeDraggable(el) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    let hasMoved = false;

    el.addEventListener('mousedown', (e) => {
        hasMoved = false;
        if(e.target.classList.contains('delete-btn')) return;
        isDragging = true;
        
        // Increment global z-index and apply to current element
        globalZIndex++;
        el.style.zIndex = globalZIndex;
        
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = el.offsetLeft;
        initialTop = el.offsetTop;
        el.style.cursor = 'grabbing';
        el.style.transition = 'none'; 
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            hasMoved = true;
        }

        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
        el.style.marginLeft = '0'; 
    });
    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            el.style.cursor = 'grab';
            el.style.transition = 'box-shadow 0.3s';
        }
    });
    
    // Prevent click events on children if dragged
    el.addEventListener('click', (e) => {
        if (hasMoved) {
            e.stopPropagation(); 
            // Don't preventDefault() if it blocks necessary native behavior, but for custom clicks it helps
        }
    }, true); // Capture phase might be better
}

function downloadSingle(el, finalFrameSvgWidth, finalFrameSvgHeight) {
    const svgEl = el.querySelector('svg');
    
    const clonedSvg = svgEl.cloneNode(true);
    
    const overlay = clonedSvg.querySelector('.dev-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
    }

    clonedSvg.setAttribute('width', finalFrameSvgWidth);
    clonedSvg.setAttribute('height', finalFrameSvgHeight);

    const xml = new XMLSerializer().serializeToString(clonedSvg);
    const img = new Image();
    const svgBlob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = finalFrameSvgWidth * 2;
        canvas.height = finalFrameSvgHeight * 2;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Polaroid_${Date.now()}.png`;
        link.click();
        
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

// Initialize camera draggability
const cameraContainer = document.querySelector('.camera-container');
if(cameraContainer) {
    makeDraggable(cameraContainer);
}

function tearAndRemove(el) {
    // 1. Remove interactivity immediately
    el.style.pointerEvents = 'none';
    const deleteBtn = el.querySelector('.delete-btn');
    if(deleteBtn) deleteBtn.remove();

    // 2. Clone the element for the right half
    const rightEl = el.cloneNode(true);
    el.parentElement.appendChild(rightEl);

    // 3. Generate Jagged Path
    // We work in percentages to be easy with clip-path
    const steps = 20;
    let points = [];
    for(let i=0; i<=steps; i++) {
        const y = (i / steps) * 100;
        // x varies around 50%, e.g. 48% to 52%
        const offset = (i % 2 === 0) ? 2 : -2; 
        const randomOffset = (Math.random() - 0.5) * 2; 
        const x = 50 + offset + randomOffset;
        points.push(`${x}% ${y}%`);
    }

    const leftPath = `polygon(${points.join(', ')}, -50% 150%, -50% -50%)`;
    // For right path: Start Top-Right-Out, Bottom-Right-Out, then up the jagged line
    const rightPointsReversed = [...points].reverse();
    const rightPath = `polygon(150% -50%, 150% 150%, ${rightPointsReversed.join(', ')})`;

    // 4. Apply clip-paths
    el.style.clipPath = leftPath;
    el.style.webkitClipPath = leftPath; // for compatibility
    
    rightEl.style.clipPath = rightPath;
    rightEl.style.webkitClipPath = rightPath;

    // 5. Animate
    let currentTransform = el.style.transform;
    if (!currentTransform || currentTransform === 'none') {
        currentTransform = window.getComputedStyle(el).transform;
        if(currentTransform === 'none') currentTransform = '';
    }
    
    const animOptions = {
        duration: 800,
        easing: 'cubic-bezier(0.2, 1, 0.3, 1)', // ease out
        fill: 'forwards'
    };

    // Left part moves left and rotates slightly counter-clockwise, drops down a bit
    const leftAnim = el.animate([
        { transform: `${currentTransform} translate(0, 0) rotate(0deg)`, opacity: 1 },
        { transform: `${currentTransform} translate(-60px, 30px) rotate(-15deg)`, opacity: 0 }
    ], animOptions);

    // Right part moves right and rotates slightly clockwise, drops down a bit
    const rightAnim = rightEl.animate([
        { transform: `${currentTransform} translate(0, 0) rotate(0deg)`, opacity: 1 },
        { transform: `${currentTransform} translate(60px, 30px) rotate(15deg)`, opacity: 0 }
    ], animOptions);

    // 6. Cleanup
    Promise.all([leftAnim.finished, rightAnim.finished]).then(() => {
        el.remove();
        rightEl.remove();
    });
}

saveDeskBtn.addEventListener('click', () => {
    const tip = document.querySelector('.tip');
    
    // Save current states
    const prevToolbarDisplay = toolbar.style.display;
    const prevThumbDisplay = thumbnailBar.style.display;
    const prevModalDisplay = cameraModal.style.display;
    const prevTipDisplay = tip ? tip.style.display : '';

    // Hide interface elements
    toolbar.style.display = 'none';
    thumbnailBar.style.display = 'none';
    cameraModal.style.display = 'none';
    if(tip) tip.style.display = 'none';
    
    // Add loading cursor
    document.body.style.cursor = 'wait';

    // Small timeout to allow DOM to update before capture
    setTimeout(() => {
        html2canvas(document.body, {
            backgroundColor: null, // Use existing background
            scale: window.devicePixelRatio, // Adapt to screen resolution
            logging: false,
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Polaroid_Desktop_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            console.error('Screenshot failed:', err);
            alert('保存失败，请重试');
        }).finally(() => {
            // Restore interface
            toolbar.style.display = prevToolbarDisplay;
            thumbnailBar.style.display = prevThumbDisplay;
            cameraModal.style.display = prevModalDisplay;
            if(tip) tip.style.display = prevTipDisplay;
            
            document.body.style.cursor = 'default';
        });
    }, 100);
});
