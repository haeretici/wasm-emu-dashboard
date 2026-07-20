/**
 * Shared input handler – loads per-system gamepad profiles from IndexedDB
 * and routes keyboard / gamepad events to the active emulator core.
 *
 * Hot-path rules (runs every key edge / rAF poll):
 * - No options-object literals on dispatch
 * - No per-frame string allocation for gamepad state keys
 * - Reuse scratch objects; bind the poll callback once
 * - heldButtonIds is a single Set (max ~12 entries) – zero GC on add/delete
 */

const INPUT_IDB_KEY = 'gamepad_profiles_v1';
const INPUT_CONFIG_VERSION = 1;
const INPUT_IDB_STORE = 'gamepad_config';

// SNES on-screen soft-pad support (used by test harnesses)
window.softPadInput = window.softPadInput || 0;

const InputManager = {
    systemId: null,
    profiles: [],
    keyboardMap: {},
    gamepadBindingEntries: [],
    /** @type {Map<string, boolean>} precomputed stateKey -> pressed */
    prevGamepadState: new Map(),
    snesKeyboardBitsByPort: { 1: 0, 2: 0 },
    snesGamepadBitsByPort: { 1: 0, 2: 0 },
    // Reused scratch for SNES gamepad bit computation (never reassigned as current state).
    _snesGpBitsScratch: { 1: 0, 2: 0 },
    /** @type {Object.<string, object>|null} buttonId -> def, rebuilt with maps */
    buttonDefById: null,
    pollRafId: null,
    _boundPoll: null,
    // Optional TAS (or other) listener. Null when unused = zero call overhead.
    onButtonEdge: null,
    // Port-1 buttons currently held. One Set for the session; add/delete allocate nothing.
    heldButtonIds: new Set(),

    portToDeviceIndex(port) {
        if (this.systemId === 'md') {
            return port === 2 ? 4 : 0;
        }
        return port - 1;
    },

    /**
     * Track port-1 held buttons for TAS frame carry-over / piano roll.
     * Cheap: Set ops on at most one entry per edge, no allocations.
     */
    setHeldButton(port, buttonId, pressed) {
        if (port !== 1 || !buttonId) return;
        if (pressed) {
            this.heldButtonIds.add(buttonId);
        } else {
            this.heldButtonIds.delete(buttonId);
        }
    },

    /**
     * Single entry-point for keyboard/gamepad button edges.
     * @param {boolean} [applyCore=true] write to emulator core
     */
    dispatchButton(port, buttonId, pressed, applyCore) {
        this.setHeldButton(port, buttonId, pressed);

        // Direct null check — no typeof, no options object.
        const edge = this.onButtonEdge;
        if (edge !== null) {
            edge(port, buttonId, pressed);
        }

        if (applyCore !== false) {
            this.applyInput(port, buttonId, pressed);
        }
    },

    async loadProfiles() {
        const map = window.SystemButtonMaps?.[this.systemId];
        try {
            const data = await idbGet(INPUT_IDB_KEY, INPUT_IDB_STORE);
            if (data && data.version === INPUT_CONFIG_VERSION && Array.isArray(data.profiles)) {
                this.profiles = data.profiles;
                return;
            }
        } catch (e) {
            console.warn('[Input] Failed to load profiles from IndexedDB, using defaults.', e);
        }

        this.profiles = (map?.defaultProfiles || []).map((def) => ({
            id: generateUUID(),
            name: def.name,
            port: def.port,
            deviceType: def.deviceType,
            gamepadIndex: 0,
            bindings: { ...def.bindings },
        }));
    },

    buildMaps() {
        this.keyboardMap = {};
        this.gamepadBindingEntries = [];
        this.prevGamepadState.clear();
        this.heldButtonIds.clear();
        this.snesKeyboardBitsByPort[1] = 0;
        this.snesKeyboardBitsByPort[2] = 0;
        this.snesGamepadBitsByPort[1] = 0;
        this.snesGamepadBitsByPort[2] = 0;

        // O(1) button lookup on every applyInput / poll edge.
        this.buttonDefById = Object.create(null);
        const sysMap = window.SystemButtonMaps?.[this.systemId];
        if (sysMap?.buttons) {
            for (let i = 0; i < sysMap.buttons.length; i++) {
                const btn = sysMap.buttons[i];
                this.buttonDefById[btn.id] = btn;
            }
        }

        for (let p = 0; p < this.profiles.length; p++) {
            const profile = this.profiles[p];
            const port = profile.port;
            const bindings = profile.bindings;
            if (!bindings) continue;

            for (const buttonId in bindings) {
                if (!Object.prototype.hasOwnProperty.call(bindings, buttonId)) continue;
                const binding = bindings[buttonId];
                if (!binding) continue;

                if (binding.type === 'keyboard') {
                    let list = this.keyboardMap[binding.code];
                    if (!list) {
                        list = [];
                        this.keyboardMap[binding.code] = list;
                    }
                    list.push({ port, buttonId });
                } else if (binding.type === 'gamepad_button' || binding.type === 'gamepad_axis') {
                    const gamepadIndex = binding.gamepadIndex ?? profile.gamepadIndex ?? 0;
                    // stateKey allocated once at map-build time, not every poll frame.
                    this.gamepadBindingEntries.push({
                        port,
                        buttonId,
                        binding,
                        gamepadIndex,
                        stateKey: port + ':' + buttonId,
                    });
                }
            }
        }
    },

    getButtonDef(buttonId) {
        if (this.buttonDefById) {
            return this.buttonDefById[buttonId] || null;
        }
        const map = window.SystemButtonMaps?.[this.systemId];
        if (!map) return null;
        for (let i = 0; i < map.buttons.length; i++) {
            if (map.buttons[i].id === buttonId) return map.buttons[i];
        }
        return null;
    },

    applyInput(port, buttonId, pressed) {
        if (!isLoaded || !gameModule) return;

        const btn = this.getButtonDef(buttonId);
        if (!btn) return;

        const player = this.portToDeviceIndex(port);

        switch (this.systemId) {
            case 'nes':
                if (gameModule._set_controller_state) {
                    gameModule._set_controller_state(player, btn.mask, pressed);
                }
                break;

            case 'md':
                if (gameModule._set_controller_state) {
                    gameModule._set_controller_state(player, btn.mask, pressed);
                }
                break;

            case 'snes':
                if (typeof btn.bit === 'number') {
                    const bits = this.snesKeyboardBitsByPort[port] || 0;
                    if (pressed) {
                        this.snesKeyboardBitsByPort[port] = bits | (1 << btn.bit);
                    } else {
                        this.snesKeyboardBitsByPort[port] = bits & ~(1 << btn.bit);
                    }
                    this.flushSnesInput();
                }
                break;

            case 'sms':
            case 'gb':
                if (gameModule._set_controller_state) {
                    gameModule._set_controller_state(player, btn.mask, pressed);
                }
                break;
        }
    },

    getSnesPortBits(port) {
        const keyboardBits = this.snesKeyboardBitsByPort[port] || 0;
        const gamepadBits = this.snesGamepadBitsByPort[port] || 0;
        const softBits = port === 1 ? softPadInput : 0;
        return keyboardBits | softBits | gamepadBits;
    },

    flushSnesInput() {
        if (!gameModule || !gameModule._set_controller_state) return;
        // During TAS movie playback the piano-roll owns joypad bits each frame.
        if (window.TASEngine && window.TASEngine.isPlaying) return;
        gameModule._set_controller_state(0, 0xFFFF, 0);
        gameModule._set_controller_state(1, 0xFFFF, 0);
        gameModule._set_controller_state(0, this.getSnesPortBits(1), 1);
        gameModule._set_controller_state(1, this.getSnesPortBits(2), 1);
    },

    isGamepadButtonPressed(gp, buttonIndex) {
        const button = gp.buttons[buttonIndex];
        if (!button) return false;
        return button.pressed || button.value > 0.5;
    },

    /**
     * @param {object} entry
     * @param {Gamepad[]|null} pads cached from a single getGamepads() call
     */
    isGamepadBindingActive(entry, pads) {
        if (!pads) return false;
        const gp = pads[entry.gamepadIndex];
        if (!gp || !gp.connected) return false;

        const binding = entry.binding;
        if (binding.type === 'gamepad_button') {
            return this.isGamepadButtonPressed(gp, binding.button);
        }

        if (binding.type === 'gamepad_axis') {
            const val = gp.axes[binding.axis] || 0;
            return binding.direction === '+' ? val > 0.6 : val < -0.6;
        }

        return false;
    },

    /**
     * Fill and return the shared scratch object (do not store the reference as state).
     */
    computeSnesGamepadBitsByPort(pads) {
        const bits = this._snesGpBitsScratch;
        bits[1] = 0;
        bits[2] = 0;

        const entries = this.gamepadBindingEntries;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (!this.isGamepadBindingActive(entry, pads)) continue;
            const btn = this.getButtonDef(entry.buttonId);
            if (btn && typeof btn.bit === 'number') {
                bits[entry.port] |= (1 << btn.bit);
            }
        }
        return bits;
    },

    /**
     * Emit press/release edges for SNES gamepad path (core bits are flushed separately).
     */
    syncSnesGamepadEdges(nextBitsByPort) {
        const entries = this.gamepadBindingEntries;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const btn = this.getButtonDef(entry.buttonId);
            if (!btn || typeof btn.bit !== 'number') continue;

            const mask = 1 << btn.bit;
            const pressed = !!(nextBitsByPort[entry.port] & mask);
            const wasPressed = this.prevGamepadState.get(entry.stateKey) || false;

            if (pressed !== wasPressed) {
                this.prevGamepadState.set(entry.stateKey, pressed);
                // applyCore=false: bits already go through flushSnesInput.
                this.dispatchButton(entry.port, entry.buttonId, pressed, false);
            }
        }
    },

    pollGamepads() {
        if (isLoaded) {
            const entries = this.gamepadBindingEntries;
            const n = entries.length;
            if (n > 0) {
                // One getGamepads() per frame — the browser returns a fresh array; we do not copy it.
                const pads = navigator.getGamepads ? navigator.getGamepads() : null;

                if (this.systemId === 'snes') {
                    const next = this.computeSnesGamepadBitsByPort(pads);
                    const cur = this.snesGamepadBitsByPort;
                    if (next[1] !== cur[1] || next[2] !== cur[2]) {
                        this.syncSnesGamepadEdges(next);
                        // Copy values — never alias scratch into current state.
                        cur[1] = next[1];
                        cur[2] = next[2];
                        this.flushSnesInput();
                    }
                } else {
                    for (let i = 0; i < n; i++) {
                        const entry = entries[i];
                        const pressed = this.isGamepadBindingActive(entry, pads);
                        const wasPressed = this.prevGamepadState.get(entry.stateKey) || false;

                        if (pressed !== wasPressed) {
                            this.prevGamepadState.set(entry.stateKey, pressed);
                            this.dispatchButton(entry.port, entry.buttonId, pressed, true);
                        }
                    }
                }
            }
        }

        // Reuse the same bound function — no per-frame arrow allocation.
        this.pollRafId = requestAnimationFrame(this._boundPoll);
    },

    startPolling() {
        if (this.pollRafId !== null) return;
        if (!this._boundPoll) {
            this._boundPoll = () => this.pollGamepads();
        }
        this.pollRafId = requestAnimationFrame(this._boundPoll);
    },
};

