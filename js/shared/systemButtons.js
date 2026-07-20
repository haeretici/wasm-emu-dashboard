/**
 * Per-system controller button definitions and default profiles.
 * Mask values match the emulator input modules for future integration.
 */
window.SystemButtonMaps = {
    nes: {
        maxPorts: 2,
        buttons: [
            { id: 'A',      mask: 0x01, label: 'A' },
            { id: 'B',      mask: 0x02, label: 'B' },
            { id: 'SELECT', mask: 0x04, label: 'Select' },
            { id: 'START',  mask: 0x08, label: 'Start' },
            { id: 'UP',     mask: 0x10, label: 'Up' },
            { id: 'DOWN',   mask: 0x20, label: 'Down' },
            { id: 'LEFT',   mask: 0x40, label: 'Left' },
            { id: 'RIGHT',  mask: 0x80, label: 'Right' },
        ],
        defaultProfiles: [
            {
                name: 'Keyboard Player 1',
                port: 1,
                deviceType: 'keyboard',
                bindings: {
                    A:      { type: 'keyboard', code: 'KeyK' },
                    B:      { type: 'keyboard', code: 'KeyJ' },
                    SELECT: { type: 'keyboard', code: 'ShiftLeft' },
                    START:  { type: 'keyboard', code: 'Enter' },
                    UP:     { type: 'keyboard', code: 'KeyW' },
                    DOWN:   { type: 'keyboard', code: 'KeyS' },
                    LEFT:   { type: 'keyboard', code: 'KeyA' },
                    RIGHT:  { type: 'keyboard', code: 'KeyD' },
                },
            },
            {
                name: 'Keyboard Player 2',
                port: 2,
                deviceType: 'keyboard',
                bindings: {
                    A:      { type: 'keyboard', code: 'Numpad3' },
                    B:      { type: 'keyboard', code: 'Numpad2' },
                    SELECT: { type: 'keyboard', code: 'Numpad0' },
                    START:  { type: 'keyboard', code: 'NumpadEnter' },
                    UP:     { type: 'keyboard', code: 'ArrowUp' },
                    DOWN:   { type: 'keyboard', code: 'ArrowDown' },
                    LEFT:   { type: 'keyboard', code: 'ArrowLeft' },
                    RIGHT:  { type: 'keyboard', code: 'ArrowRight' },
                },
            },
        ],
    },

    md: {
        maxPorts: 2,
        buttons: [
            { id: 'UP',    mask: 0x0001, label: 'Up' },
            { id: 'DOWN',  mask: 0x0002, label: 'Down' },
            { id: 'LEFT',  mask: 0x0004, label: 'Left' },
            { id: 'RIGHT', mask: 0x0008, label: 'Right' },
            { id: 'B',     mask: 0x0010, label: 'B' },
            { id: 'C',     mask: 0x0020, label: 'C' },
            { id: 'A',     mask: 0x0040, label: 'A' },
            { id: 'START', mask: 0x0080, label: 'Start' },
            { id: 'Z',     mask: 0x0100, label: 'Z' },
            { id: 'Y',     mask: 0x0200, label: 'Y' },
            { id: 'X',     mask: 0x0400, label: 'X' },
            { id: 'MODE',  mask: 0x0800, label: 'Mode' },
        ],
        defaultProfiles: [
            {
                name: 'Keyboard Player 1',
                port: 1,
                deviceType: 'keyboard',
                bindings: {
                    UP:    { type: 'keyboard', code: 'KeyW' },
                    DOWN:  { type: 'keyboard', code: 'KeyS' },
                    LEFT:  { type: 'keyboard', code: 'KeyA' },
                    RIGHT: { type: 'keyboard', code: 'KeyD' },
                    A:     { type: 'keyboard', code: 'Numpad1' },
                    B:     { type: 'keyboard', code: 'Numpad2' },
                    C:     { type: 'keyboard', code: 'Numpad3' },
                    X:     { type: 'keyboard', code: 'Numpad4' },
                    Y:     { type: 'keyboard', code: 'Numpad5' },
                    Z:     { type: 'keyboard', code: 'Numpad6' },
                    START: { type: 'keyboard', code: 'Numpad0' },
                },
            },
        ],
    },

    snes: {
        maxPorts: 2,
        buttons: [
            { id: 'B',      bit: 15, label: 'B' },
            { id: 'Y',      bit: 14, label: 'Y' },
            { id: 'SELECT', bit: 13, label: 'Select' },
            { id: 'START',  bit: 12, label: 'Start' },
            { id: 'UP',     bit: 11, label: 'Up' },
            { id: 'DOWN',   bit: 10, label: 'Down' },
            { id: 'LEFT',   bit: 9,  label: 'Left' },
            { id: 'RIGHT',  bit: 8,  label: 'Right' },
            { id: 'A',      bit: 7,  label: 'A' },
            { id: 'X',      bit: 6,  label: 'X' },
            { id: 'L',      bit: 5,  label: 'L' },
            { id: 'R',      bit: 4,  label: 'R' },
        ],
        defaultProfiles: [
            {
                name: 'Keyboard Player 1',
                port: 1,
                deviceType: 'keyboard',
                bindings: {
                    RIGHT:  { type: 'keyboard', code: 'ArrowRight' },
                    LEFT:   { type: 'keyboard', code: 'ArrowLeft' },
                    DOWN:   { type: 'keyboard', code: 'ArrowDown' },
                    UP:     { type: 'keyboard', code: 'ArrowUp' },
                    A:      { type: 'keyboard', code: 'KeyA' },
                    B:      { type: 'keyboard', code: 'KeyZ' },
                    X:      { type: 'keyboard', code: 'KeyX' },
                    Y:      { type: 'keyboard', code: 'KeyS' },
                    L:      { type: 'keyboard', code: 'KeyD' },
                    R:      { type: 'keyboard', code: 'KeyC' },
                    START:  { type: 'keyboard', code: 'Enter' },
                    SELECT: { type: 'keyboard', code: 'ShiftLeft' },
                },
            },
        ],
    },

    sms: {
        maxPorts: 2,
        buttons: [
            { id: '1',     mask: 0x10, label: 'Button 1' },
            { id: '2',     mask: 0x20, label: 'Button 2' },
            { id: 'UP',    mask: 0x01, label: 'Up' },
            { id: 'DOWN',  mask: 0x02, label: 'Down' },
            { id: 'LEFT',  mask: 0x04, label: 'Left' },
            { id: 'RIGHT', mask: 0x08, label: 'Right' },
        ],
        defaultProfiles: [
            {
                name: 'Keyboard Player 1',
                port: 1,
                deviceType: 'keyboard',
                bindings: {
                    '1':     { type: 'keyboard', code: 'KeyZ' },
                    '2':     { type: 'keyboard', code: 'KeyX' },
                    UP:      { type: 'keyboard', code: 'ArrowUp' },
                    DOWN:    { type: 'keyboard', code: 'ArrowDown' },
                    LEFT:    { type: 'keyboard', code: 'ArrowLeft' },
                    RIGHT:   { type: 'keyboard', code: 'ArrowRight' },
                },
            },
        ],
    },

    gb: {
        maxPorts: 2,
        buttons: [
            { id: 'A',      mask: 0x01, label: 'A' },
            { id: 'B',      mask: 0x02, label: 'B' },
            { id: 'SELECT', mask: 0x04, label: 'Select' },
            { id: 'START',  mask: 0x08, label: 'Start' },
            { id: 'UP',     mask: 0x10, label: 'Up' },
            { id: 'DOWN',   mask: 0x20, label: 'Down' },
            { id: 'LEFT',   mask: 0x40, label: 'Left' },
            { id: 'RIGHT',  mask: 0x80, label: 'Right' },
        ],
        defaultProfiles: [
            {
                name: 'Keyboard Player 1',
                port: 1,
                deviceType: 'keyboard',
                bindings: {
                    A:      { type: 'keyboard', code: 'KeyZ' },
                    B:      { type: 'keyboard', code: 'KeyX' },
                    SELECT: { type: 'keyboard', code: 'ShiftLeft' },
                    START:  { type: 'keyboard', code: 'Enter' },
                    UP:     { type: 'keyboard', code: 'ArrowUp' },
                    DOWN:   { type: 'keyboard', code: 'ArrowDown' },
                    LEFT:   { type: 'keyboard', code: 'ArrowLeft' },
                    RIGHT:  { type: 'keyboard', code: 'ArrowRight' },
                },
            },
        ],
    },
};