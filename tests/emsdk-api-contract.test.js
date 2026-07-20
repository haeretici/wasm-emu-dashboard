#!/usr/bin/env node
/**
 * Contract test: JS call sites for the shared EMSDK surface must resolve to
 * exports present in the shipped platform glue (js/md/genesis.js, js/nes/core.js, js/snes/core.js).
 *
 * Loads real modularized WASM modules and checks typeof on exported functions.
 * Does not hard-code pointer values or re-implement the C side.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const GLUE = {
  md: {
    js: path.join(ROOT, 'js/md/genesis.js'),
    factory: 'createMDModule',
  },
  nes: {
    js: path.join(ROOT, 'js/nes/core.js'),
    factory: 'createNesModule',
  },
  snes: {
    js: path.join(ROOT, 'js/snes/core.js'),
    factory: 'createSnesModule',
  },
};

/** Core standardized surface every platform must export after the rename. */
const SHARED_CORE_EXPORTS = [
  'init_emulator',
  'run_frame',
  'get_screen_buffer_ptr',
  'get_screen_width',
  'get_screen_height',
  'set_controller_state',
  'save_state',
  'load_state',
  'get_save_state_size',
  'pause_emulator',
  'resume_emulator',
];

/** Platform-specific exports required by current JS call sites. */
const PLATFORM_EXTRA = {
  md: ['get_active_palette_ptr', 'my_malloc', 'my_free'],
  nes: ['get_emulator_instance_ptr', 'my_malloc', 'my_free', 'get_active_palette_ptr'],
  snes: ['get_audio_buffer_ptr', 'get_active_palette_ptr', 'my_malloc', 'my_free'],
};

