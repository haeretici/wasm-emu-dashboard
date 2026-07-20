/**
 * Client-side page system config (replaces index.php system selection).
 * Resolves ?system= from the URL and applies UI + core script loading.
 */
(function (global) {
    const AVAILABLE_SYSTEMS = {
        nes: {
            name: 'NES',
            platform: 'NES',
            systemId: 'nes',
            canvasWidth: 256,
            canvasHeight: 240,
            romAccept: '.nes',
            scripts: [
                'js/nes/core.js',
                'js/nes/apu.js',
                'js/nes/app.js'
            ]
        },
        snes: {
            name: 'SNES',
            platform: 'SNES',
            systemId: 'snes',
            canvasWidth: 256,
            canvasHeight: 224,
            romAccept: '.sfc,.smc',
            scripts: [
                'js/snes/core.js',
                'js/snes/apu.js',
                'js/snes/app.js'
            ]
        },
        md: {
            name: 'Sega',
            platform: 'Sega',
            systemId: 'md',
            canvasWidth: 256,
            canvasHeight: 224,
            romAccept: '.md,.bin,.gen,.smd',
            scripts: [
                'js/md/genesis.js',
                'js/md/app.js'
            ]
        }
    };

    const VALID_SYSTEM_IDS = Object.keys(AVAILABLE_SYSTEMS);

    function resolveSystemId(defaultSystemId = 'nes') {
        const fromQuery = new URLSearchParams(global.location.search).get('system');
        if (fromQuery && VALID_SYSTEM_IDS.includes(fromQuery)) {
            return fromQuery;
        }
        return defaultSystemId;
    }

    function getConfig(systemId) {
        return AVAILABLE_SYSTEMS[systemId] || AVAILABLE_SYSTEMS.nes;
    }

    /**
     * Apply system-dependent labels, links, canvas size, and body id.
     * Call once before shared app scripts so getPageSystemId() works.
     */
    function applyPageSystem() {
        const systemId = resolveSystemId();
        const config = getConfig(systemId);

        global.PageSystemConfig = config;

        if (document.body) {
            document.body.id = `${config.systemId}-container`;
        }

        document.title = `${config.platform}: WebAssembly Suite`;

        const platformLabel = document.getElementById('platformMenuLabel');
        if (platformLabel) {
            platformLabel.textContent = `Platform: ${config.platform}`;
        }

        const platformActive = document.getElementById('canvasPlatformLabel');
        if (platformActive) {
            platformActive.textContent = config.platform;
        }

        const statusSystem = document.getElementById('statusSystemId');
        if (statusSystem) {
            statusSystem.textContent = config.systemId.toUpperCase();
        }

        const romInput = document.getElementById('romFileInput');
        if (romInput) {
            romInput.accept = config.romAccept;
        }

        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.width = config.canvasWidth;
            canvas.height = config.canvasHeight;
        }

        document.querySelectorAll('[data-platform-link]').forEach((link) => {
            const id = link.getAttribute('data-platform-link');
            link.href = `index.html?system=${id}`;
            link.classList.toggle('active', id === config.systemId);
        });

        document.querySelectorAll('[data-widget-system]').forEach((link) => {
            const base = link.getAttribute('data-widget-system');
            link.href = `${base}?systemId=${config.systemId}`;
        });

        return config;
    }

    /**
     * Inject emulator core scripts synchronously while the document is still
     * parsing (via document.write). Preserves load order and window "load"
     * timing expected by EmulatorRuntime.scheduleBoot().
     */
    function writeCoreScripts() {
        const config = global.PageSystemConfig || getConfig(resolveSystemId());
        const scripts = config.scripts || [];

        for (const src of scripts) {
            // Safe while document is open; keeps the same blocking semantics as PHP.
            document.write(`<script src="${src}"><\/script>`);
        }
    }

    global.PageSystem = {
        AVAILABLE_SYSTEMS,
        VALID_SYSTEM_IDS,
        resolveSystemId,
        getConfig,
        applyPageSystem,
        writeCoreScripts
    };

    // Apply as soon as this script runs (placed after body content, before globals.js).
    if (document.body) {
        applyPageSystem();
    } else {
        document.addEventListener('DOMContentLoaded', applyPageSystem);
    }
})(window);
