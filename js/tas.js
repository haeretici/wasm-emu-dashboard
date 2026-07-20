/**
 * TAS Engine - Provides frame-perfect playback, recording, frame-stepping,
 * and state caching for the WASM retro emulators.
 *
 * Idle cost: zero on the input hot path. Hooks are installed lazily on first
 * REC/Play/Step only. InputManager.onButtonEdge stays null until then.
 *
 * Recording modes:
 *   - Live REC: ~60fps auto-advance while capturing held keys (normal gameplay).
 *   - Frame step (F): pause live advance, step one frame (precision / polish).
 *   - Rerecord: scrub/prev-checkpoint while REC stays on → transport stays PAUSED so
 *     you can aim and still jump Next CP. Future log + caches are truncated only when
 *     you commit overwrite (Space / live REC resume / live frame-step).
 *
 * Determinism: every stepped frame injects joypad state from the piano-roll entry for
 * that frame (after live REC has overwritten it from held keys). Never rely on
 * leftover core bits from savestate or mid-frame applyInput edges alone.
 *
 * Timeline scrubbing snaps to green-zone savestates (not every frame). Landing on a
 * checkpoint is what makes rewind useful for rerecord.
 *
 * State cache semantics (start-of-frame):
 *   stateCache[N] = { state, screen } ready to run frame N (inputs[N] not yet applied).
 *   - state: WASM savestate bytes
 *   - screen: RGBA snapshot of the last completed frame (framebuffer is NOT in MD/SNES
 *     savestates — Genesis clears bitmap on load; SNES leaves the previous GFX.Screen)
 *   Frame 0 is always pinned (boot / post-reset) and never evicted.
 *   maxCacheEntries is the rotating pool of non-zero checkpoints; total capacity is
 *   maxCacheEntries + 1 (frame 0 always kept).
 */

/** Compact buttonId (any case/label) -> piano-roll key. Allocated once. */
const TAS_BUTTON_KEY_MAP = {
    up: 'u', down: 'd', left: 'l', right: 'r',
    a: 'a', b: 'b', start: 's', select: 't',
    x: 'x', y: 'y', l: 'l1', r: 'r1',
    c: 'c', z: 'z', mode: 't'
};

/** Encode binary for JSON export (chunked to avoid apply() stack limits). */
function tasUint8ToBase64(u8) {
    if (!u8 || !u8.length) return '';
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < u8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(binary);
}

