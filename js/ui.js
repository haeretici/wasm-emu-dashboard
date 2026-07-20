let isCanvasFullscreen = false;
let fullscreenResizeHandler = null;
let fullscreenKeydownHandler = null;
let fullscreenCanvasClickHandler = null;

function getGameCanvas() {
    return document.getElementById('gameCanvas');
}

function getCanvasAspectRatio(canvas) {
    const w = parseInt(canvas.getAttribute('width'), 10) || canvas.width || 256;
    const h = parseInt(canvas.getAttribute('height'), 10) || canvas.height || 240;
    return { w, h };
}

function updateFullscreenCanvasSize() {
    const canvas = getGameCanvas();
    if (!canvas || !isCanvasFullscreen) return;

    const { w, h } = getCanvasAspectRatio(canvas);
    const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    const displayW = Math.floor(w * scale);
    const displayH = Math.floor(h * scale);

    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
}

function updateCanvasSize() {
    const canvas = getGameCanvas();
    if (!canvas) return;

    if (isCanvasFullscreen) {
        updateFullscreenCanvasSize();
        return;
    }

    const container = canvas.closest('.canvas-container');
    if (!container) return;

    const { w, h } = getCanvasAspectRatio(canvas);
    
    // Subtract padding of the container (16px on each side = 32px total)
    const padding = 32;
    const containerW = Math.max(32, container.clientWidth - padding);
    const containerH = Math.max(32, container.clientHeight - padding);

    const scale = Math.min(containerW / w, containerH / h);
    const displayW = Math.floor(w * scale);
    const displayH = Math.floor(h * scale);

    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
}

function exitCanvasFullscreen() {
    if (!isCanvasFullscreen) return;

    const canvas = getGameCanvas();
    isCanvasFullscreen = false;
    document.body.classList.remove('canvas-fullscreen');

    if (canvas) {
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.removeEventListener('click', fullscreenCanvasClickHandler);
    }

    window.removeEventListener('resize', fullscreenResizeHandler);
    document.removeEventListener('keydown', fullscreenKeydownHandler);

    fullscreenResizeHandler = null;
    fullscreenKeydownHandler = null;
    fullscreenCanvasClickHandler = null;

    // Recalculate normal sizing
    updateCanvasSize();
}

function enterCanvasFullscreen() {
    const canvas = getGameCanvas();
    if (!canvas || isCanvasFullscreen) return;

    isCanvasFullscreen = true;
    document.body.classList.add('canvas-fullscreen');
    updateFullscreenCanvasSize();

    fullscreenResizeHandler = () => updateFullscreenCanvasSize();
    window.addEventListener('resize', fullscreenResizeHandler);

    fullscreenKeydownHandler = (event) => {
        if (event.key === 'Escape') {
            exitCanvasFullscreen();
        }
    };
    document.addEventListener('keydown', fullscreenKeydownHandler);

    fullscreenCanvasClickHandler = () => exitCanvasFullscreen();
    canvas.addEventListener('click', fullscreenCanvasClickHandler);
}

// Collapsible panels and scaling handlers
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.view-full-screen').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            enterCanvasFullscreen();
        });
    });

    document.querySelectorAll('[data-panel-toggle]').forEach((header) => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('select') || e.target.closest('button')) {
                return;
            }
            const id = header.getAttribute('data-panel-toggle');
            const panel = document.getElementById(id);
            if (panel) {
                panel.classList.toggle('is-collapsed');
            }
        });
    });

    // Setup ResizeObserver to watch the canvas container size changes
    const container = document.querySelector('.canvas-container');
    if (container) {
        const resizeObserver = new ResizeObserver(() => {
            updateCanvasSize();
        });
        resizeObserver.observe(container);
    }
    
    // Initial size calculation
    updateCanvasSize();

    // Overlay check state function
    function checkCanvasOverlayState() {
        const overlay = document.getElementById('canvasOverlay');
        if (!overlay) return;
        if (window.isLoaded) {
            overlay.classList.add('is-hidden');
        } else {
            overlay.classList.remove('is-hidden');
        }
    }

    // Intercept isLoaded changes to show/hide overlay dynamically
    let loadedVal = window.isLoaded;
    Object.defineProperty(window, 'isLoaded', {
        get() {
            return loadedVal;
        },
        set(val) {
            loadedVal = val;
            checkCanvasOverlayState();
        },
        configurable: true
    });

    // Handle clicks and drag/drop events on overlay/canvas
    const overlay = document.getElementById('canvasOverlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            const systemId = window.GlobalConfiguration?.systemId || 'nes';
            const url = `widgets/gamelibrary/?systemId=${systemId}`;
            const windowName = typeof generateUUID === 'function' ? generateUUID() : 'library_window';
            window.open(url, windowName, 'popup=yes,width=1200,height=600,location=no');
        });

        const canvas = getGameCanvas();
        const targets = [overlay, canvas].filter(Boolean);

        targets.forEach(target => {
            target.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                overlay.classList.add('dragover');
            });

            target.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                overlay.classList.remove('dragover');
            });

            target.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                overlay.classList.remove('dragover');

                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    if (typeof importRomFile === 'function') {
                        await importRomFile(file);
                    }
                }
            });
        });
    }

    // Run initial overlay state check
    checkCanvasOverlayState();
});
