function scriptNodeProcess(e){
  if(!isLoaded)return;
  let outputL = e.outputBuffer.getChannelData(0);
  let outputR = e.outputBuffer.getChannelData(1);
  if(!AudioContextManager.shouldOutputAudio()){
    for(var i = 0;i < 2048;i++)outputL[i] = 0;
    for(var i = 0;i < 2048;i++)outputR[i] = 0;
  }else{
    var soundBuffer = new Float32Array(gameModule.HEAPF32.buffer, gameModule._get_audio_buffer_ptr(), 2048 * 2);
    for(var i = 0;i < 2048;i++)outputL[i] = soundBuffer[i];
    for(var i = 0;i < 2048;i++)outputR[i] = soundBuffer[i + 2048];
  }
}

function enableSound(){
  if (!AudioContextManager.isEnabled()) return;

  var AudioContext = window.AudioContext || window.webkitAudioContext;
  if(!AudioContext){
    noSound = true;
    return;
  }

  if (ac) {
    AudioContextManager.registerContext(ac);
    return;
  }

  ac = AudioContextManager.getOrCreateContext(SAMPLE_RATE);
  if(!ac){
    noSound = true;
    return;
  }
  var scriptNode = null;
  if(ac.createScriptProcessor){
    scriptNode = ac.createScriptProcessor(2048, 0, 2);
  }else if(ac.createJavaScriptNode){
    scriptNode = ac.createJavaScriptNode(2048, 0, 2);
  }else{
    ac = null;
    noSound = true;
    return;
  }
  scriptNode.onaudioprocess = scriptNodeProcess;
  scriptNode.connect(ac.destination);
  AudioContextManager.registerContext(ac);
}

AudioContextManager.onNeedInit(() => {
  enableSound();
});