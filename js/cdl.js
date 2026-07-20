function downloadCDL() {
    const cdlPtr = gameModule._get_active_cdl_ptr();
    const romSize = gameModule._get_active_cdl_size();

    if (cdlPtr === 0 || romSize === 0) {
        alert("Logger memory space not initialized or ready.");
        return;
    }

    const cdlData = new Uint8Array(gameModule.HEAPU8.buffer, cdlPtr, romSize);
    const cdlOutput = new Uint8Array(cdlData);

    const blob = new Blob([cdlOutput], {type: 'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game.cdl';
    a.click();
    URL.revokeObjectURL(url);
}