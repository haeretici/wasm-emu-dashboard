/**
 * Shared free-run runtime for NES / MD / SNES cores.
 *
 * Cores configure a factory, sample rate, ROM pointer policy, and optional hooks.
 * Paint, 60 FPS display loop, ROM malloc/init, and module boot live here so
 * per-system app.js files stay small.
 */
const EmulatorRuntime = {
    config: null,

    canvas: null,
    ctx: null,
    imgData: null,

    frameLoopId: null,
    lastFrameTime: 0,
    currentRomPtr: null,

    frameCount: 0,
    totalTime: 0,
    lastBenchmarkTime: 0,
    minFrameTime: Infinity,
    maxFrameTime: 0,

    FPS_LIMIT: 60,

    /**
     * @param {object} options
     * @param {() => Promise<object>} options.factory  Emscripten create*Module
     * @param {number} [options.sampleRate=48000]
     * @param {boolean} [options.keepRomPtr=true]  If false, free ROM after init (MD copies internally)
     * @param {string} [options.canvasId='gameCanvas']
     * @param {number} [options.fpsLimit=60]
     * @param {(module: object) => void|Promise<void>} [options.onAfterLoad]
     * @param {boolean} [options.autoBoot=true]
     */
    configure(options) {
        if (!options || typeof options.factory !== 'function') {
            throw new Error('EmulatorRuntime.configure requires a factory function');
        }

        this.config = {
            sampleRate: 48000,
            keepRomPtr: true,
            canvasId: 'gameCanvas',
            fpsLimit: 60,
            onAfterLoad: null,
            autoBoot: true,
            ...options,
        };

        this.FPS_LIMIT = this.config.fpsLimit;
        this.lastBenchmarkTime = performance.now();
        this.lastFrameTime = performance.now();

        this._bindGlobals();

        if (this.config.autoBoot) {
            this.scheduleBoot();
        }

        return this;
    },

    _bindGlobals() {
        window.loadRomBuffer = (buffer) => this.loadRomBuffer(buffer);
        window.renderFrameLoop = (t) => this.renderFrameLoop(t);
        window.paintScreen = () => this.paintScreen();
        // TAS historically used different paint names per core
        window.renderCanvas = window.paintScreen;
        window.run1fr = window.paintScreen;
        window.updateScreenFrame = window.paintScreen;
        window.EmulatorRuntime = this;
    },

    scheduleBoot() {
        const run = () => {
            this.boot().catch((err) => {
                console.error('Error running modular setup initialization sequence:', err);
            });
        };

        if (document.readyState === 'complete') {
            run();
        } else {
            window.addEventListener('load', run, { once: true });
        }
    },

    async boot() {
        if (!this.config) {
            throw new Error('EmulatorRuntime.boot called before configure()');
        }

        gameModule = await this.config.factory();
        console.log('WebAssembly Core Ready and Fully Populated.');

        this._initCanvas();

        if (typeof setupFileInputHandler === 'function') {
            setupFileInputHandler();
        }
        if (typeof setupRomDropZone === 'function') {
            setupRomDropZone();
        }

        return gameModule;
    },

    _initCanvas() {
        const canvas = document.getElementById(this.config.canvasId);
        if (!canvas) {
            console.warn(`EmulatorRuntime: canvas #${this.config.canvasId} not found`);
            return;
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = false;
        }

        if (canvas.width > 0 && canvas.height > 0) {
            this.imgData = this.ctx.createImageData(canvas.width, canvas.height);
        }
    },

    stopFrameLoop() {
        if (this.frameLoopId !== null) {
            cancelAnimationFrame(this.frameLoopId);
            this.frameLoopId = null;
        }
    },

    startFrameLoop() {
        this.stopFrameLoop();
        this.lastFrameTime = performance.now();
        this.frameLoopId = requestAnimationFrame((t) => this.renderFrameLoop(t));
    },

    freeCurrentRomPtr() {
        if (this.currentRomPtr === null || !gameModule) return;
        if (typeof gameModule._my_free === 'function') {
            gameModule._my_free(this.currentRomPtr);
        }
        this.currentRomPtr = null;
    },

    /**
     * Allocate ROM bytes in WASM heap, call _init_emulator, optional free.
     * C cores may return 0/1 or void; only an explicit 0 is treated as failure.
     */
    async loadRomBuffer(romBuffer) {
        if (!gameModule) {
            console.error('loadRomBuffer: gameModule is not ready');
            return;
        }

        let romPtr = null;

        try {
            isLoaded = false;
            this.stopFrameLoop();

            originalRomBuffer = romBuffer.slice(0);
            const romArray = new Uint8Array(romBuffer);

            // Drop any previously retained ROM allocation (NES / SNES keepRomPtr path)
            this.freeCurrentRomPtr();

            romPtr = gameModule._my_malloc(romArray.length);
            gameModule.HEAPU8.set(romArray, romPtr);

            const result = gameModule._init_emulator(
                romPtr,
                romArray.length,
                this.config.sampleRate
            );

            // Explicit 0 = failure. void/undefined and 1 = success.
            if (result === 0) {
                console.error('Failed to initialize emulator with ROM data.');
                gameModule._my_free(romPtr);
                romPtr = null;
                return;
            }

            // MD copies ROM into its own store then frees the temp buffer.
            // NES/SNES keep the pointer for the core's lifetime.
            if (this.config.keepRomPtr) {
                this.currentRomPtr = romPtr;
            } else {
                gameModule._my_free(romPtr);
                this.currentRomPtr = null;
            }
            romPtr = null;

            console.log(`Emulator initialized successfully with ROM: [${currentRomName}]`);
            isLoaded = true;

            if (typeof updateLoadButtonState === 'function') {
                await updateLoadButtonState();
            }
            if (typeof initSpriteEditorsPalletes === 'function') {
                initSpriteEditorsPalletes();
            }
            if (typeof renderCHRViewer === 'function') {
                setTimeout(() => { renderCHRViewer(); }, 100);
            }

            if (typeof this.config.onAfterLoad === 'function') {
                await this.config.onAfterLoad(gameModule);
            }

            if (typeof applyStoredCheatsForCurrentGame === 'function') {
                applyStoredCheatsForCurrentGame();
            }

            this.startFrameLoop();
        } catch (e) {
            console.error('Exception thrown during ROM load / init:', e);
            if (romPtr !== null && gameModule && typeof gameModule._my_free === 'function') {
                gameModule._my_free(romPtr);
            }
            this.freeCurrentRomPtr();
            isLoaded = false;
        }
    },

    paintScreen() {
        if (!gameModule || !this.canvas || !this.ctx) return;

        const start = performance.now();

        const width = gameModule._get_screen_width();
        const height = gameModule._get_screen_height();
        if (!width || !height) return;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.imgData = this.ctx.createImageData(width, height);
        } else if (!this.imgData || this.imgData.width !== width || this.imgData.height !== height) {
            this.imgData = this.ctx.createImageData(width, height);
        }

        const bufferPointer = gameModule._get_screen_buffer_ptr();
        if (!bufferPointer || !this.imgData) return;

        const pixelView = new Uint8ClampedArray(
            gameModule.HEAPU8.buffer,
            bufferPointer,
            width * height * 4
        );
        this.imgData.data.set(pixelView);
        this.ctx.putImageData(this.imgData, 0, 0);

        this._recordBenchmark(performance.now() - start);
    },

    _recordBenchmark(frameTime) {
        this.frameCount++;
        this.totalTime += frameTime;
        this.minFrameTime = Math.min(this.minFrameTime, frameTime);
        this.maxFrameTime = Math.max(this.maxFrameTime, frameTime);

        if (performance.now() - this.lastBenchmarkTime > 1000) {
            const avgFrameTime = this.totalTime / this.frameCount;
            const fps = Math.round(1000 / avgFrameTime);

            console.log(
                `%c[Render Benchmark] Avg: ${avgFrameTime.toFixed(2)}ms | FPS: ${fps} | Min: ${this.minFrameTime.toFixed(2)}ms | Max: ${this.maxFrameTime.toFixed(2)}ms`,
                'color: #0f0; font-weight: bold'
            );

            this.frameCount = 0;
            this.totalTime = 0;
            this.lastBenchmarkTime = performance.now();
            this.minFrameTime = Infinity;
            this.maxFrameTime = 0;
        }
    },

    /**
     * Display-side rAF loop. Emulation free-run is driven by emscripten_set_main_loop
     * inside each core; this loop only paints at fpsLimit.
     */
    renderFrameLoop(currentTime) {
        if (!isLoaded || isPaused) return;

        // Resume from setEmulatorPaused may call us with no timestamp.
        const now = currentTime ?? performance.now();

        this.frameLoopId = requestAnimationFrame((t) => this.renderFrameLoop(t));

        const frameDuration = 1000 / this.FPS_LIMIT;
        const elapsed = now - this.lastFrameTime;

        if (elapsed >= frameDuration) {
            this.lastFrameTime = now - (elapsed % frameDuration);
            this.paintScreen();
        }
    },
};