/** Stale pre-rename symbols that must not remain as primary call sites in JS. */
const STALE_CALL_PATTERNS = [
  /\._getScreenBuffer\s*\(/,
  /\._getBufferWidth\s*\(/,
  /\._getBufferHeight\s*\(/,
  /\._startWithRom\s*\(/,
  /\._saveState\s*\(/,
  /\._loadState\s*\(/,
  /\._getStateSaveSize\s*\(/,
  /\._setJoypadInput\s*\(/,
  /\._setJoypadInput2\s*\(/,
  /\._set_controller_button\s*\(/,
  /\._mainLoop\s*\(/,
  /\._tick_frame\s*\(/,
  /\._main_loop_iterator\s*\(/,
  /\._getSoundBuffer\s*\(/,
];

const JS_SCAN_GLOBS = [
  'js/tas.js',
  'js/shared/emulatorRuntime.js',
  'js/md/app.js',
  'js/nes/app.js',
  'js/snes/app.js',
  'js/snes/apu.js',
  'js/snes/palette.js',
  'js/savestate.js',
  'js/shared/input.js',
  'widgets/chr-viewer/spriteViewer.js',
  'widgets/chr-viewer/palette.js',
];

function extractExportsFromGlueText(gluePath) {
  const text = fs.readFileSync(gluePath, 'utf8');
  const found = new Set();
  const re = /_([a-zA-Z][a-zA-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    found.add(m[1]);
  }
  return found;
}

function scanStatic() {
  const failures = [];
  const matrix = {};

  for (const [platform, cfg] of Object.entries(GLUE)) {
    if (!fs.existsSync(cfg.js)) {
      failures.push(`missing glue: ${cfg.js}`);
      continue;
    }
    const exports = extractExportsFromGlueText(cfg.js);
    matrix[platform] = { path: path.relative(ROOT, cfg.js), shared: {}, extra: {} };

    for (const name of SHARED_CORE_EXPORTS) {
      const ok = exports.has(name);
      matrix[platform].shared[name] = ok;
      if (!ok) failures.push(`${platform}: missing shared export _${name} in glue text`);
    }
    for (const name of PLATFORM_EXTRA[platform] || []) {
      const ok = exports.has(name);
      matrix[platform].extra[name] = ok;
      if (!ok) failures.push(`${platform}: missing platform export _${name} in glue text`);
    }
  }

  for (const rel of JS_SCAN_GLOBS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`missing scan target: ${rel}`);
      continue;
    }
    const src = fs.readFileSync(abs, 'utf8');
    for (const pat of STALE_CALL_PATTERNS) {
      if (pat.test(src)) {
        failures.push(`${rel}: stale call site matching ${pat}`);
      }
    }
  }

  const tas = fs.readFileSync(path.join(ROOT, 'js/tas.js'), 'utf8');
  if (!/\._run_frame\s*\(/.test(tas)) {
    failures.push('js/tas.js: stepFrame must call _run_frame');
  }
  if (/\._tick_frame\s*\(|\._mainLoop\s*\(|\._main_loop_iterator\s*\(/.test(tas)) {
    failures.push('js/tas.js: still invokes legacy step exports');
  }

  return { failures, matrix };
}

function syntaxCheck() {
  return JS_SCAN_GLOBS.map((rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      return { file: rel, ok: false, err: 'missing' };
    }
    const r = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8' });
    return {
      file: rel,
      ok: r.status === 0,
      err: (r.stderr || r.stdout || '').trim(),
    };
  });
}

/**
 * Instantiate each modularized WASM and assert shared exports are real functions.
 */
async function loadLiveModules() {
  const live = {};
  const failures = [];

  for (const [platform, cfg] of Object.entries(GLUE)) {
    const dir = path.dirname(cfg.js);
    // Clear require cache so repeated runs see rebuilt glue.
    delete require.cache[require.resolve(cfg.js)];
    const factory = require(cfg.js);
    if (typeof factory !== 'function') {
      failures.push(`${platform}: glue did not export factory function`);
      continue;
    }

    let module;
    try {
      module = await factory({
        locateFile: (p) => path.join(dir, p),
        print: () => {},
        printErr: () => {},
      });
    } catch (err) {
      failures.push(`${platform}: failed to instantiate WASM: ${err && err.message ? err.message : err}`);
      continue;
    }

    const entry = { shared: {}, extra: {} };
    for (const name of SHARED_CORE_EXPORTS) {
      const key = `_${name}`;
      const ok = typeof module[key] === 'function';
      entry.shared[name] = ok;
      if (!ok) failures.push(`${platform}: live module missing function ${key}`);
    }
    for (const name of PLATFORM_EXTRA[platform] || []) {
      const key = `_${name}`;
      const ok = typeof module[key] === 'function';
      entry.extra[name] = ok;
      if (!ok) failures.push(`${platform}: live module missing function ${key}`);
    }

    // Behavioral smoke: width/height should be positive ints without ROM (defaults).
    try {
      const w = module._get_screen_width();
      const h = module._get_screen_height();
      entry.screenSize = { w, h };
      if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) {
        failures.push(`${platform}: get_screen_width/height returned non-positive (${w}x${h})`);
      }
    } catch (err) {
      failures.push(`${platform}: get_screen_width/height threw: ${err.message}`);
    }

    // NES buffer may return null without ROM; still must be callable.
    try {
      const ptr = module._get_screen_buffer_ptr();
      entry.bufferPtrType = typeof ptr;
      // number (pointer) or bigint depending on MEMORY64; null/0 is fine pre-ROM
      if (typeof ptr !== 'number' && typeof ptr !== 'bigint') {
        failures.push(`${platform}: get_screen_buffer_ptr returned ${typeof ptr}`);
      }
    } catch (err) {
      failures.push(`${platform}: get_screen_buffer_ptr threw: ${err.message}`);
    }

    // Controller API must be invokable. Skip _run_frame on MD: SDL main-loop
    // may block or exit when no ROM is loaded.
    try {
      module._set_controller_state(0, 0, 0);
      entry.controllerOk = true;
    } catch (err) {
      failures.push(`${platform}: set_controller_state threw: ${err.message}`);
      entry.controllerOk = false;
    }
    if (platform !== 'md') {
      try {
        module._run_frame();
        entry.idleStepOk = true;
      } catch (err) {
        failures.push(`${platform}: idle run_frame threw: ${err.message}`);
        entry.idleStepOk = false;
      }
    } else {
      entry.idleStepOk = 'skipped-md-no-rom';
    }

    live[platform] = entry;
  }

  return { live, failures };
}

async function main() {
  const staticResult = scanStatic();
  const syntax = syntaxCheck();
  const syntaxFails = syntax.filter((s) => !s.ok);
  const liveResult = await loadLiveModules();

  const failures = [...staticResult.failures, ...liveResult.failures];
  if (syntaxFails.length) {
    for (const s of syntaxFails) failures.push(`syntax: ${s.file}: ${s.err}`);
  }

  const report = {
    ok: failures.length === 0,
    matrix: staticResult.matrix,
    live: liveResult.live,
    failures,
    syntax,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