/** Decode base64 export payload back to Uint8Array. */
function tasBase64ToUint8(b64) {
    if (!b64 || typeof b64 !== 'string') return null;
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

// Snapshot *settings* (interval / max keep) are persisted per system DB.
// The green-zone savestate blobs themselves stay in RAM only (stateCache Map).
const TAS_SNAPSHOT_SETTINGS_KEY = 'tas_snapshot_settings_v1';
const TAS_SNAPSHOT_SETTINGS_STORE = 'savestates';
const TAS_SNAPSHOT_SETTINGS_VERSION = 1;

window.TASEngine = {
    // Current TAS state
    inputs: [],             // Array of TASInputFrame objects
    currentFrame: 0,        // Next frame to run / cursor position (start-of-frame)
    isPlaying: false,
    isRecording: false,
    // Auto-advance while recording (realtime / rerecord gameplay)
    isLiveRecording: false,
    // True while scrubbing: replay the log instead of live held keys
    _seeking: false,

    // In-memory savestate cache (frameNumber -> { state, screen })
    stateCache: new Map(),
    // ~1s at 60fps — dense enough that scrub/prev-checkpoint is useful for rerecord
    cacheInterval: 60,
    // Rotating non-zero checkpoints. Frame 0 is always kept → total = max + 1.
    maxCacheEntries: 80,

    // Live-record timing (~console framerate)
    recordFps: 60,
    _recordRafId: null,
    _recordLastTime: 0,
    // Bumped on pause/stop/start so any in-flight rAF cannot reschedule itself
    _recordGeneration: 0,
    _playbackRafId: null,
    _playbackGeneration: 0,

    // Keyboard hooks backup
    originalApplyInput: null,
    originalOnButtonEdge: null,
    _hooksInstalled: false,
    _uiRafId: null,

    /**
     * Install input hooks once (lazy). Until this runs, InputManager has no
     * TAS overhead on key/gamepad edges beyond the cheap heldButtonIds Set.
     */
    ensureHooks() {
        const im = window.InputManager;
        if (!im || this._hooksInstalled) return;

        this.originalApplyInput = im.applyInput.bind(im);
        this.originalOnButtonEdge = im.onButtonEdge || null;

        const self = this;

        im.applyInput = function(port, buttonId, pressed) {
            if (self.isPlaying) return;
            self.originalApplyInput(port, buttonId, pressed);
        };

        im.onButtonEdge = function(port, buttonId, pressed) {
            if (self.originalOnButtonEdge) {
                self.originalOnButtonEdge(port, buttonId, pressed);
            }
            if (!self.isRecording || self.isPlaying || port !== 1) return;
            self.recordButtonInput(buttonId, pressed);
        };

        this._hooksInstalled = true;
    },

    /**
     * Pauses normal emulator automatic execution and initializes TAS mode.
     */
    init() {
        if (!window.isLoaded || !window.gameModule) {
            console.warn("[TAS] Emulator core not loaded.");
            return false;
        }

        this.ensureEmulatorPaused();
        this.ensureHooks();
        this.ensureFrame0Cache();
        return true;
    },

    /**
     * Paint the current framebuffer without advancing emulation.
     * Prefer global paint helpers; fall back to bare names (classic script scope).
     */
    renderCurrentScreen() {
        // Shared paint (emulatorRuntime) plus legacy per-core aliases.
        const paint =
            window.paintScreen ||
            window.renderCanvas ||
            window.run1fr ||
            window.updateScreenFrame ||
            (typeof paintScreen === 'function' ? paintScreen : null) ||
            (typeof renderCanvas === 'function' ? renderCanvas : null) ||
            (typeof run1fr === 'function' ? run1fr : null) ||
            (typeof updateScreenFrame === 'function' ? updateScreenFrame : null);

        if (paint) {
            paint();
        }
    },

    /**
     * Clone the live display buffer for TAS checkpoints.
     * MD/SNES savestates omit the framebuffer, so scrub/prev-CP must restore pixels separately.
     * Reads WASM memory (works during silent seek when the canvas was not painted).
     * @returns {{width:number,height:number,data:Uint8ClampedArray}|null}
     */
    captureScreenSnapshot() {
        const gm = window.gameModule;
        if (!gm) return null;

        // Shared EMSDK surface: get_screen_buffer_ptr + optional width/height
        if (typeof gm._get_screen_buffer_ptr === 'function') {
            let width = 256;
            let height = 240;
            if (typeof gm._get_screen_width === 'function' && typeof gm._get_screen_height === 'function') {
                width = gm._get_screen_width() | 0;
                height = gm._get_screen_height() | 0;
            }
            if (width <= 0 || height <= 0) return null;
            const ptr = gm._get_screen_buffer_ptr();
            if (!ptr) return null;
            const bytes = width * height * 4;
            const view = new Uint8ClampedArray(gm.HEAPU8.buffer, ptr, bytes);
            return { width, height, data: new Uint8ClampedArray(view) };
        }

        return null;
    },

    /**
     * Put a cached RGBA snapshot onto #gameCanvas (no emulation step).
     * @param {{width:number,height:number,data:Uint8ClampedArray}|null|undefined} snap
     * @returns {boolean} true if painted from snapshot
     */
    restoreScreenSnapshot(snap) {
        if (!snap || !snap.data || snap.width <= 0 || snap.height <= 0) return false;
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        if (canvas.width !== snap.width || canvas.height !== snap.height) {
            canvas.width = snap.width;
            canvas.height = snap.height;
        }
        // ImageData requires a fresh Uint8ClampedArray it can own.
        const pixels = new Uint8ClampedArray(snap.data);
        ctx.putImageData(new ImageData(pixels, snap.width, snap.height), 0, 0);
        return true;
    },

    /**
     * Write currently held port-1 buttons into a frame object.
     * @param {number} frameIndex
     * @param {{replace?: boolean}} [opts] replace=true clears previous keys first (rerecord)
     */
    snapshotHeldInputs(frameIndex, opts) {
        const replace = !!(opts && opts.replace);
        const im = window.InputManager;
        if (replace || !this.inputs[frameIndex]) {
            this.inputs[frameIndex] = {};
        }
        if (!im?.heldButtonIds?.size) return false;

        let wrote = false;
        for (const buttonId of im.heldButtonIds) {
            const key = this.mapButtonIdToKey(buttonId);
            if (key) {
                this.inputs[frameIndex][key] = true;
                wrote = true;
            }
        }
        return wrote;
    },

    scheduleUIRefresh() {
        if (this._uiRafId !== null) return;
        this._uiRafId = requestAnimationFrame(() => {
            this._uiRafId = null;
            window.TASEngineUI.updateTimelineUI();
            window.TASEngineUI.renderPianoRoll();
        });
    },

    /**
     * Drop the movie branch after the cursor so the next record overwrites cleanly.
     * Keeps frames [0 .. currentFrame). Clears green zones past the cursor.
     * Call only when committing a rerecord write (live resume / live step), not on scrub —
     * scrub must keep later checkpoints so Next CP still works while aiming.
     */
    truncateFutureFromCursor() {
        if (this.inputs.length > this.currentFrame) {
            this.inputs.length = this.currentFrame;
        }
        for (const key of [...this.stateCache.keys()]) {
            if (key > this.currentFrame) {
                this.stateCache.delete(key);
            }
        }
    },

    /**
     * Cancel any scheduled live-record rAF and invalidate in-flight callbacks.
     */
    _cancelRecordLoop() {
        this._recordGeneration++;
        if (this._recordRafId !== null) {
            cancelAnimationFrame(this._recordRafId);
            this._recordRafId = null;
        }
    },

    /**
     * Start ~60fps auto-advance while isRecording (normal gameplay capture).
     * Commits rerecord: discards the future branch from the cursor first.
     */
    startLiveRecord() {
        if (!this.isRecording) return;
        this.isPlaying = false;
        // TAS owns the clock: free-run emscripten loop must stay off.
        this.ensureEmulatorPaused();
        // Commit overwrite: drop future inputs/checkpoints only now (not on scrub).
        this.truncateFutureFromCursor();
        this.snapshotHeldInputs(this.currentFrame, { replace: true });
        this._cancelRecordLoop();
        this.isLiveRecording = true;
        this._recordLastTime = performance.now();
        const gen = this._recordGeneration;
        this._recordRafId = requestAnimationFrame((t) => this.recordLoop(t, gen));
        window.TASEngineUI.syncTransportButtons();
    },

    /**
     * Pause auto-advance but keep REC armed (frame-step / scrub / aim).
     */
    pauseLiveRecord() {
        this.isLiveRecording = false;
        this._cancelRecordLoop();
        this.ensureEmulatorPaused();
        window.TASEngineUI.syncTransportButtons();
    },

    /**
     * Stop auto-advance and clear the rAF handle.
     */
    stopLiveRecord() {
        this.isLiveRecording = false;
        this._cancelRecordLoop();
    },

    /**
     * rAF-driven record loop: at most a few emulator frames per animation frame.
     * @param {number} now
     * @param {number} gen generation token from startLiveRecord
     */
    recordLoop(now, gen) {
        this._recordRafId = null;
        if (
            gen !== this._recordGeneration ||
            !this.isRecording ||
            !this.isLiveRecording ||
            this.isPlaying ||
            this._seeking
        ) {
            this.isLiveRecording = false;
            window.TASEngineUI.syncTransportButtons();
            return;
        }

        const frameDuration = 1000 / this.recordFps;
        if (now - this._recordLastTime >= frameDuration) {
            const maxCatchUp = 3;
            let steps = 0;
            while (
                this.isLiveRecording &&
                gen === this._recordGeneration &&
                this._recordLastTime + frameDuration <= now &&
                steps < maxCatchUp
            ) {
                this._recordLastTime += frameDuration;
                this.stepFrame();
                steps++;
            }
            if (now - this._recordLastTime > frameDuration * maxCatchUp) {
                this._recordLastTime = now;
            }
            window.TASEngineUI.updateTimelineUI();
            window.TASEngineUI.renderPianoRoll();
        }

        if (
            this.isRecording &&
            this.isLiveRecording &&
            gen === this._recordGeneration
        ) {
            this._recordRafId = requestAnimationFrame((t) => this.recordLoop(t, gen));
        }
    },

    clear() {
        this.isPlaying = false;
        this._cancelPlaybackLoop();
        this.stopLiveRecord();
        this.inputs = [];
        this.currentFrame = 0;
        this.isRecording = false;
        this._seeking = false;
        this.stateCache.clear();
        if (this._uiRafId !== null) {
            cancelAnimationFrame(this._uiRafId);
            this._uiRafId = null;
        }
        console.log("[TAS] Cleared input log and savestate cache.");
    },

    /**
     * Wipe movie + checkpoints and re-pin the live core as frame 0.
     * Does not hard-reset the ROM (mid-game free-play stays where it is).
     */
    clearAllAndRepin() {
        this.clear();
        this.ensureEmulatorPaused();
        if (window.isLoaded && window.gameModule) {
            this.cacheState(0);
            this.renderCurrentScreen();
        }
        console.log("[TAS] Piano roll and checkpoints cleared; frame 0 re-pinned.");
    },

    /**
     * After clear/load: capture current core state as frame 0 if none exists yet.
     * Does not overwrite an existing movie anchor.
     */
    ensureFrame0Cache() {
        if (!window.gameModule || !window.isLoaded) return;
        if (this.stateCache.has(0)) return;
        this.cacheState(0);
    },

    /**
     * Restore movie frame 0 from the pinned savestate.
     * Never hard-resets the ROM if a cache[0] exists — that would drop mid-game anchors
     * (e.g. user free-played to 1-1, pressed REC, then scrubbed back to 0).
     */
    goToMovieFrame0() {
        if (this.loadCachedState(0)) {
            this.currentFrame = 0;
            // Screen is restored inside loadCachedState (snapshot or live paint).
            return true;
        }
        // No anchor yet: fall back to a full emulator reset and pin that as frame 0.
        return this.hardResetAndPinFrame0();
    },

    /**
     * Full core reset + pin boot as frame 0. Clears intermediate green zones
     * (they are invalid after a hard reset). Used only when cache[0] is missing.
     */
    hardResetAndPinFrame0() {
        if (typeof window.resetEmulator === 'function') {
            window.resetEmulator();
        }
        this.currentFrame = 0;
        this.stateCache.clear();
        this.cacheState(0);
        this.renderCurrentScreen();
        return true;
    },

    /**
     * Pin the live emulator state as a green zone at the cursor.
     * Call when REC starts so free-play progress (outside TAS) becomes the movie origin.
     */
    anchorCurrentState() {
        if (!window.gameModule || !window.isLoaded) return;
        this.cacheState(this.currentFrame);
    },

    toggleRecord() {
        if (!this.init()) return;
        this.isPlaying = false;

        if (!this.isRecording) {
            this.isRecording = true;
            // Pin live core state at the cursor. Critical when the user free-played
            // outside TAS (e.g. to 1-1) while currentFrame is still 0: overwrite the
            // boot-time cache[0] so scrub→0 restores mid-game, not the title screen.
            if (this.currentFrame === 0) {
                // Later green zones from a different timeline (boot path) are invalid.
                this.stateCache.clear();
            }
            this.anchorCurrentState();
            // Drop any future branch so this session overwrites from the cursor.
            this.truncateFutureFromCursor();
            this.snapshotHeldInputs(this.currentFrame, { replace: true });
            this.scheduleUIRefresh();
            // Realtime capture: game advances while keys are logged.
            this.startLiveRecord();
            console.log("[TAS] Record Mode: ENABLED (live)");
        } else {
            this.isRecording = false;
            this.stopLiveRecord();
            this.scheduleUIRefresh();
            console.log("[TAS] Record Mode: DISABLED");
        }
    },

    recordButtonInput(buttonId, pressed) {
        if (!this.isRecording) return;

        const key = this.mapButtonIdToKey(buttonId);
        if (!key) return;

        if (!this.inputs[this.currentFrame]) {
            this.inputs[this.currentFrame] = {};
        }

        if (pressed) {
            this.inputs[this.currentFrame][key] = true;
        } else {
            delete this.inputs[this.currentFrame][key];
        }

        this.scheduleUIRefresh();
    },

    mapButtonIdToKey(buttonId) {
        if (!buttonId) return null;
        return TAS_BUTTON_KEY_MAP[String(buttonId).toLowerCase()] || null;
    },

    injectInputs(frameIndex) {
        const frameInput = this.inputs[frameIndex] || {};
        const systemId = window.GlobalConfiguration?.systemId;
        if (!window.gameModule) return;

        if (systemId === 'nes') {
            const nesButtons = {
                a: 0x01, b: 0x02, select: 0x04, start: 0x08,
                up: 0x10, down: 0x20, left: 0x40, right: 0x80
            };
            for (const btn in nesButtons) {
                const key = this.mapButtonIdToKey(btn);
                window.gameModule._set_controller_state(0, nesButtons[btn], !!frameInput[key]);
            }
        } else if (systemId === 'snes') {
            // snes9x masks: B=15 Y=14 Select=13 Start=12 Up=11 … R=4
            // (see snes9x.h SNES_*_MASK and SystemButtonMaps.snes bits)
            let bitmask = 0;
            const snesButtons = window.SystemButtonMaps?.snes?.buttons;
            if (snesButtons && snesButtons.length) {
                for (let i = 0; i < snesButtons.length; i++) {
                    const def = snesButtons[i];
                    if (typeof def.bit !== 'number') continue;
                    const key = this.mapButtonIdToKey(def.id);
                    if (key && frameInput[key]) bitmask |= (1 << def.bit);
                }
            } else {
                // Fallback if maps not loaded yet
                const snesBits = {
                    b: 15, y: 14, select: 13, start: 12,
                    up: 11, down: 10, left: 9, right: 8,
                    a: 7, x: 6, l: 5, r: 4
                };
                for (const btn in snesBits) {
                    if (frameInput[btn]) bitmask |= (1 << snesBits[btn]);
                }
            }
            if (typeof window.gameModule._set_controller_state === 'function') {
                // Replace full pad state for this frame (clear then apply pressed bits).
                window.gameModule._set_controller_state(0, 0xFFFF, 0);
                if (bitmask) window.gameModule._set_controller_state(0, bitmask, 1);
            }
        } else if (systemId === 'md') {
            // Masks match INPUT_* in src/md/core/input_hw/input.h and systemButtons.js
            const mdButtons = {
                up: 0x0001, down: 0x0002, left: 0x0004, right: 0x0008,
                b: 0x0010, c: 0x0020, a: 0x0040, start: 0x0080,
                z: 0x0100, y: 0x0200, x: 0x0400, mode: 0x0800
            };
            for (const btn in mdButtons) {
                const key = this.mapButtonIdToKey(btn);
                window.gameModule._set_controller_state(0, mdButtons[btn], !!frameInput[key] ? 1 : 0);
            }
        }
    },

    /**
     * Whether to store a green-zone savestate at the start of `frame`.
     * Frame 0 is always cached; others every cacheInterval (including silent seek).
     */
    shouldCacheFrame(frame) {
        if (frame === 0) return true;
        if (frame < 0) return false;
        return frame % this.cacheInterval === 0;
    },

    /**
     * Keep free-run loops cancelled while TAS drives frames manually.
     * MUST force-pause (never toggle). window.isPaused used to be a non-window
     * `let`, so !window.isPaused was always true and every call resumed free-run.
     */
    ensureEmulatorPaused() {
        if (!window.isLoaded) return;
        if (typeof window.setEmulatorPaused === 'function') {
            window.setEmulatorPaused(true);
            return;
        }
        // Fallback if app.js is older than this TAS build.
        if (window.gameModule && typeof window.gameModule._pause_emulator === 'function') {
            window.gameModule._pause_emulator();
        }
        window.isPaused = true;
    },

    /**
     * Executes exactly one emulation frame.
     * @param {boolean} silent - skip paint; still may write green-zone caches
     */
    stepFrame(silent = false) {
        if (!window.isLoaded || !window.gameModule) return;

        // Never free-run during a manual/seek step.
        this.ensureEmulatorPaused();

        const systemId = window.GlobalConfiguration?.systemId;

        // During seek / playback: piano-roll is historical truth.
        // Live REC only differs in how the frame entry is written (held keys), not how
        // it is applied. Always inject from the log so core joypad state matches what
        // will be replayed later — otherwise rerecord desyncs:
        //   - load_state restores old controller bits from the checkpoint
        //   - held keys that never re-edge after scrub never re-apply via applyInput
        //   - piano roll is overwritten with held keys, but the frame ran on different bits
        const useLiveRecording = this.isRecording && !this._seeking;

        if (useLiveRecording) {
            // Commit rerecord write: drop future branch once before overwriting this frame.
            this.truncateFutureFromCursor();
            // Replace so rerecord does not keep keys from the old take.
            this.snapshotHeldInputs(this.currentFrame, { replace: true });
        }
        // Deterministic apply: same path for record, rerecord, seek, and playback.
        this.injectInputs(this.currentFrame);

        // Shared single-frame step across nes/snes/md; paint helpers differ per app.js.
        if (typeof window.gameModule._run_frame !== 'function') {
            console.error("[TAS] _run_frame missing for system:", systemId);
            return;
        }
        window.gameModule._run_frame();
        if (!silent) this.renderCurrentScreen();

        // Advance to start of next frame, then optionally cache that start state.
        this.currentFrame++;

        if (this.shouldCacheFrame(this.currentFrame)) {
            this.cacheState(this.currentFrame);
        }

        if (useLiveRecording) {
            this.snapshotHeldInputs(this.currentFrame, { replace: true });
        }
    },

    _cancelPlaybackLoop() {
        this._playbackGeneration++;
        if (this._playbackRafId !== null) {
            cancelAnimationFrame(this._playbackRafId);
            this._playbackRafId = null;
        }
    },

    playbackLoop(gen) {
        this._playbackRafId = null;
        if (gen !== this._playbackGeneration || !this.isPlaying) {
            return;
        }

        if (this.currentFrame >= this.inputs.length && !this.isRecording) {
            console.log("[TAS] Playback reached end of input log.");
            window.TASEngineUI.pause();
            return;
        }

        this.stepFrame();
        window.TASEngineUI.updateTimelineUI();
        window.TASEngineUI.renderPianoRoll();

        if (this.isPlaying && gen === this._playbackGeneration) {
            this._playbackRafId = requestAnimationFrame(() => this.playbackLoop(gen));
        }
    },

    /**
     * Resume movie playback from the current cursor (does not reset).
     * Stops recording — playback never writes the log.
     */
    play() {
        if (!this.init()) return;
        this.stopLiveRecord();
        this.isRecording = false;
        this.ensureEmulatorPaused();
        this._cancelPlaybackLoop();
        this.isPlaying = true;
        const gen = this._playbackGeneration;
        console.log(`[TAS] Playback started at frame ${this.currentFrame}.`);
        window.TASEngineUI.syncTransportButtons();
        this._playbackRafId = requestAnimationFrame(() => this.playbackLoop(gen));
    },

    /**
     * Jump to movie frame 0 (cached anchor, not necessarily ROM boot) and play.
     */
    playFromStart() {
        if (!this.init()) return;
        this.stopLiveRecord();
        this.isPlaying = false;
        this.isRecording = false;
        this.scrubToFrame(0);
        this.play();
        console.log("[TAS] Playback from movie frame 0.");
    },

    /**
     * Stop movie playback and/or live-record auto-advance.
     * Does not exit REC mode (use toggleRecord for that).
     * Always freezes the clock — free-run must not keep going when piano roll stops.
     */
    pause() {
        this.isPlaying = false;
        this._cancelPlaybackLoop();
        this.pauseLiveRecord();
        this.ensureEmulatorPaused();
        this.renderCurrentScreen();
        console.log("[TAS] Paused (emulator free-run cancelled).");
        window.TASEngineUI.syncTransportButtons();
    },

    /**
     * Whether Space should drive TAS transport (not free-run).
     * - REC armed (live or paused): always
     * - Movie currently playing: always
     * - Movie paused with a log (or cursor past 0): resume playback
     * - Pure free-run with empty log: no — empty play() only freezes free-run
     */
    isSpaceTransportContext() {
        if (this.isRecording || this.isPlaying || this.isLiveRecording) {
            return true;
        }
        // Paused movie / loaded run: allow Space to resume play from cursor.
        return this.inputs.length > 0 || this.currentFrame > 0;
    },

    /**
     * Space / Play button: if REC is on, toggle live capture advance;
     * otherwise toggle movie playback. No-op outside TAS transport context
     * (Play button still forces play when a run exists via play()).
     */
    toggleTransport() {
        // Guard Space/idle path: never enter empty play() during free-run.
        // Play UI can still call play() / playFromStart() directly.
        if (!this.isSpaceTransportContext()) {
            console.log('[TAS] Space ignored (not in REC/playback context). Use R to record or Play for a movie.');
            return;
        }

        if (!this.init()) return;

        if (this.isRecording) {
            if (this.isLiveRecording) {
                // Space during live REC → pause capture (REC stays armed).
                this.pauseLiveRecord();
                console.log("[TAS] Live record paused (still recording). Space again to resume.");
            } else {
                // Space while REC armed but paused → resume overwrite from cursor.
                this.startLiveRecord();
                console.log("[TAS] Live record resumed (overwrite from cursor).");
            }
            return;
        }

        if (this.isPlaying) {
            // Space during movie play → pause at cursor.
            this.pause();
        } else {
            // Space after movie pause (or with a loaded log) → play from cursor.
            this.play();
        }
    },

    /**
     * Best green-zone frame at or before target (start-of-frame cache).
     * Prefers the highest cached frame <= targetFrame.
     */
    findClosestCacheAtOrBefore(targetFrame) {
        let best = -1;
        for (const cachedFrame of this.stateCache.keys()) {
            if (cachedFrame <= targetFrame && cachedFrame > best) {
                best = cachedFrame;
            }
        }
        return best;
    },

    /**
     * Highest cached frame strictly before `fromFrame` (previous snapshot).
     * @returns {number} frame index or -1
     */
    findPreviousCheckpoint(fromFrame) {
        let best = -1;
        for (const cachedFrame of this.stateCache.keys()) {
            if (cachedFrame < fromFrame && cachedFrame > best) {
                best = cachedFrame;
            }
        }
        return best;
    },

    /**
     * Lowest cached frame strictly after `fromFrame` (next snapshot).
     * @returns {number} frame index or -1
     */
    findNextCheckpoint(fromFrame) {
        let best = -1;
        for (const cachedFrame of this.stateCache.keys()) {
            if (cachedFrame > fromFrame && (best < 0 || cachedFrame < best)) {
                best = cachedFrame;
            }
        }
        return best;
    },

    /**
     * Snap a requested scrub position to a usable savestate landing.
     * - Backward: always a green zone (checkpoint at/before target).
     * - Forward: next available checkpoint if one lies on the path; else exact frame (FF).
     */
    snapScrubTarget(targetFrame) {
        targetFrame = Math.max(0, targetFrame | 0);
        const cur = this.currentFrame;

        if (targetFrame < cur) {
            const snapped = this.findClosestCacheAtOrBefore(targetFrame);
            return snapped >= 0 ? snapped : 0;
        }

        if (targetFrame === cur) {
            return cur;
        }

        // Forward: prefer a checkpoint strictly after current and <= target.
        const ahead = this.findClosestCacheAtOrBefore(targetFrame);
        if (ahead > cur) {
            return ahead;
        }
        // No intermediate green zone yet — allow free forward (will FF + cache along the way).
        return targetFrame;
    },

    /**
     * Jump to previous green zone (rerecord-friendly rewind).
     * Stays paused; does not discard later checkpoints until overwrite commits.
     */
    goToPreviousCheckpoint() {
        if (!this.init()) return false;
        const prev = this.findPreviousCheckpoint(this.currentFrame);
        if (prev < 0) {
            if (this.currentFrame > 0) {
                this.scrubToFrame(0, { snap: false });
                return true;
            }
            console.log("[TAS] Already at earliest checkpoint.");
            return false;
        }
        this.scrubToFrame(prev, { snap: false });
        return true;
    },

    /**
     * Jump to next green zone (or end of log if none). Stays paused.
     */
    goToNextCheckpoint() {
        if (!this.init()) return false;
        const next = this.findNextCheckpoint(this.currentFrame);
        if (next < 0) {
            console.log("[TAS] No later checkpoint cached.");
            return false;
        }
        this.scrubToFrame(next, { snap: false });
        return true;
    },

    /**
     * Seek to target frame (start-of-frame cursor).
     * - Timeline default: snap to green zone at/before target (opts.snap !== false)
     * - After scrub: always stay PAUSED (no auto-resume live) so rerecord is intentional
     * - Does NOT discard future checkpoints/inputs on scrub (Next CP must still work).
     *   Branch cut happens when live overwrite commits (Space / F while REC).
     * - Frame 0: load pinned movie anchor (NOT hard reset if cache exists)
     *
     * @param {number} targetFrame
     * @param {{snap?: boolean}} [opts] snap=false skips checkpoint snapping (piano-roll / exact)
     */
    scrubToFrame(targetFrame, opts) {
        if (!window.isLoaded || !window.gameModule) return;

        const snap = !opts || opts.snap !== false;
        targetFrame = Math.max(0, targetFrame | 0);
        if (snap) {
            targetFrame = this.snapScrubTarget(targetFrame);
        }

        // Always freeze transport before/after seek — never leave live running mid-scrub.
        this.isPlaying = false;
        this.pauseLiveRecord();

        if (targetFrame === this.currentFrame) {
            this.renderCurrentScreen();
            this.ensureEmulatorPaused();
            window.TASEngineUI.syncTransportButtons();
            return;
        }

        const wasRecording = this.isRecording;
        this._seeking = true;

        try {
            if (targetFrame === 0) {
                this.goToMovieFrame0();
                return;
            }

            // If we already have a cache at the exact target, load it directly.
            // loadCachedState restores the screen snapshot (MD/SNES FB not in savestate).
            if (this.stateCache.has(targetFrame) && this.loadCachedState(targetFrame)) {
                this.currentFrame = targetFrame;
                return;
            }

            // Forward seek: current emulator state is already valid — just tick ahead.
            if (targetFrame > this.currentFrame) {
                while (this.currentFrame < targetFrame) {
                    const last = this.currentFrame === targetFrame - 1;
                    this.stepFrame(!last);
                }
                return;
            }

            // Backward: nearest green zone at or before target, then fast-forward.
            // paint:false when we still need to step — last stepFrame paints the landing frame.
            let start = this.findClosestCacheAtOrBefore(targetFrame);
            const willFf = start >= 0 && start < targetFrame;
            if (start < 0 || !this.loadCachedState(start, { paint: !willFf })) {
                if (!this.goToMovieFrame0()) {
                    return;
                }
                start = 0;
            } else {
                this.currentFrame = start;
            }

            while (this.currentFrame < targetFrame) {
                const last = this.currentFrame === targetFrame - 1;
                this.stepFrame(!last);
            }
        } finally {
            this._seeking = false;
            // Stay paused after scrub. Rerecord resume is intentional (Space / Play).
            // Keep later green zones so » CP / next checkpoint still navigates the path.
            this.isPlaying = false;
            this.pauseLiveRecord();
            this.ensureEmulatorPaused();

            console.log(`[TAS] Scrubbed to frame ${this.currentFrame} (paused${wasRecording ? ', REC armed' : ''})`);
            window.TASEngineUI.syncTransportButtons();
        }
    },

    /**
     * Count of non-zero green-zone entries (the rotating pool).
     */
    rotatingCacheCount() {
        let n = 0;
        for (const key of this.stateCache.keys()) {
            if (key !== 0) n++;
        }
        return n;
    },

    /**
     * Apply user snapshot settings (interval frames + rotating max keep).
     * Frame 0 is always kept separately (total capacity = maxKeep + 1).
     * Does not write IndexedDB — call persistSnapshotSettings() for that.
     */
    setSnapshotSettings({ cacheInterval, maxCacheEntries } = {}) {
        if (cacheInterval != null) {
            const n = Math.floor(Number(cacheInterval));
            if (Number.isFinite(n) && n >= 1) {
                this.cacheInterval = Math.min(n, 3600);
            }
        }
        if (maxCacheEntries != null) {
            const n = Math.floor(Number(maxCacheEntries));
            if (Number.isFinite(n) && n >= 1) {
                this.maxCacheEntries = Math.min(n, 500);
                this.pruneRotatingCache();
            }
        }
    },

    /**
     * Load interval / max-keep from IndexedDB (per-system DB) and apply in memory.
     * Checkpoint blobs are NOT stored in IDB — only these two numbers.
     */
    async loadSnapshotSettings() {
        if (typeof idbGet !== 'function') return false;
        try {
            const data = await idbGet(TAS_SNAPSHOT_SETTINGS_KEY, TAS_SNAPSHOT_SETTINGS_STORE);
            if (!data || data.version !== TAS_SNAPSHOT_SETTINGS_VERSION) return false;
            this.setSnapshotSettings({
                cacheInterval: data.cacheInterval,
                maxCacheEntries: data.maxCacheEntries
            });
            return true;
        } catch (e) {
            console.warn('[TAS] Failed to load snapshot settings from IndexedDB.', e);
            return false;
        }
    },

    /**
     * Persist current interval / max-keep to IndexedDB (per-system DB).
     */
    async persistSnapshotSettings() {
        if (typeof idbSet !== 'function') return false;
        try {
            await idbSet(
                TAS_SNAPSHOT_SETTINGS_KEY,
                {
                    version: TAS_SNAPSHOT_SETTINGS_VERSION,
                    cacheInterval: this.cacheInterval,
                    maxCacheEntries: this.maxCacheEntries
                },
                TAS_SNAPSHOT_SETTINGS_STORE
            );
            return true;
        } catch (e) {
            console.warn('[TAS] Failed to save snapshot settings to IndexedDB.', e);
            return false;
        }
    },

    /**
     * Drop oldest non-zero checkpoints until rotating pool fits maxCacheEntries.
     * Frame 0 is never removed.
     */
    pruneRotatingCache() {
        while (this.rotatingCacheCount() > this.maxCacheEntries) {
            let evicted = false;
            for (const key of this.stateCache.keys()) {
                if (key !== 0) {
                    this.stateCache.delete(key);
                    evicted = true;
                    break;
                }
            }
            if (!evicted) break;
        }
    },

    /**
     * Snapshots WASM memory (+ display) for start-of-frame `frameNumber`.
     * Frame 0 is pinned and never evicted.
     * Entry shape: { state: Uint8Array, screen: {width,height,data}|null }
     */
    cacheState(frameNumber) {
        if (!window.gameModule) return;
        if (typeof window.gameModule._get_save_state_size !== 'function') return;
        if (typeof window.gameModule._save_state !== 'function') return;

        const saveSize = window.gameModule._get_save_state_size();
        const savePtr = window.gameModule._save_state();
        if (!savePtr || saveSize <= 0) return;

        const memorySnapshot = new Uint8Array(window.gameModule.HEAPU8.buffer, savePtr, saveSize);
        const clonedState = new Uint8Array(memorySnapshot);
        // Capture before any later load can wipe/stale the core framebuffer.
        const screen = this.captureScreenSnapshot();

        // Rotating pool only covers non-zero frames; frame 0 is free (+1 capacity).
        if (
            frameNumber !== 0 &&
            !this.stateCache.has(frameNumber) &&
            this.rotatingCacheCount() >= this.maxCacheEntries
        ) {
            for (const key of this.stateCache.keys()) {
                if (key !== 0) {
                    this.stateCache.delete(key);
                    break;
                }
            }
        }

        this.stateCache.set(frameNumber, { state: clonedState, screen });
    },

    /**
     * Restore a green-zone entry: WASM savestate + canvas snapshot.
     * MD/SNES cores do not keep a valid framebuffer inside loadState, so painting
     * from the core alone yields black (Genesis) or a stale frame (SNES).
     * @param {number} frameNumber
     * @param {{paint?: boolean}} [opts] paint=false skips canvas update (mid-seek FF base)
     */
    loadCachedState(frameNumber, opts) {
        const entry = this.stateCache.get(frameNumber);
        if (!entry) return false;
        if (typeof window.gameModule._my_malloc !== 'function') return false;

        // Back-compat if any bare Uint8Array entries remain in-memory.
        const stateData = entry instanceof Uint8Array ? entry : entry.state;
        const screen = entry instanceof Uint8Array ? null : entry.screen;
        if (!stateData) return false;

        const saveSize = window.gameModule._get_save_state_size();
        const tempBufferPtr = window.gameModule._my_malloc(saveSize);
        if (!tempBufferPtr) return false;

        const shouldPaint = !opts || opts.paint !== false;

        try {
            window.gameModule.HEAPU8.set(stateData, tempBufferPtr);
            window.gameModule._load_state(tempBufferPtr, saveSize);
            if (shouldPaint) {
                // Prefer snapshot; fall back to live paint (NES FB is inside savestate).
                if (!this.restoreScreenSnapshot(screen)) {
                    this.renderCurrentScreen();
                }
            }
            return true;
        } finally {
            window.gameModule._my_free(tempBufferPtr);
        }
    },

    /**
     * Serialize one cache entry for JSON export (state + optional screen as base64).
     */
    serializeSnapshotEntry(frame, entry) {
        if (entry == null) return null;
        const stateData = entry instanceof Uint8Array ? entry : entry.state;
        if (!stateData) return null;

        const out = {
            frame: frame | 0,
            state: tasUint8ToBase64(stateData)
        };

        const screen = entry instanceof Uint8Array ? null : entry.screen;
        if (screen && screen.data && screen.width > 0 && screen.height > 0) {
            out.screen = {
                width: screen.width | 0,
                height: screen.height | 0,
                data: tasUint8ToBase64(
                    screen.data instanceof Uint8Array
                        ? screen.data
                        : new Uint8Array(screen.data)
                )
            };
        }
        return out;
    },

    /**
     * Rebuild stateCache entry from exported snapshot object.
     */
    deserializeSnapshotEntry(snap) {
        if (!snap || typeof snap !== 'object') return null;
        const frame = snap.frame | 0;
        if (frame < 0) return null;
        const state = tasBase64ToUint8(snap.state);
        if (!state || !state.length) return null;

        let screen = null;
        if (snap.screen && snap.screen.data) {
            const data = tasBase64ToUint8(snap.screen.data);
            const width = snap.screen.width | 0;
            const height = snap.screen.height | 0;
            if (data && width > 0 && height > 0) {
                screen = {
                    width,
                    height,
                    data: new Uint8ClampedArray(data)
                };
            }
        }
        return { frame, entry: { state, screen } };
    },

    /**
     * Import movie + optional checkpoint snapshots.
     * Restores savestate cache first, then loads frame 0 into the core so the piano
     * roll starts from the correct emulator state (same idea as load-state-then-play).
     */
    importJSON(jsonString) {
        try {
            const run = JSON.parse(jsonString);
            if (!run.systemId || !Array.isArray(run.inputs)) {
                throw new Error("Invalid run schema.");
            }
            const currentSystem = window.GlobalConfiguration?.systemId;
            if (currentSystem && run.systemId !== currentSystem) {
                throw new Error(
                    `TAS is for system "${run.systemId}", but the current core is "${currentSystem}".`
                );
            }

            this.clear();

            // Settings from file (if present) so interval/max match the export.
            this.setSnapshotSettings({
                cacheInterval: run.cacheInterval,
                maxCacheEntries: run.maxCacheEntries
            });

            // Snapshots first: pin frame 0 (and rotating green zones) before the log.
            let loadedSnapshots = 0;
            if (Array.isArray(run.snapshots)) {
                for (const snap of run.snapshots) {
                    const decoded = this.deserializeSnapshotEntry(snap);
                    if (!decoded) continue;
                    this.stateCache.set(decoded.frame, decoded.entry);
                    loadedSnapshots++;
                }
                this.pruneRotatingCache();
            }

            this.inputs = run.inputs;
            this.currentFrame = 0;

            // Prefer restoring the exported frame-0 savestate (may be mid-game anchor).
            // Fall back to hard reset only when no snapshot was provided (legacy files).
            if (this.stateCache.has(0) && this.loadCachedState(0)) {
                this.currentFrame = 0;
                this.ensureEmulatorPaused();
            } else if (typeof window.resetEmulator === 'function') {
                window.resetEmulator();
                this.cacheState(0);
                this.renderCurrentScreen();
            } else {
                this.ensureFrame0Cache();
            }

            console.log(
                `[TAS] Imported run successfully. Total frames: ${this.inputs.length}` +
                (loadedSnapshots ? `, snapshots: ${loadedSnapshots}` : '')
            );
            return true;
        } catch (e) {
            console.error("[TAS] Failed to import JSON.", e);
            alert("Failed to load TAS file: " + e.message);
            return false;
        }
    },

    exportJSON() {
        const systemId = window.GlobalConfiguration?.systemId || "unknown";

        // Only frame 0: enough to restore the movie origin so import can play the log.
        // Intermediate green zones are rebuilt during playback / scrub as needed.
        const snapshots = [];
        if (this.stateCache.has(0)) {
            const serialized = this.serializeSnapshotEntry(0, this.stateCache.get(0));
            if (serialized) snapshots.push(serialized);
        }

        const run = {
            systemId: systemId,
            romName: window.currentRomName || "unknown",
            totalFrames: this.inputs.length,
            cacheInterval: this.cacheInterval,
            maxCacheEntries: this.maxCacheEntries,
            inputs: this.inputs,
            snapshots: snapshots
        };

        const jsonString = JSON.stringify(run, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        let romBaseName = window.currentRomName || "emu";
        const dotIdx = romBaseName.lastIndexOf('.');
        if (dotIdx !== -1) romBaseName = romBaseName.substring(0, dotIdx);

        a.download = `${romBaseName}_tas.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log(
            `[TAS] Exported run to JSON (${this.inputs.length} frames` +
            (snapshots.length ? ', frame-0 snapshot' : ', no snapshot') + ').'
        );
    }
};

/**
 * TAS Engine UI Controller
 */
window.TASEngineUI = {
    playBtn: null,
    playStartBtn: null,
    recBtn: null,
    stepBtn: null,
    importBtn: null,
    exportBtn: null,
    slider: null,
    display: null,
    grid: null,
    _cached: false,
    _lastRenderKey: '',

    cacheElements(force = false) {
        if (this._cached && !force) return;
        this.playBtn = document.getElementById('btnTasPlay');
        this.playStartBtn = document.getElementById('btnTasPlayStart');
        this.recBtn = document.getElementById('btnTasRecord');
        this.stepBtn = document.getElementById('btnTasStep');
        this.prevCpBtn = document.getElementById('btnTasPrevCp');
        this.nextCpBtn = document.getElementById('btnTasNextCp');
        this.importBtn = document.getElementById('btnTasImport');
        this.exportBtn = document.getElementById('btnTasExport');
        this.clearBtn = document.getElementById('btnTasClear');
        this.slider = document.getElementById('tasFrameSlider');
        this.display = document.getElementById('tasFrameDisplay');
        this.grid = document.getElementById('tasPianoRollGrid');
        this.cacheIntervalInput = document.getElementById('tasCacheInterval');
        this.maxSnapshotsInput = document.getElementById('tasMaxSnapshots');
        this._cached = true;
    },

    /**
     * Keep snapshot setting fields in sync with TASEngine values.
     */
    syncSnapshotSettingsUI() {
        this.cacheElements();
        const eng = window.TASEngine;
        if (this.cacheIntervalInput && document.activeElement !== this.cacheIntervalInput) {
            this.cacheIntervalInput.value = String(eng.cacheInterval);
        }
        if (this.maxSnapshotsInput && document.activeElement !== this.maxSnapshotsInput) {
            this.maxSnapshotsInput.value = String(eng.maxCacheEntries);
        }
    },

    /**
     * User changed interval / max-keep in the TAS panel.
     * Applies in memory and persists the two numbers to IndexedDB (not the snapshots).
     */
    async onSnapshotSettingsChange() {
        this.cacheElements();
        const interval = this.cacheIntervalInput
            ? parseInt(this.cacheIntervalInput.value, 10)
            : undefined;
        const maxKeep = this.maxSnapshotsInput
            ? parseInt(this.maxSnapshotsInput.value, 10)
            : undefined;
        window.TASEngine.setSnapshotSettings({
            cacheInterval: interval,
            maxCacheEntries: maxKeep
        });
        await window.TASEngine.persistSnapshotSettings();
        this.syncSnapshotSettingsUI();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    setPlayButtonPaused(paused) {
        if (!this.playBtn) return;
        if (paused) {
            this.playBtn.innerHTML = `<i class="fa-solid fa-play"></i> Play`;
        } else {
            this.playBtn.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
        }
    },

    /**
     * Reflect Play vs live-REC transport state on the Play button and Rec active class.
     */
    syncTransportButtons() {
        this.cacheElements();
        const eng = window.TASEngine;
        if (this.recBtn) {
            if (eng.isRecording) {
                this.recBtn.classList.add('active');
            } else {
                this.recBtn.classList.remove('active');
            }
        }
        // Running = movie playback OR live record advance
        const running = eng.isPlaying || (eng.isRecording && eng.isLiveRecording);
        this.setPlayButtonPaused(!running);
    },

    onEmulatorLoadStateChanged(loaded) {
        this.cacheElements(true);

        const controls = [
            this.playBtn, this.playStartBtn, this.recBtn, this.stepBtn,
            this.prevCpBtn, this.nextCpBtn,
            this.importBtn, this.exportBtn, this.clearBtn, this.slider
        ];
        controls.forEach((btn) => {
            if (btn) btn.disabled = !loaded;
        });

        if (loaded) {
            window.TASEngine.clear();
            // Pin boot savestate once the core is ready (no TAS input hooks yet).
            window.TASEngine.ensureFrame0Cache();
            this.syncSnapshotSettingsUI();
            this.syncTransportButtons();
            this.updateTimelineUI();
            this.renderPianoRoll(true);
            console.log("[TAS UI] Enabled controls and initialized timeline.");
        } else {
            window.TASEngine.clear();
            if (this.grid) this.grid.innerHTML = "";
            if (this.display) this.display.innerText = "Frame: 0 / 0";
            this._lastRenderKey = '';
            this.syncSnapshotSettingsUI();
            this.syncTransportButtons();
        }
    },

    togglePlay() {
        this.cacheElements();
        window.TASEngine.toggleTransport();
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll();
    },

    play() {
        window.TASEngine.play();
        this.syncTransportButtons();
    },

    /**
     * Restart movie from frame 0 and play.
     */
    playFromStart() {
        this.cacheElements();
        window.TASEngine.playFromStart();
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    pause() {
        window.TASEngine.pause();
        this.syncTransportButtons();
    },

    toggleRecord() {
        this.cacheElements();
        window.TASEngine.toggleRecord();
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    stepFrame() {
        this.cacheElements();
        // Single-frame precision: kill movie play + live auto-advance, then one tick.
        window.TASEngine.isPlaying = false;
        window.TASEngine._cancelPlaybackLoop();
        window.TASEngine.pauseLiveRecord();
        if (!window.TASEngine.init()) return;
        window.TASEngine.ensureEmulatorPaused();
        window.TASEngine.stepFrame();
        window.TASEngine.ensureEmulatorPaused();
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll();
    },

    onSliderInput(event) {
        this.cacheElements();
        // Slider lands on green-zone snapshots only (snap inside scrubToFrame).
        // After scrub: always paused — Space resumes live overwrite if REC is on.
        const raw = parseInt(event.target.value, 10);
        window.TASEngine.scrubToFrame(raw, { snap: true });
        // Reflect snapped checkpoint on the control.
        if (this.slider) {
            this.slider.value = window.TASEngine.currentFrame;
        }
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    prevCheckpoint() {
        this.cacheElements();
        window.TASEngine.goToPreviousCheckpoint();
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    nextCheckpoint() {
        this.cacheElements();
        window.TASEngine.goToNextCheckpoint();
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    /**
     * Clear piano roll + all TAS savestates (user-facing; confirms first).
     */
    clearAll() {
        this.cacheElements();
        if (!window.isLoaded) return;
        const hasData =
            window.TASEngine.inputs.length > 0 ||
            window.TASEngine.stateCache.size > 0 ||
            window.TASEngine.currentFrame > 0 ||
            window.TASEngine.isRecording ||
            window.TASEngine.isPlaying;
        if (hasData) {
            const ok = window.confirm(
                'Clear the piano roll and all TAS savestate checkpoints?\n\n' +
                'This cannot be undone. The emulator stays where it is (pinned as new frame 0).'
            );
            if (!ok) return;
        }
        window.TASEngine.clearAllAndRepin();
        this._lastRenderKey = '';
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    importClick() {
        const fileInput = document.getElementById('tasImportFileInput');
        if (fileInput) fileInput.click();
    },

    async handleImport(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;

        try {
            const text = await file.text();
            if (window.TASEngine.importJSON(text)) {
                this.pause();
                // Keep IDB settings in sync when a movie brings its own interval/max.
                await window.TASEngine.persistSnapshotSettings();
                this.syncSnapshotSettingsUI();
                this.updateTimelineUI();
                this.renderPianoRoll(true);
            }
        } catch (e) {
            console.error(e);
        }
    },

    updateTimelineUI() {
        this.cacheElements();
        if (!this.slider || !this.display) return;

        const eng = window.TASEngine;
        const current = eng.currentFrame;
        const total = Math.max(eng.inputs.length, current);

        this.slider.max = Math.max(total, 0);
        this.slider.value = current;

        let mode = '';
        if (eng.isRecording && eng.isLiveRecording) {
            mode = ' | REC live';
        } else if (eng.isRecording) {
            mode = ' | REC paused — Space to overwrite';
        } else if (eng.isPlaying) {
            mode = ' | playing';
        }
        const onCp = eng.stateCache.has(current) ? ' ◆' : '';
        this.display.innerText = `Frame: ${current} / ${total}${onCp}${mode}`;
    },

    getSystemButtons(systemId) {
        if (systemId === 'nes') {
            return ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Select', 'Start'];
        }
        if (systemId === 'snes') {
            return ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'X', 'Y', 'L', 'R', 'Select', 'Start'];
        }
        if (systemId === 'md') {
            return ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'C', 'X', 'Y', 'Z', 'Mode', 'Start'];
        }
        return [];
    },

    renderPianoRoll(force = false) {
        this.cacheElements();
        if (!this.grid) return;

        const systemId = window.GlobalConfiguration?.systemId;
        if (!systemId) return;

        const buttons = this.getSystemButtons(systemId);
        if (buttons.length === 0) return;

        const frameWindow = 20;
        const currentFrame = window.TASEngine.currentFrame;
        const startFrame = Math.max(0, currentFrame - 6);
        const endFrame = Math.max(frameWindow, currentFrame + 14);

        const renderKey = `${systemId}:${currentFrame}:${startFrame}:${endFrame}:${window.TASEngine.inputs.length}`;
        if (!force && renderKey === this._lastRenderKey && this.grid.childElementCount > 0) {
            this.updateCurrentRowCheckboxes(buttons, currentFrame);
            return;
        }
        this._lastRenderKey = renderKey;

        this.grid.style.gridTemplateColumns = `50px repeat(${buttons.length}, 1fr)`;

        const parts = [];
        parts.push(`<div class="tas-piano-roll-header">FR</div>`);
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            parts.push(`<div class="tas-piano-roll-header" title="${btn}">${btn.substring(0, 2)}</div>`);
        }

        const cacheInterval = window.TASEngine.cacheInterval;
        const stateCache = window.TASEngine.stateCache;
        const inputs = window.TASEngine.inputs;

        for (let f = startFrame; f <= endFrame; f++) {
            const isCurrent = f === currentFrame;
            // Frame 0 and every interval (or any stored cache) count as checkpoints.
            const isCheckpoint = f === 0 || (f > 0 && f % cacheInterval === 0) || stateCache.has(f);

            let rowClasses = 'tas-piano-roll-row';
            if (isCurrent) rowClasses += ' is-current';
            if (isCheckpoint) rowClasses += ' is-checkpoint';

            parts.push(`<div class="${rowClasses}" data-frame="${f}">`);
            parts.push(
                `<div class="tas-piano-roll-cell text-xxs font-monospace text-muted cursor-pointer" onclick="window.TASEngineUI.onRowClick(${f})">${f}</div>`
            );

            const frameInput = inputs[f] || {};
            for (let i = 0; i < buttons.length; i++) {
                const key = window.TASEngine.mapButtonIdToKey(buttons[i]);
                const checked = key ? !!frameInput[key] : false;
                parts.push(
                    `<div class="tas-piano-roll-cell">` +
                    `<input type="checkbox" class="tas-input-checkbox" data-key="${key}" ` +
                    `${checked ? 'checked' : ''} ` +
                    `onchange="window.TASEngineUI.onCheckboxChange(${f}, '${key}', this.checked)">` +
                    `</div>`
                );
            }
            parts.push(`</div>`);
        }

        this.grid.innerHTML = parts.join('');
    },

    updateCurrentRowCheckboxes(buttons, currentFrame) {
        const row = this.grid.querySelector(`.tas-piano-roll-row[data-frame="${currentFrame}"]`);
        if (!row) {
            this.renderPianoRoll(true);
            return;
        }

        const frameInput = window.TASEngine.inputs[currentFrame] || {};
        const checks = row.querySelectorAll('input.tas-input-checkbox');
        for (let i = 0; i < checks.length; i++) {
            const checkbox = checks[i];
            const key = checkbox.dataset.key || window.TASEngine.mapButtonIdToKey(buttons[i]);
            checkbox.checked = !!(key && frameInput[key]);
        }
    },

    onRowClick(frameIndex) {
        // Exact frame from piano roll (no snap) — still stays paused after seek.
        window.TASEngine.scrubToFrame(frameIndex, { snap: false });
        this.syncTransportButtons();
        this.updateTimelineUI();
        this.renderPianoRoll(true);
    },

    onCheckboxChange(frameIndex, key, checked) {
        if (!window.TASEngine.inputs[frameIndex]) {
            window.TASEngine.inputs[frameIndex] = {};
        }

        if (checked) {
            window.TASEngine.inputs[frameIndex][key] = true;
        } else {
            delete window.TASEngine.inputs[frameIndex][key];
        }

        this.updateTimelineUI();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'isLoaded');
    const originalSet = descriptor ? descriptor.set : null;
    const originalGet = descriptor ? descriptor.get : null;

    let fallbackVal = window.isLoaded;

    Object.defineProperty(window, 'isLoaded', {
        get() {
            return originalGet ? originalGet() : fallbackVal;
        },
        set(val) {
            if (originalSet) {
                originalSet(val);
            } else {
                fallbackVal = val;
            }
            window.TASEngineUI.onEmulatorLoadStateChanged(val);
        },
        configurable: true
    });

    // Restore snapshot interval / max-keep before any TAS use (per-system IDB).
    window.TASEngine.loadSnapshotSettings().then((ok) => {
        window.TASEngineUI.syncSnapshotSettingsUI();
        if (ok) {
            console.log(
                `[TAS] Snapshot settings from IDB: interval=${window.TASEngine.cacheInterval}, ` +
                `maxKeep=${window.TASEngine.maxCacheEntries} (+1 frame 0)`
            );
        }
    });
});

/** True when the focused element is a text field (TAS hotkeys must not steal typing). */
function tasIsTypingTarget(el) {
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
        const t = (el.type || 'text').toLowerCase();
        // Allow hotkeys when focus is on piano-roll checkboxes / range slider.
        return t !== 'checkbox' && t !== 'radio' && t !== 'range' &&
            t !== 'button' && t !== 'submit' && t !== 'reset' && t !== 'file';
    }
    return false;
}

window.addEventListener('keydown', (event) => {
    if (!window.isLoaded || tasIsTypingTarget(document.activeElement)) {
        return;
    }

    if (event.code === 'Space') {
        // Always prevent page scroll; only drive TAS when in REC/playback context.
        event.preventDefault();
        if (!event.repeat) {
            // Ctrl/Meta+Space = play movie from frame 0 (needs a run / will init).
            // Bare Space = live-REC pause/resume, or movie play/pause (see toggleTransport).
            if (event.ctrlKey || event.metaKey) {
                window.TASEngineUI.playFromStart();
            } else {
                window.TASEngineUI.togglePlay();
            }
        }
    } else if (event.code === 'Home') {
        event.preventDefault();
        if (!event.repeat) {
            window.TASEngineUI.playFromStart();
        }
    } else if (event.code === 'KeyF') {
        // Ignore OS key-repeat: held F must not storm multi-frame steps.
        event.preventDefault();
        if (!event.repeat) {
            window.TASEngineUI.stepFrame();
        }
    } else if (event.code === 'KeyR') {
        event.preventDefault();
        if (!event.repeat) {
            window.TASEngineUI.toggleRecord();
        }
    } else if (event.code === 'BracketLeft' || event.code === 'Comma') {
        // [ or , → previous checkpoint (rerecord rewind)
        event.preventDefault();
        if (!event.repeat) {
            window.TASEngineUI.prevCheckpoint();
        }
    } else if (event.code === 'BracketRight' || event.code === 'Period') {
        // ] or . → next checkpoint
        event.preventDefault();
        if (!event.repeat) {
            window.TASEngineUI.nextCheckpoint();
        }
    }
});
