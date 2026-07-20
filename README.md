# WASM Emu Dashboard

A web-based retro gaming suite running NES, SNES, and Sega Genesis/Mega Drive emulators inside your browser. High-performance C/C++ emulator cores are compiled to WebAssembly (Emscripten) and driven by a lightweight vanilla JavaScript frontend.

---

## 🚀 Features

- **WebAssembly Power**: Emulation cores compiled to WASM for native-like performance directly in modern browsers.
- **Vanilla JavaScript Frontend**: Clean, bundler-less frontend implementation using responsive Bootstrap 5 styling.
- **IndexedDB ROM Library**: Save and manage your retro game collection locally within your browser.
- **Save States**: Integrated state saving (up to 10 slots per game) using gzip-compressed WASM memory snapshots stored in IndexedDB.
- **TAS Piano Roll** (Tool-Assisted Speedrun style tools for NES, SNES, and Genesis):
  - **Live REC** (~60 fps) captures held controller input while the movie advances.
  - **Frame step (F)** for frame-perfect polish; pauses live capture while REC stays armed.
  - **Play / Play from start** replays the input log with TAS-driven single-frame steps (emulator free-run stays off).
  - **Timeline scrub** and **checkpoint navigation** (`« CP` / `» CP`, hotkeys `[` `]` or `,` `.`) land on green-zone savestates (~every 60 frames).
  - **Rerecord workflow**: scrub or step back while REC is on → transport stays **paused** so you can aim; later checkpoints remain until you **commit overwrite** (Space / live resume / frame-step). Then the future branch is truncated.
  - **Clear** wipes the piano roll and all TAS checkpoints and re-pins the live core as frame 0.
  - **Import / Export** movie JSON (system id, ROM name, frame list).
