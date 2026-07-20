window.isLoaded = false;
window.isPaused = false;
window.gameModule = null;
window.originalRomBuffer = null;
window.currentRomName = "";
window.spriteEditors = [];
window.GlobalConfiguration = window.GlobalConfiguration || { systemId: null, config: null };

function getPageSystemId() {
    if (window.PageSystemConfig?.systemId) {
        return window.PageSystemConfig.systemId;
    }
    const fromQuery = new URLSearchParams(location.search).get('system');
    if (fromQuery && /^(nes|snes|md)$/i.test(fromQuery)) {
        return fromQuery.toLowerCase();
    }
    const match = document.body.id?.match(/^([a-z0-9]+)-container$/i);
    return match ? match[1] : null;
}

function initPageSystemConfiguration() {
    const pageSystemId = getPageSystemId();
    if (!pageSystemId) return;

    GlobalConfiguration.systemId = pageSystemId;
    if (window.EmuHardwareMap?.[pageSystemId]) {
        GlobalConfiguration.config = window.EmuHardwareMap[pageSystemId];
    }
}

const pageSystemId = getPageSystemId();
if (pageSystemId) {
    GlobalConfiguration.systemId = pageSystemId;
}
document.addEventListener('DOMContentLoaded', initPageSystemConfiguration);

window.addEventListener('beforeunload', () => {
    spriteEditors.forEach(tab => {
        if (!tab.closed) {
            tab.close(); // Programmatically close the child tabs
        }
    });
});

async function initSpriteEditorsPalletes() {
    // Filter out closed windows before sending updates
    spriteEditors = spriteEditors.filter(tab => !tab.closed);

    // Broadcast a global state or trigger a function inside all open sprite editors
    spriteEditors.forEach(tab => {
        // Palette
        setTimeout(function(){
            const systemHardware = tab.GlobalPalette.initFromRom(currentRomName);
            tab.GlobalPalette.generateSubPaletteUI('dynamicPaletteUIContainer');
        }, 1000)
    });
}

function renderCHRViewer() {
    // Filter out closed windows before sending updates
    spriteEditors = spriteEditors.filter(tab => !tab.closed);

    spriteEditors.forEach(tab => {
        setTimeout(tab.renderCHRViewer, 1000);
    });
}

function updateButtonPreviews() {
    // Filter out closed windows before sending updates
    spriteEditors = spriteEditors.filter(tab => !tab.closed);

    spriteEditors.forEach(tab => {
        setTimeout(tab.updateButtonPreviews, 1000);
    });
}
