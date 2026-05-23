/**
 * ============================================================
 *  碳平衡射手 — 音频引擎 (audio.js)
 *  Web Audio API 合成音效，零外部依赖
 * ============================================================ 
 *  风格：环保科技感 + 祖玛休闲爽感 + 轻度未来感
 */

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx = null;
let bgmLoop = null;
let bpmNode = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let audioReady = false;

/** 初始化 - 自动启动，被拦截时等待首次交互恢复 */
function initAudio() {
  if (audioReady) return;
  try {
    actx = new AudioCtx();
    masterGain = actx.createGain(); masterGain.gain.value = 0.6; masterGain.connect(actx.destination);
    musicGain = actx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(masterGain);
    sfxGain   = actx.createGain(); sfxGain.gain.value = 0.55;   sfxGain.connect(masterGain);
    audioReady = true;
    if (actx.state === 'suspended') {
      // 浏览器拦截自动播放，等待任意交互后恢复
      const resume = () => { actx.resume(); startBGM(); document.removeEventListener('click', resume); document.removeEventListener('keydown', resume); };
      document.addEventListener('click', resume);
      document.addEventListener('keydown', resume);
    } else {
      startBGM();
    }
  } catch(e) { console.warn('Audio not available'); }
}

// 页面加载即尝试启动
initAudio();

/* ============================================================
   BGM — 轻电子环保循环
   ============================================================ */

function startBGM() {
  if (!audioReady) return;
  stopBGM();
  // 简单琶音循环模拟环保电子氛围
  const notes = [262,330,392,330, 294,349,440,349, 262,330,392,523, 440,392,330,262];
  const noteLen = 0.28;
  let i = 0;

  function playNote() {
    if (!audioReady || bgmLoop === null) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = 'sine'; osc.frequency.value = notes[i % notes.length];
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + noteLen * 0.7);
    osc.connect(g); g.connect(musicGain);
    osc.start(t); osc.stop(t + noteLen * 0.8);
    i++;
  }

  playNote();
  bgmLoop = setInterval(playNote, noteLen * 1000);
}

function stopBGM() {
  if (bgmLoop) { clearInterval(bgmLoop); bgmLoop = null; }
}

/* ============================================================
   音效生成器
   ============================================================ */

/** 短促弹出音 */
function sfxPop(freq, vol, dur, type) {
  if (!audioReady) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur);
}

/** 上升音 */
function sfxRise(startFreq, endFreq, dur) {
  if (!audioReady) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(startFreq, t);
  o.frequency.linearRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur);
}

/** 下降警报音 */
function sfxAlarm(freq, dur) {
  if (!audioReady) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sawtooth'; o.frequency.value = freq;
  const lfo = actx.createOscillator();
  const lfoG = actx.createGain();
  lfo.type = 'square'; lfo.frequency.value = 6;
  lfoG.gain.value = 30; lfo.connect(lfoG); lfoG.connect(o.frequency);
  g.gain.setValueAtTime(0.15, t); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(sfxGain);
  lfo.start(t); lfo.stop(t + dur);
  o.start(t); o.stop(t + dur);
}

/** 多音清脆链 */
function sfxChime(notes, dur) {
  if (!audioReady) return;
  const t = actx.currentTime;
  notes.forEach((freq, i) => {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    const s = t + i * (dur / notes.length);
    g.gain.setValueAtTime(0.18, s); g.gain.exponentialRampToValueAtTime(0.001, s + dur / notes.length);
    o.connect(g); g.connect(sfxGain);
    o.start(s); o.stop(s + dur / notes.length);
  });
}

/* ============================================================
   游戏事件音效
   ============================================================ */

function playInsertO2()  { sfxPop(880, 0.18, 0.1, 'sine'); sfxPop(660, 0.08, 0.08, 'sine'); }    // 空气轻弹
function playInsertH2O() { sfxPop(440, 0.2, 0.12, 'triangle'); sfxPop(330, 0.1, 0.1, 'triangle'); } // 水润弹出
function playTriple()    { sfxChime([523,659,784,1047], 0.35); }                                    // 水晶链消除
function playCombustion(){ sfxPop(220, 0.25, 0.18, 'sawtooth'); sfxPop(165, 0.15, 0.12, 'sawtooth'); } // 燃烧噗
function playPhoto()     { sfxChime([784,988,1175,1318,1568], 0.5); }                              // 风铃光合
function playScore()     { sfxPop(1047, 0.12, 0.08, 'sine'); }                                      // 积分叮
function playCombo(n)    { sfxRise(400 + n * 50, 800 + n * 80, 0.2); }                              // Combo 上升
function playOverflow()  { sfxAlarm(180, 0.45); }                                                    // 污染警报
function playGameOver()  { for(let i=0;i<4;i++) setTimeout(()=>sfxPop(180-i*30, 0.2, 0.3, 'sawtooth'), i*200); } // 失败
function playWin()       { sfxChime([523,659,784,1047,1318,1568], 1.0); }                           // 胜利
function playUI()        { sfxPop(1200, 0.08, 0.05, 'sine'); }                                      // UI点击
function playSwitch()    { sfxRise(300, 600, 0.1); }                                                  // 切换弹药