- **Cheats Manager** (Game Genie + hex patches for NES, SNES, and Genesis):
  - Popup widget stores per-game codes in IndexedDB and applies them to the running WASM core.
  - **Game Genie** codes are decoded automatically per system (NES 6/8-letter, SNES/MD 8-character).
  - **Hex patches** via `ADDR:VAL` or `ADDR:VAL:COMPARE` (compare used on NES).
  - Enabled cheats are **re-applied automatically** when the same ROM is loaded again.
  - See [Cheats](#-cheats) for formats and Pro Action Replay notes.
- **Advanced Emulation Tools**:
  - Live **CHR/Sprite Viewer** and Palette inspector widgets for debugging graphics.
  - **Code/Data Logger (CDL)** exporter to capture executed game paths (NES support included).
  - Custom gamepad profiling.

---

## 🎮 TAS quick reference

| Action | UI / key | Notes |
|--------|----------|--------|
| Toggle live record | **REC** / `R` | Pins state at the cursor; starts ~60 fps capture |
| Pause / resume transport | **Play** / `Space` | With REC on: pauses or resumes **overwrite** from the cursor |
| Frame advance | **Step** / `F` | One frame; if REC is on, overwrites that frame |
| Play movie | **Play** (REC off) | Replays the log from the current frame |
| Play from start | **▶0** / Home or Ctrl+Space | Seeks to movie frame 0, then plays |
| Previous checkpoint | **« CP** / `[` or `,` | Stays paused; does not discard later CPs |
| Next checkpoint | **» CP** / `]` or `.` | Jumps to the next cached green zone |
| Clear roll + CPs | **Clear** (title bar) | Confirms first; re-pins current emulator state as frame 0 |
| Import / Export | **Import** / **Export** | JSON movie file |

**Rerecord tip:** record a segment → `« CP` (or scrub) to an earlier green zone → aim while paused → `Space` (or `F`) to overwrite from that point. Until you resume write, `» CP` still walks the old path.

---

## 🕹️ Cheats

Open **Cheats** from the main menu while a game is running. Codes are stored per system + ROM name and applied through each core’s `_add_cheat` / `_clear_cheats` exports (`js/cheats-engine.js` + `widgets/cheats/`).

### Supported formats

| Input | Systems | Notes |
|-------|---------|--------|
| **Game Genie** (letters, optional hyphens) | NES, SNES, MD | Decoded by `systemId` |
| **Hex** `ADDR:VAL` | All | e.g. `00A4:FF` |
| **Hex** `ADDR:VAL:COMPARE` | NES (compare) | Only replace when the original byte matches |

**Game Genie examples**

| System | Length | Example |
|--------|--------|---------|
| NES | 6 or 8 letters | `SXIOPO`, `GOSSIP`, `ZEXPYGLA` |
| SNES | 8 chars (`XXXX-XXXX`) | `C28A-6D0F` |
| Genesis / Mega Drive | 8 chars (`XXXX-XXXX`) | `REVT-AA8W` |

Hyphens are ignored (`REVT-AA8W` ≡ `REVTAA8W`).

### How codes are applied

| System | Core behavior |
|--------|----------------|
| **NES** | Intercept CPU reads at the decoded address (classic Game Genie style, including 8-letter compare). |
| **SNES** | Write through Snes9x’s cheat list (`S9xAddCheat` / `S9xDeleteCheats`). |
| **MD** | Patch 16-bit words in cartridge ROM (Game Genie word patches). |

### Pro Action Replay

**Not auto-detected** as a separate format. Compact PAR strings (e.g. SNES `7E0A4A63`) are **not** decoded as Action Replay — they would be misread as Game Genie.

To use PAR-style RAM/ROM patches today, enter them as hex:

```text
7E0A4A:63
```

(Address and value separated by `:`.)

### Tips

1. Load the ROM first, then open the Cheats widget (or rely on auto-apply after a previous save).
2. Toggle **Enabled** or save a code to push the list into the emulator immediately.
3. Use a code for the **same ROM region/version** the game expects (USA vs Europe often differ).
4. Invalid codes are rejected on save; the status bar reports how many cheats were applied.

---

## 🛠️ Supported Systems

| System | Page | systemId | Core |
|--------|------|----------|------|
| **NES** | `index.html?system=nes` | `nes` | Custom / Nestopia-family WASM core |
| **SNES** | `index.html?system=snes` | `snes` | Snes9x (WASM) |
| **Genesis / Mega Drive** | `index.html?system=md` | `md` | Genesis Plus GX (WASM) |

All three systems share the same dashboard shell (library, save states, TAS piano roll, debug widgets where applicable).

---

## 💻 How to Build & Run

### 1. Prerequisite: Emscripten SDK (OPTIONAL)
Install Emscripten to compile the C/C++ emulation cores into WebAssembly:

See the [INSTALL](INSTALL) 

### 2. Compile Emulator Cores (OPTIONAL)
Compile the source code of the emulators into WebAssembly binary files:

```bash
# Compile all cores
./bin/compile.sh
```

### 3. Run Dev Server
Serve the static dashboard with any static file server (examples):

```bash
# Python
python3 -m http.server 8080

# Or PHP (still works for static files)
php -S localhost:8080
```

Access the dashboard pages in your browser:
* **NES**: `http://localhost:8080/index.html?system=nes` (default)
* **SNES**: `http://localhost:8080/index.html?system=snes`
* **Genesis**: `http://localhost:8080/index.html?system=md`

### 4. Compile Compact View Stylesheets (SASS) (OPTIONAL)
If you modify stylesheet files in the `scss/new` folder, recompile the stylesheet into the `build` directory:

```bash
node build-styles.mjs
```

---

## 📄 License & Attribution

This project is published under a **split licensing model**:

- **Frontend / Original Logic**: Licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
- **Emulator Cores (`src/`)**: Belong to their respective owners. Note that the **SNES (Snes9x)** and **Genesis (Genesis Plus GX)** cores are subject to strict **non-commercial, personal use only** licenses.

---

## 🌐 Connect with Me

Stay updated with my projects, coding sessions, and videos:

- **YouTube**: [tcviana](https://www.youtube.com/tcviana)
- **X (formerly Twitter)**: [@haeretici](https://x.com/haeretici)

---

## 💖 Support the Project (Crypto Donations)

If you find this project useful and would like to support its development, you can make a cryptocurrency donation to the following addresses:

* **BNB Chain / Ethereum / Polygon / OP / Linea / Base / Arbitrum (EVM)**:  
  `0xfE5Fc67Fe92234cB079B521EC7f9ad9c23da2AA8`

* **Solana (SOL)**:  
  `EjPqM1cX5nhkqdb7GK7z5aF9ayRswPUwPd5VnVP1PVVL`

* **Tron (TRX)**:  
  `TP3Ncy8RVYKJPkVBbrrMD8WsDmPkRCLArG`

* **Bitcoin (BTC)**:  
  `bc1qqk5s3rmvxe3mlhtzr07xnp44ap6yu95ksva703`