// Expose for TAS and other modules (const alone is not on window).
window.InputManager = InputManager;

/**
 * Detect system from ROM filename, load the matching gamepad profile from
 * IndexedDB, and rebuild input bindings. Call when a game is loaded.
 */
async function updateInputProfile(filename) {
    if (!filename || !window.EmuHardwareMap) return;

    const detected = detectSystemFromRom(filename, window.EmuHardwareMap);
    InputManager.systemId = detected.systemId;

    if (!window.GlobalConfiguration) {
        window.GlobalConfiguration = { systemId: null, config: null };
    }
    GlobalConfiguration.systemId = detected.systemId;
    GlobalConfiguration.config = detected.config;

    await InputManager.loadProfiles();
    InputManager.buildMaps();

    console.log(
        `[Input] Active profile for ${detected.config?.name || detected.systemId}` +
        ` (${InputManager.profiles.length} mapping(s))`
    );
}

window.addEventListener('keydown', (event) => {
    if (typeof AudioContextManager !== 'undefined') {
        AudioContextManager.unlockFromUserAction();
    }

    const bindings = InputManager.keyboardMap[event.code];
    if (!bindings || !isLoaded) return;

    // Keep preventDefault on key-repeat so browser shortcuts do not fire mid-hold.
    event.preventDefault();
    // Ignore auto-repeat: held state is already tracked; avoids re-dispatch storms.
    if (event.repeat) return;

    for (let i = 0; i < bindings.length; i++) {
        const binding = bindings[i];
        InputManager.dispatchButton(binding.port, binding.buttonId, true, true);
    }
});

window.addEventListener('keyup', (event) => {
    const bindings = InputManager.keyboardMap[event.code];
    if (!bindings || !isLoaded) return;

    event.preventDefault();
    for (let i = 0; i < bindings.length; i++) {
        const binding = bindings[i];
        InputManager.dispatchButton(binding.port, binding.buttonId, false, true);
    }
});

InputManager.startPolling();
