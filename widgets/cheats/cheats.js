/**
 * Cheats configuration widget
 */

let currentGameName = '';
let currentSystemId = '';
let activeCheats = [];
const CHEATS_STORE = 'cheats_config';
let modalInstance = null;

async function init() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        currentSystemId = urlParams.get('systemId') || 'nes';
        
        // Attempt to get the current game name from the main window
        if (window.opener && window.opener.currentRomName) {
            currentGameName = window.opener.currentRomName;
        } else {
            document.getElementById('statusMessage').textContent = 'Error: No game is currently running.';
            document.getElementById('statusMessage').classList.replace('alert-secondary', 'alert-danger');
            document.getElementById('cheatsList').innerHTML = '<tr><td colspan="5" class="text-center text-muted">No game running</td></tr>';
            return;
        }

        document.getElementById('gameNameDisplay').textContent = currentGameName;
        document.getElementById('statusMessage').textContent = `Loaded game context: ${currentGameName}`;
        setTimeout(() => {
            document.getElementById('statusMessage').style.display = 'none';
        }, 3000);

        modalInstance = new bootstrap.Modal(document.getElementById('cheatModal'));

        // Load cheats from IndexedDB
        await loadCheats();

        // Apply cheats to the emulator core immediately
        applyCheatsToEmulator();

        // Bind events
        document.getElementById('btnAddCheat').addEventListener('click', openAddModal);
        document.getElementById('btnSaveCheat').addEventListener('click', saveCheatForm);

    } catch (e) {
        console.error(e);
        document.getElementById('statusMessage').textContent = 'Error loading cheats.';
        document.getElementById('statusMessage').classList.replace('alert-secondary', 'alert-danger');
    }
}

async function loadCheats() {
    const key = `cheats_${currentSystemId}_${currentGameName}`;
    const data = await idbGet(key, CHEATS_STORE, currentSystemId);
    if (data) {
        activeCheats = data;
    } else {
        activeCheats = [];
    }
    renderTable();
}

async function saveCheatsDB() {
    const key = `cheats_${currentSystemId}_${currentGameName}`;
    await idbSet(key, activeCheats, CHEATS_STORE, currentSystemId);
    applyCheatsToEmulator();
}

function renderTable() {
    const tbody = document.getElementById('cheatsList');
    tbody.innerHTML = '';
    
    if (activeCheats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No cheats added yet.</td></tr>';
        return;
    }

    activeCheats.forEach((cheat, index) => {
        const tr = document.createElement('tr');
        
        const tdIdx = document.createElement('td');
        tdIdx.textContent = index + 1;
        tr.appendChild(tdIdx);

        const tdDesc = document.createElement('td');
        tdDesc.textContent = cheat.description || 'Unknown Cheat';
        tr.appendChild(tdDesc);

        const tdCode = document.createElement('td');
        tdCode.textContent = cheat.code;
        tr.appendChild(tdCode);

        const tdStatus = document.createElement('td');
        const switchWrap = document.createElement('div');
        switchWrap.className = 'form-check form-switch';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'form-check-input';
        cb.checked = cheat.enabled;
        cb.addEventListener('change', async () => {
            activeCheats[index].enabled = cb.checked;
            await saveCheatsDB();
        });
        switchWrap.appendChild(cb);
        tdStatus.appendChild(switchWrap);
        tr.appendChild(tdStatus);

        const tdActions = document.createElement('td');
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-xs btn-outline-info me-1';
        btnEdit.textContent = 'Edit';
        btnEdit.addEventListener('click', () => openEditModal(index));
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn btn-xs btn-outline-danger';
        btnDelete.textContent = 'Del';
        btnDelete.addEventListener('click', async () => {
            if (confirm('Delete this cheat?')) {
                activeCheats.splice(index, 1);
                await saveCheatsDB();
                renderTable();
            }
        });

        tdActions.appendChild(btnEdit);
        tdActions.appendChild(btnDelete);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

function openAddModal() {
    document.getElementById('cheatModalTitle').textContent = 'Add Cheat';
    document.getElementById('cheatDescription').value = '';
    document.getElementById('cheatCode').value = '';
    document.getElementById('cheatEnabled').checked = true;
    document.getElementById('cheatIndex').value = -1;
    modalInstance.show();
}

function openEditModal(index) {
    const cheat = activeCheats[index];
    document.getElementById('cheatModalTitle').textContent = 'Edit Cheat';
    document.getElementById('cheatDescription').value = cheat.description;
    document.getElementById('cheatCode').value = cheat.code;
    document.getElementById('cheatEnabled').checked = cheat.enabled;
    document.getElementById('cheatIndex').value = index;
    modalInstance.show();
}

async function saveCheatForm() {
    const desc = document.getElementById('cheatDescription').value.trim();
    const code = document.getElementById('cheatCode').value.trim();
    const enabled = document.getElementById('cheatEnabled').checked;
    const index = parseInt(document.getElementById('cheatIndex').value, 10);

    if (!code) {
        alert('Code cannot be empty');
        return;
    }

    if (typeof parseCheatCodeForSystem === 'function' && !parseCheatCodeForSystem(code, currentSystemId)) {
        alert('Invalid cheat code for this system. Use Game Genie letters or ADDR:VAL hex form.');
        return;
    }

    const cheat = { description: desc, code, enabled };
    
    if (index === -1) {
        activeCheats.push(cheat);
    } else {
        activeCheats[index] = cheat;
    }

    await saveCheatsDB();
    renderTable();
    modalInstance.hide();
}

function setStatus(message, kind) {
    const el = document.getElementById('statusMessage');
    if (!el) return;
    el.style.display = '';
    el.textContent = message;
    el.classList.remove('alert-secondary', 'alert-danger', 'alert-success', 'alert-warning');
    el.classList.add(kind || 'alert-secondary');
}

function applyCheatsToEmulator() {
    if (!window.opener || !window.opener.gameModule) {
        setStatus('Cannot apply cheats: main emulator window is not available.', 'alert-danger');
        return { applied: 0, failed: 0, unsupported: true };
    }

    if (typeof applyCheatListToModule !== 'function') {
        setStatus('Cheat engine script is missing.', 'alert-danger');
        return { applied: 0, failed: 0, unsupported: true };
    }

    try {
        const result = applyCheatListToModule(window.opener.gameModule, activeCheats, currentSystemId);

        if (result.unsupported) {
            setStatus('This system core does not expose cheat APIs yet. Rebuild the emulator cores.', 'alert-warning');
            return result;
        }

        if (result.failed > 0) {
            setStatus(`Applied ${result.applied} cheat(s); ${result.failed} invalid code(s) skipped.`, 'alert-warning');
        } else {
            setStatus(`Applied ${result.applied} cheat(s) to the emulator.`, 'alert-success');
        }
        setTimeout(() => {
            const el = document.getElementById('statusMessage');
            if (el) el.style.display = 'none';
        }, 3500);

        return result;
    } catch (e) {
        console.warn('Failed to apply cheats to emulator:', e);
        setStatus('Failed to apply cheats to emulator (see console).', 'alert-danger');
        return { applied: 0, failed: 0, unsupported: false, error: e };
    }
}

window.addEventListener('DOMContentLoaded', init);
