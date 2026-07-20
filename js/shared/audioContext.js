const AUDIO_ENABLED_STORAGE_KEY = 'romdashboard.audioEnabled';

const AudioContextManager = {
    enabled: true,
    audioCtx: null,
    _userUnlocked: false,
    _gestureUnlocked: false,
    _initCallback: null,
    _overlayEl: null,
    _settingsToggle: null,
    _stateChangeHandler: null,
    init() {
        const stored = localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY);
        this.enabled = stored !== 'false';

        this._setupSettingsToggle();
        this._setupOverlay();
        this._setupGestureTracking();
        this._setupVisibilityHandler();
        this._updateOverlay();
    },

    onNeedInit(callback) {
        this._initCallback = callback;
    },

    isUserUnlocked() {
        return this._userUnlocked || this._gestureUnlocked;
    },

    isEnabled() {
        return this.enabled;
    },

    getOrCreateContext(sampleRate = 44100) {
        if (!this.isEnabled()) return null;

        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return null;

        if (!this.audioCtx) {
            this.audioCtx = new AudioContextCtor({ sampleRate });
        }

        return this.audioCtx;
    },

    unlockFromUserAction() {
        if (!this.isEnabled()) return;

        this._gestureUnlocked = true;
        this._userUnlocked = true;

        this._tryResumeContext();
        this._requestInit();
        this.applyState();
    },

    setEnabled(enabled) {
        this.enabled = enabled;
        localStorage.setItem(AUDIO_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');

        if (this._settingsToggle) {
            this._settingsToggle.checked = enabled;
        }

        if (enabled) {
            this._requestInit();
        }

        this.applyState();
    },

    registerContext(ctx) {
        if (!ctx) return;

        if (!this._stateChangeHandler) {
            this._stateChangeHandler = () => this._onStateChange();
        }

        if (this.audioCtx && this.audioCtx !== ctx) {
            this.audioCtx.removeEventListener('statechange', this._stateChangeHandler);
        }

        this.audioCtx = ctx;
        ctx.addEventListener('statechange', this._stateChangeHandler);

        if (ctx.state === 'running') {
            this._userUnlocked = true;
        } else if (this._gestureUnlocked) {
            this._tryResumeContext();
        }

        this.applyState();
    },

    shouldOutputAudio() {
        return (
            this.isEnabled() &&
            !isPaused &&
            document.visibilityState === 'visible' &&
            this.audioCtx?.state === 'running'
        );
    },

    applyState() {
        const shouldPlay = this.isEnabled() && !isPaused && document.visibilityState === 'visible';

        if (typeof gameModule?._set_audio_playback === 'function') {
            gameModule._set_audio_playback(shouldPlay ? 1 : 0);
        }

        if (!this.audioCtx) {
            this._updateOverlay();
            return;
        }

        const shouldSuspendContext = isPaused || document.visibilityState !== 'visible';

        if (shouldSuspendContext) {
            if (this.audioCtx.state === 'running') {
                this.audioCtx.suspend().catch(() => {});
            }
        } else if (shouldPlay && this.isUserUnlocked() && this.audioCtx.state === 'suspended') {
            this._tryResumeContext();
        }

        this._updateOverlay();
    },

    async resumeFromUserGesture() {
        this.unlockFromUserAction();
    },

    _requestInit() {
        if (!this.isEnabled() || !this._initCallback) return;
        this._initCallback();
    },

    _tryResumeContext() {
        if (!this.audioCtx || this.audioCtx.state !== 'suspended') return;

        this.audioCtx.resume().then(() => {
            if (this.audioCtx?.state === 'running') {
                this._userUnlocked = true;
            }
            this.applyState();
        }).catch(() => {});
    },

    _onStateChange() {
        if (this.audioCtx?.state === 'running') {
            this._userUnlocked = true;
        }
        AudioContextManager._updateOverlay();
    },

    _setupGestureTracking() {
        const onGesture = () => this.unlockFromUserAction();

        document.addEventListener('pointerdown', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
    },

    _setupSettingsToggle() {
        this._settingsToggle = document.getElementById('settingAudioEnabled');
        if (!this._settingsToggle) return;

        this._settingsToggle.checked = this.enabled;
        this._settingsToggle.addEventListener('change', (event) => {
            this.setEnabled(event.target.checked);
        });
    },

    _setupOverlay() {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return;

        let wrapper = canvas.parentElement;
        if (!wrapper?.classList.contains('game-canvas-wrapper')) {
            const newWrapper = document.createElement('div');
            newWrapper.className = 'game-canvas-wrapper position-relative d-inline-block mb-3';
            canvas.parentNode.insertBefore(newWrapper, canvas);
            newWrapper.appendChild(canvas);

            if (canvas.classList.contains('mb-3')) {
                canvas.classList.remove('mb-3');
            }

            wrapper = newWrapper;
        }

        if (document.getElementById('audioResumeOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'audioResumeOverlay';
        overlay.className = 'audio-resume-overlay d-none';
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = '<button type="button" class="audio-resume-overlay__label">Click to enable audio</button>';

        overlay.querySelector('button')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.resumeFromUserGesture();
        });

        wrapper.appendChild(overlay);
        this._overlayEl = overlay;
    },

    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            this.applyState();
        });
    },

    _updateOverlay() {
        if (!this._overlayEl) {
            this._overlayEl = document.getElementById('audioResumeOverlay');
        }
        if (!this._overlayEl) return;

        const shouldPlay = this.isEnabled() && !isPaused && document.visibilityState === 'visible';
        const showOverlay = shouldPlay && this.audioCtx && this.audioCtx.state === 'suspended';

        this._overlayEl.classList.toggle('d-none', !showOverlay);
    }
};

window.AudioContextManager = AudioContextManager;

document.addEventListener('DOMContentLoaded', () => {
    AudioContextManager.init();
});