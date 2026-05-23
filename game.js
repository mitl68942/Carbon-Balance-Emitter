/**
 * ============================================================
 *  碳平衡射手 — Carbon Balance Shooter v3
 *  游戏核心逻辑 (game.js)
 * ============================================================
 *
 *  V3 新增：新手教学系统（5 步引导，60-90 秒完成）
 *  V2：5 分钟倒计时、1200 分胜利、Combo 倍率、弹药限制
 */

/* ============================================================
   第一部分：常量与配置
   ============================================================ */

const ELEMENTS = {
  C:   { key: 'C',   label: 'C',    color: '#3b3b3b', glow: '#888888', stroke: '#cfcfcf',
         desc: '碳颗粒/煤渣', clogDanger: '堵塞通道' },
  CO:  { key: 'CO',  label: 'CO',   color: '#d97706', glow: '#fbbf24', stroke: '#fef3c7',
         desc: '一氧化碳/有毒中间产物', leakDanger: '有毒气体泄露' },
  H2O: { key: 'H2O', label: 'H₂O',  color: '#2563eb', glow: '#60a5fa', stroke: '#bfdbfe',
         desc: '水雾喷淋', tooltip: '冷却·吸收·净化' },
  O2:  { key: 'O2',  label: 'O₂',   color: '#06b6d4', glow: '#67e8f9', stroke: '#cffafe',
         desc: '氧气注入', tooltip: '助燃·调控' },
  CO2: { key: 'CO2', label: 'CO₂',  color: '#b44a2f', glow: '#f87171', stroke: '#fecaca',
         desc: '高压废气', leakDanger: '密封失效·泄露' },
};

const CONFIG = {
  BALL_RADIUS: 17,
  SPACING: 34,                 // 球紧挨无缝
  SPEED: 34,                   // 速度=间距，生成同步
  START_SAFE_SPACING: 12,
  SPIRAL_TURNS: 2.5,
  SPIRAL_STEPS: 1600,
  REACTION_INTERVAL: 0.35,
  GAME_DURATION: 180,
  WIN_SCORE: 8000,
  SPAWN_INTERVAL_MIN: 0.98,    // ≈SPACING/SPEED
  SPAWN_INTERVAL_MAX: 1.02,
  SPAWN_BATCH_SIZE: [1, 1],
  SPAWN_WEIGHTS: { C: 0.55, CO2: 0.25, CO: 0.20 },
  COMBO_TIMEOUT: 1.5,
  SCORE_TRIPLE_PER_BALL: 25,
  SCORE_COMBUSTION: 15,
  SCORE_PHOTOSYNTHESIS: 50,
  MAX_SHOTS: 18,
  PHOTO_SHOT_BONUS: 1,
};

/* ============================================================
   关卡配置（教程 + 3 关）
   ============================================================ */

const LEVELS = [
  { id:'tutorial', name:'新手教学', icon:'🎓',
    desc:'学会插入、三消、燃烧与光合作用', meta:'🎯3000分 · 无限时间 · 无失败压力',
    SPEED:14, WIN:3000, W:{C:.55,CO2:.25,CO:.20},
    O2Am:999, H2OAm:999, BONUS:1, TIME:999999, CLOG:99, LEAK:99, TUTORIAL:false,
    mode:'tutorial' },
  { id:'l2', name:'城市呼吸', icon:'🏭',
    desc:'弹药紧张，精准插入+连锁冲分', meta:'🎯8000分 · 3分 · O₂10/💧8',
    SPEED:28, WIN:8000, W:{C:.55,CO2:.25,CO:.20},
    O2Am:10, H2OAm:8, BONUS:1, TIME:180, CLOG:3, LEAK:3, TUTORIAL:false,
    mode:'score' },
  { id:'l3', name:'碳过载·极限封锁', icon:'☠',
    desc:'零容错+极限速度', meta:'🎯20000分 · 2分 · O₂10/💧5 · 🚫零容错',
    SPEED:35, WIN:20000, W:{C:.50,CO2:.20,CO:.30},
    O2Am:10, H2OAm:5, BONUS:1, TIME:120, CLOG:1, LEAK:1, TUTORIAL:false,
    mode:'score' },
];

let currentLevel = 1; // 默认城市呼吸
let shotsO2 = 10, shotsH2O = 8; // 分类弹药

function applyLevel(lvl) {
  const L = LEVELS[lvl];
  CONFIG.SPEED = L.SPEED;
  CONFIG.WIN_SCORE = L.WIN;
  CONFIG.SPAWN_WEIGHTS = L.W;
  CONFIG.PHOTO_SHOT_BONUS = L.BONUS;
  CONFIG.GAME_DURATION = L.TIME;
  shotsO2 = L.O2Am;
  shotsH2O = L.H2OAm;
}

/* ============================================================
   界面状态管理
   ============================================================ */

const mainMenu   = document.getElementById('mainMenu');
const levelSelect = document.getElementById('levelSelect');
const btnToLevelSelect = document.getElementById('btnToLevelSelect');
const btnBackToMenu = document.getElementById('btnBackToMenu');
const hudEl = document.getElementById('hud');

let gameState = 'menu'; // 'menu' | 'levelSelect' | 'playing'

function showScreen(which) {
  gameState = which;
  mainMenu.classList.toggle('is-active', which === 'menu');
  levelSelect.classList.toggle('is-active', which === 'levelSelect');
  // 游戏中显示HUD，其他隐藏
  hudEl.style.display = (which === 'playing') ? '' : 'none';
  document.getElementById('infoIcons').style.display = (which === 'playing') ? '' : 'none';
  overlay.classList.remove('visible');
  tutorialOverlay.classList.remove('visible');
  menuModal.classList.remove('is-open');
  if (which === 'playing') { if (typeof resumeGame === 'function') resumeGame(); }
  else { if (typeof pauseGame === 'function') pauseGame(); }
}

btnToLevelSelect.addEventListener('click', () => showScreen('levelSelect'));
btnBackToMenu.addEventListener('click', () => showScreen('menu'));

// 关卡选择卡片点击
levelSelect.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card || !card.dataset.level) return;
  e.stopPropagation();
  startLevel(parseInt(card.dataset.level));
});

function startLevel(lvl) {
  currentLevel = lvl;
  applyLevel(lvl);
  gameOver = false; won = false;
  showScreen('playing');
  stopBGM(); startBGM();
  tutorial.active = false;
  reset();
}

// 修改"返回菜单"按钮 → 关卡选择
document.getElementById('menuModalConfirm').addEventListener('click', () => {
  isMenuModalOpen = false;
  menuModal.classList.remove('is-open');
  paused = false;
  stopBGM();
  showScreen('levelSelect');
});

// 结算"关卡选择"按钮
document.getElementById('lvlSelectBtn').addEventListener('click', () => showScreen('levelSelect'));

/* ============================================================
   引导式教程
   ============================================================ */

const tutPopup = document.getElementById('tutPopup');
const tutPopupIcon = document.getElementById('tutPopupIcon');
const tutPopupTitle = document.getElementById('tutPopupTitle');
const tutPopupMsg = document.getElementById('tutPopupMsg');

const TUT_STEPS = [
  { icon:'🏭', title:'工厂排放通道启动',
    msg:'轨道是排放通道。<br>⚫ C 到终点会堵塞，💨 CO₂ 到终点会泄露。<br>你只能注入 🔵 O₂ 或 💧 H₂O 来调控反应。',
    setup:null, check:null, handLock:'O2' },
  { icon:'🎯', title:'① 插入操作',
    msg:'点击轨道发光位置，把 O₂ 注入进去。',
    setup:()=>{
      balls=[]; hand='O2';
      ['C','H2O','C','O2','H2O','C'].forEach((t,i)=>balls.push(createBall(t,Math.max(0,track.totalLen-CONFIG.SPACING*8 - i*CONFIG.SPACING))));
      balls.forEach(b=>b.sTarget=b.s);
      setHighlight(3);
    }, check:'insert', handLock:'O2' },
  { icon:'💥', title:'② 三消 = 快速抽排',
    msg:'≥3 个相同元素连续相邻会自动消除。<br>把 O₂ 插入发光位置，凑成三个 O₂。',
    setup:()=>{
      balls=[]; hand='O2';
      ['O2','O2','O2','C','H2O'].forEach((t,i)=>balls.push(createBall(t,Math.max(0,track.totalLen-CONFIG.SPACING*7 - i*CONFIG.SPACING))));
      balls.forEach(b=>b.sTarget=b.s);
      setHighlight(1); // 两个O2后面
    }, check:'triple', handLock:'O2' },
  { icon:'🔥', title:'③ 燃烧：C+O₂→CO₂',
    msg:'C 与 O₂ 相邻会发生燃烧。<br>减少碳渣但制造 CO₂（泄露风险）。<br>插入 O₂ 让它贴近 C。',
    setup:()=>{
      balls=[]; hand='O2';
      ['C','C','H2O','O2'].forEach((t,i)=>balls.push(createBall(t,Math.max(0,track.totalLen-CONFIG.SPACING*7 - i*CONFIG.SPACING))));
      balls.forEach(b=>b.sTarget=b.s);
      setHighlight(1);
    }, check:'burn', handLock:'O2' },
  { icon:'🌿', title:'④ 光合作用：CO₂+H₂O→O₂+🍎',
    msg:'CO₂ 与 H₂O 相邻触发光合作用。<br>CO₂ 被消耗，压力降低。<br>切换到 H₂O 并插入贴近 CO₂。',
    setup:()=>{
      balls=[]; hand='H2O';
      ['CO2','C','O2'].forEach((t,i)=>balls.push(createBall(t,Math.max(0,track.totalLen-CONFIG.SPACING*6 - i*CONFIG.SPACING))));
      balls.forEach(b=>b.sTarget=b.s);
      setHighlight(1);
    }, check:'photosynthesis', handLock:null },
  { icon:'🔗', title:'⑤ 连锁反应',
    msg:'一次反应可能引发新的三消/反应。<br>系统会反复检测直到稳定。<br>插入 H₂O 触发光合后再连锁三消。',
    setup:()=>{
      balls=[]; hand='H2O';
      ['O2','O2','CO2','H2O','O2'].forEach((t,i)=>balls.push(createBall(t,Math.max(0,track.totalLen-CONFIG.SPACING*6 - i*CONFIG.SPACING))));
      balls.forEach(b=>b.sTarget=b.s);
      setHighlight(2);
    }, check:'chain', handLock:'H2O' },
  { icon:'🏆', title:'你已掌握通道调控',
    msg:'记住两种灾害：⚫ C 堵塞、💨 CO₂ 泄露。<br>用 O₂ 和 H₂O 在"清堵 vs 防漏"间平衡。',
    setup:null, check:'click', handLock:null },
];

let tutStep = 0;
let tutStepDone = false;
let chainCount = 0;

function setHighlight(insertIdx) {
  tutorial.targetInsertIdx = insertIdx;
  const safe = [];
  for(let i=0;i<balls.length;i++) safe.push(balls[i]);
  // 在insertIdx处空出一个位置计算s
  if(insertIdx<=0) tutorial.highlightS = safe[0].sTarget + CONFIG.SPACING*0.5;
  else if(insertIdx>=safe.length) tutorial.highlightS = safe[safe.length-1].sTarget - CONFIG.SPACING*0.5;
  else tutorial.highlightS = (safe[insertIdx-1].sTarget + safe[insertIdx].sTarget)/2;
  tutorial.highlightPos = pointAtS(tutorial.highlightS);
}

function showTutPopup(step) {
  const s = TUT_STEPS[step];
  tutPopupIcon.textContent = s.icon;
  tutPopupTitle.textContent = s.title;
  tutPopupMsg.innerHTML = s.msg;
  tutPopup.classList.add('visible');
  paused = true;
  tutStepDone = false;
}

let tutWarmup = 0;  // 计数
let tutWarmupPhase = 0; // 0=注氧, 1=注水

function startGuidedTutorial() {
  tutStep = -2; // -2=预热注氧, -1=预热注水
  tutStepDone = false;
  chainCount = 0;
  tutWarmup = 0;
  tutWarmupPhase = 0;
  balls = [];
  hand = 'O2';
  // 预热弹窗：注氧
  tutPopupIcon.textContent = '🔄';
  tutPopupTitle.textContent = '通道启动：注入氧气';
  tutPopupMsg.innerHTML = '轨道为空，工厂排放通道尚未激活。<br>请先注入 <strong>3 个 O₂</strong> 唤醒系统。<br>点击任意位置开始。';
  tutPopup.classList.add('visible');
  paused = true;
}

function advanceTutStep() {
  tutStep++;
  tutStepDone = false;
  chainCount = 0;
  if (tutStep >= TUT_STEPS.length - 1) {
    tutPopup.classList.remove('visible'); paused = false;
    tutorial.active = false;
    showScreen('levelSelect');
    return;
  }
  const s = TUT_STEPS[tutStep];
  if (s.setup) { s.setup(); enforceSpacingTargets(); }
  if (s.handLock) hand = s.handLock;
  updateHUD();
  showTutPopup(tutStep);
}

// 教程事件判定（含预热阶段）
function onTutEvent(type) {
  if (!LEVELS[currentLevel] || LEVELS[currentLevel].mode !== 'tutorial') return;
  // 预热阶段
  if (tutStep === -2) {
    if (type === 'insert') tutWarmup++;
    if (tutWarmup >= 3) {
      tutWarmup = 0; tutStep = -1; hand = 'H2O';
      tutPopup.classList.add('visible'); paused = true;
      tutPopupIcon.textContent = '💧';
      tutPopupTitle.textContent = '注入水雾喷淋';
      tutPopupMsg.innerHTML = '很好！现在切换到 <strong>H₂O 水雾</strong>，注入 <strong>3 个 H₂O</strong>。<br>点击任意位置开始。';
    }
    return;
  }
  if (tutStep === -1) {
    if (type === 'insert') tutWarmup++;
    if (tutWarmup >= 3) {
      tutStep = 0; paused = false;
      setTimeout(() => advanceTutStep(), 400);
    }
    return;
  }
  if (tutStepDone) return;
  const s = TUT_STEPS[tutStep];
  if (!s) return;

  if (type === 'chain') chainCount++;

  if (s.check === type) {
    tutStepDone = true;
    tutPopup.classList.remove('visible');
    paused = false;
    setTimeout(() => advanceTutStep(), 300);
  } else if (s.check === 'chain' && chainCount >= 2) {
    tutStepDone = true;
    tutPopup.classList.remove('visible');
    paused = false;
    setTimeout(() => advanceTutStep(), 300);
  }
}




/* ============================================================
   教程系统 — 5 步闯关式引导
   ============================================================ */

const TUTORIAL_STEPS = [
  {
    id: 'intro',       title: '蓝穹城·排放通道控制室',
    msg: '你是<strong>碳平衡调控员</strong>，负责维持工厂排放通道的安全。<br>用 💧水雾喷淋 和 🔵氧气注入 调控管道内的物质流。<br><br><span style="font-size:12px;color:#a9b4d6">⚫ 碳颗粒堵塞通道  |  💨 CO₂ 泄露到大气<br>两种灾害都要防范！</span><br><br><span style="font-size:13px;color:#a9b4d6">点击任意位置开始教学</span>',
    setup: null,       goal: 'click',
    handLock: null,    highlightS: null,
  },
  {
    id: 'insert',      title: '① 学会插入',
    msg: '点击管道<span style="color:#67e8f9">发光区域</span>，把 O₂ 注入管道',
    setup: 'setupInsert', goal: 'insert',
    handLock: 'O2',    highlightS: null,
  },
  {
    id: 'triple',      title: '② 压力释放（三消）',
    msg: '把 O₂ 注入<span style="color:#ffd700">高亮位置</span>，触发同类聚合抽排！',
    setup: 'setupTriple', goal: 'triple',
    handLock: 'O2',    highlightS: null,
  },
  {
    id: 'burn',        title: '③ 二次燃烧（短期通畅）',
    msg: '让 <span style="color:#cfcfcf">碳颗粒 C</span> 接触 <span style="color:#67e8f9">O₂</span><br>燃烧转为 <span style="color:#f87171">CO₂ 废气</span>（通而不堵，但有泄露风险！）',
    setup: 'setupBurn', goal: 'burn',
    handLock: 'O2',    highlightS: null,
  },
  {
    id: 'photo',       title: '④ 生物滤层（净化）',
    msg: '按 <span class="kbd-inline">Space</span> 启动 💧 水雾喷淋<br>CO₂ + H₂O → O₂ + 🍎碳固定（积分）',
    setup: 'setupPhoto', goal: 'photosynthesis',
    handLock: null,    highlightS: null,
  },
  {
    id: 'warn',        title: '⚠ 净化洞风险',
    msg: '<span style="color:#aaaaaa">⚫ C 到净化洞</span> → 堵塞 +1<br><span style="color:#ff4d4d">💨 CO/CO₂ 到净化洞</span> → 泄露 +1<br><span style="color:#67e8f9">🔵💧 O₂/H₂O 无害通过</span>',
    setup: 'setupWarn', goal: 'auto',
    handLock: null,    highlightS: null,
  },
];

let tutorial = {
  active: true,
  step: -1,           // -1=等待开始, 0=intro, 1-5=教学步骤
  stepTimer: 0,        // 用于 auto-advance 步骤的计时器
  highlightS: null,    // 轨道高亮弧长坐标
  highlightPos: null,  // {x,y} 高亮屏幕坐标
  targetInsertIdx: -1, // 引导插入位置
  stepCompleted: false,
};

/** 教程 DOM 引用 */
const tutorialOverlay = document.getElementById('tutorialOverlay');
const tutTitleEl      = document.getElementById('tutTitle');
const tutMsgEl        = document.getElementById('tutMsg');
const tutDotsEl       = document.getElementById('tutDots');
const tutSkipEl       = document.getElementById('tutSkip');

/** Combo 倍率表：combo 计数 → 倍率 */
function comboMultiplier(combo) {
  if (combo <= 1) return 1;
  if (combo <= 2) return 2;
  if (combo <= 4) return 3;
  if (combo <= 7) return 4;
  return 5;
}

/* ============================================================
   第二部分：全局游戏状态
   ============================================================ */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// DOM
const clogEl      = document.getElementById('clog');
const leakEl      = document.getElementById('leak');
const handLabelEl = document.getElementById('handLabel');
const toggleBtn   = document.getElementById('toggleBtn');
const restartBtn  = document.getElementById('menuBtn');
const restartBtn2 = document.getElementById('restartBtn2');
const overlay     = document.getElementById('overlay');
const timerEl     = document.getElementById('timer');
const scoreEl     = document.getElementById('score');
const shotsEl     = document.getElementById('shots');
const comboEl     = document.getElementById('comboDisplay');

// 轨道
let track = { pts: [], lens: [], totalLen: 1 };

// 球
let balls = [];
let hand = 'O2';

// 数值状态 — 堵塞与泄露
let clog = 0;        // C 到达终点
let leak = 0;        // CO / CO₂ 到达终点
let gameOver = false;
let won = false;

// V2 计时/计分
let timeLeft = CONFIG.GAME_DURATION;
let score = 0;

// 步数限制
let shotsLeft = CONFIG.MAX_SHOTS;

// V2 连锁
let combo = 0;
let comboTimer = 0;
let lastComboFlash = 0;

// 特效
let shake = 0;
let dangerFlash = 0;
let dangerFlashColor = '#ff2020';
let mouseX = -100, mouseY = -100;
let reactionTimer = 0;
let particles = [];
let floatingTexts = [];

// 起点生成
let spawnTimer = 0;
let nextSpawnIn = 3;

/* ============================================================
   第三部分：工具函数
   ============================================================ */

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function weightedPick(weights) {
  const r = Math.random();
  let cum = 0;
  for (const [k, w] of Object.entries(weights)) {
    cum += w;
    if (r <= cum) return k;
  }
  return Object.keys(weights)[0];
}

/* ============================================================
   教程核心函数
   ============================================================ */

/** 事件钩子：在插入/反应时调用 */
function onTutorialEvent(eventType) {
  if (!tutorial.active || tutorial.stepCompleted) return;
  const step = TUTORIAL_STEPS[tutorial.step];
  if (!step || step.goal !== eventType) return;
  tutorialAdvance();
}

/** 推进到下一步 */
function tutorialAdvance() {
  tutorial.stepCompleted = true;
  // 闪一下绿色反馈（停留 600ms）
  tutMsgEl.style.color = '#7af5b8';
  tutMsgEl.style.transform = 'scale(1.06)';
  setTimeout(() => {
    tutMsgEl.style.color = '';
    tutMsgEl.style.transform = '';
  }, 600);

  // 延迟推进：让玩家看清反馈文字
  setTimeout(() => {
    tutorial.step++;
    tutorial.stepCompleted = false;
    tutorial.stepTimer = 0;

    if (tutorial.step >= TUTORIAL_STEPS.length) {
      finishTutorial();
      return;
    }

    const s = TUTORIAL_STEPS[tutorial.step];
    tutorial.highlightS = null;
    tutorial.highlightPos = null;
    tutorial.targetInsertIdx = -1;

    if (s.setup && typeof window[s.setup] === 'function') {
      window[s.setup]();
    }

    // auto-advance 步骤
    if (s.goal === 'auto') {
      tutorial.stepTimer = 4; // 4 秒后自动推进
    }

    updateTutorialUI();
  }, 1200); // 1.2 秒后进入下一步（原为 0ms→看不清）
}

/** 更新教程 UI（DOM + 进度点） */
function updateTutorialUI() {
  const s = TUTORIAL_STEPS[tutorial.step];
  if (!s) return;

  tutTitleEl.innerHTML = s.title;
  tutMsgEl.innerHTML = s.msg;

  // 进度点
  const total = TUTORIAL_STEPS.length - 1;
  const current = Math.max(0, tutorial.step - 1);
  let dots = '';
  for (let i = 0; i < total; i++) {
    dots += `<span class="dot ${i === current ? 'active' : i < current ? 'done' : ''}"></span>`;
  }
  tutDotsEl.innerHTML = dots;

  tutorialOverlay.classList.add('visible');

  // Step 0 (intro)：全屏遮罩 + pointer
  if (tutorial.step === 0) {
    tutorialOverlay.classList.add('intro-mode');
    tutorialOverlay.classList.remove('float-mode');
  } else {
    tutorialOverlay.classList.remove('intro-mode');
    tutorialOverlay.classList.add('float-mode');
  }
}

/** 教学完成 */
function finishTutorial() {
  tutorial.active = false;
  tutorial.step = -1;
  tutorial.highlightS = null;
  tutorial.highlightPos = null;
  tutorialOverlay.classList.remove('visible');
  reset();
}

/* ============================================================
   教程 Step 部署函数（设定轨道布局）
   ============================================================ */

function setupInsert() {
  balls = [];
  hand = 'O2';
  const nearCenter = track.totalLen - CONFIG.SPACING * 8;
  const types = ['C', 'H2O', 'O2', 'C', 'H2O', 'C', 'O2', 'H2O', 'C', 'C'];
  for (let i = 0; i < types.length; i++) {
    const s = nearCenter - i * CONFIG.SPACING;
    balls.push(createBall(types[i], Math.max(0, s)));
  }
  balls.forEach(b => b.sTarget = b.s);
  // 高亮中间偏内侧区域
  tutorial.highlightS = nearCenter - CONFIG.SPACING * 5;
  tutorial.highlightPos = pointAtS(tutorial.highlightS);
  tutorial.targetInsertIdx = 5;
  updateHandLock('O2');
}

function setupTriple() {
  balls = [];
  hand = 'O2';
  // 布局：O₂ O₂ (空) O₂
  const base = track.totalLen - CONFIG.SPACING * 7;
  const layout = [
    { type: 'C',   s: base - CONFIG.SPACING * 0 },
    { type: 'H2O', s: base - CONFIG.SPACING * 1 },
    { type: 'O2',  s: base - CONFIG.SPACING * 2 },
    { type: 'O2',  s: base - CONFIG.SPACING * 3 },
    // 空位：O₂ 插入点
    { type: 'O2',  s: base - CONFIG.SPACING * 5 },
    { type: 'C',   s: base - CONFIG.SPACING * 6 },
    { type: 'H2O', s: base - CONFIG.SPACING * 7 },
  ];
  // 在索引 4 处留空（两个 O2 之间），新 O2 插入后形成 O₂ O₂ O₂ → 三消
  for (const it of layout) balls.push(createBall(it.type, Math.max(0, it.s)));
  balls.forEach(b => b.sTarget = b.s);
  // 高亮：空位位置
  const gapS = (balls[3].sTarget + balls[4].sTarget) / 2;
  tutorial.highlightS = gapS;
  tutorial.highlightPos = pointAtS(gapS);
  tutorial.targetInsertIdx = 4;
  updateHandLock('O2');
}

function setupBurn() {
  balls = [];
  hand = 'O2';
  const base = track.totalLen - CONFIG.SPACING * 7;
  const layout = [
    { type: 'H2O', s: base - CONFIG.SPACING * 0 },
    { type: 'C',   s: base - CONFIG.SPACING * 1 },
    // 空位：插入 O₂ → C + O₂ → CO₂
    { type: 'H2O', s: base - CONFIG.SPACING * 3 },
    { type: 'C',   s: base - CONFIG.SPACING * 4 },
    { type: 'O2',  s: base - CONFIG.SPACING * 5 },
  ];
  for (const it of layout) balls.push(createBall(it.type, Math.max(0, it.s)));
  balls.forEach(b => b.sTarget = b.s);
  const gapS = (balls[1].sTarget + balls[2].sTarget) / 2;
  tutorial.highlightS = gapS;
  tutorial.highlightPos = pointAtS(gapS);
  tutorial.targetInsertIdx = 2;
  updateHandLock('O2');
}

function setupPhoto() {
  balls = [];
  hand = 'H2O'; // 强制切换
  const base = track.totalLen - CONFIG.SPACING * 7;
  const layout = [
    { type: 'C',   s: base - CONFIG.SPACING * 0 },
    { type: 'CO2', s: base - CONFIG.SPACING * 1 },
    // 空位：插入 H₂O → CO₂ + H₂O → O₂
    { type: 'C',   s: base - CONFIG.SPACING * 3 },
    { type: 'O2',  s: base - CONFIG.SPACING * 4 },
    { type: 'H2O', s: base - CONFIG.SPACING * 5 },
  ];
  for (const it of layout) balls.push(createBall(it.type, Math.max(0, it.s)));
  balls.forEach(b => b.sTarget = b.s);
  const gapS = (balls[1].sTarget + balls[2].sTarget) / 2;
  tutorial.highlightS = gapS;
  tutorial.highlightPos = pointAtS(gapS);
  tutorial.targetInsertIdx = 2;
  updateHandLock(null); // 不锁，允许玩家自由切换
  updateHUD();
}

function setupWarn() {
  // 高亮终点位置
  tutorial.highlightS = track.totalLen;
  tutorial.highlightPos = pointAtS(track.totalLen);
  tutorial.targetInsertIdx = -1;
  updateHandLock(null);
}

/** 锁定/解锁手牌 */
function updateHandLock(lockType) {
  if (lockType) {
    hand = lockType;
    tutorial.handLock = lockType;
  } else {
    tutorial.handLock = null;
  }
  updateHUD();
}

/* ============================================================
   第四部分：轨道生成（螺旋形）
   ============================================================ */

function buildSpiralTrack(w, h) {
  const cx = w / 2, cy = h / 2;
  const outerR = Math.min(w, h) * 0.44;
  const innerR = Math.min(w, h) * 0.08;
  const turns = CONFIG.SPIRAL_TURNS;
  const steps = CONFIG.SPIRAL_STEPS;
  const pts = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * turns * Math.PI * 2 + Math.PI * 0.22;
    const r = outerR * (1 - t) + innerR * t;
    pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }

  const lens = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(total);
  }
  return { pts, lens, totalLen: total };
}

function pointAtS(s) {
  const L = track.totalLen;
  s = clamp(s, 0, L);
  let lo = 0, hi = track.lens.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track.lens[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const s0 = track.lens[i - 1], s1 = track.lens[i];
  const p0 = track.pts[i - 1], p1 = track.pts[i];
  const u = (s1 === s0) ? 0 : (s - s0) / (s1 - s0);
  return { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u };
}

/* ============================================================
   第五部分：球数据管理
   ============================================================ */

function createBall(type, s) {
  return { type, s, sTarget: s, pop: 0, flash: 0, born: 0 };
}

function enforceSpacingTargets() {
  balls.sort((a, b) => b.sTarget - a.sTarget);
  if (balls.length === 0) return;
  const minGap = CONFIG.BALL_RADIUS * 2;
  // 从外向内推：新球只把旧球推向净化洞方向，绝不反推
  for (let i = balls.length - 2; i >= 0; i--) {
    const want = balls[i + 1].sTarget + minGap;
    if (balls[i].sTarget < want) balls[i].sTarget = want;
  }
  // 排放口不溢出
  const last = balls[balls.length - 1];
  if (last) last.sTarget = Math.max(last.sTarget, 0);
}

/* ============================================================
   第六部分：插入预览
   ============================================================ */

function findInsertIndex(x, y) {
  if (balls.length === 0) return 0;
  if (balls.length === 1) {
    const s0 = balls[0].sTarget;
    const p = pointAtS(s0);
    const pOut = pointAtS(Math.max(0, s0 - CONFIG.SPACING));
    return ((pOut.x - x) ** 2 + (pOut.y - y) ** 2 < (p.x - x) ** 2 + (p.y - y) ** 2) ? 1 : 0;
  }
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < balls.length; i++) {
    const p = pointAtS(balls[i].sTarget);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  const s_i = balls[bestIdx].sTarget;
  const p_i = pointAtS(s_i);
  const p_out = pointAtS(Math.max(0, s_i - CONFIG.SPACING * 0.9));
  return ((p_out.x - x) ** 2 + (p_out.y - y) ** 2 < (p_i.x - x) ** 2 + (p_i.y - y) ** 2) ? (bestIdx + 1) : bestIdx;
}

function getInsertPreviewPos(idx) {
  let sNew;
  if (idx <= 0 && balls.length > 0) {
    sNew = Math.min(track.totalLen - CONFIG.SPACING * 1.8, balls[0].sTarget + CONFIG.SPACING * 0.85);
  } else if (idx >= balls.length && balls.length > 0) {
    sNew = Math.max(CONFIG.SPACING, balls[balls.length - 1].sTarget - CONFIG.SPACING * 0.85);
  } else if (balls.length >= 2 && idx > 0 && idx < balls.length) {
    sNew = (balls[idx - 1].sTarget + balls[idx].sTarget) / 2;
  } else {
    return null;
  }
  return pointAtS(sNew);
}

/* ============================================================
   第七部分：插入球操作
   ============================================================ */

function insertBallAt(index) {
  if (gameOver) return;
  const ammo = hand === 'O2' ? shotsO2 : shotsH2O;
  if (ammo <= 0) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    spawnFloatingText(cx, cy + 70, `无${hand==='O2'?'O₂':'H₂O'}！`, '#ff6666');
    return;
  }

  balls.sort((a, b) => b.sTarget - a.sTarget);

  let sNew;
  if (index <= 0 && balls.length > 0) {
    sNew = Math.min(track.totalLen - CONFIG.SPACING * 1.8, balls[0].sTarget + CONFIG.SPACING * 0.85);
  } else if (index >= balls.length && balls.length > 0) {
    sNew = Math.max(0, balls[balls.length - 1].sTarget - CONFIG.SPACING * 0.85);
  } else if (balls.length >= 2) {
    sNew = (balls[index - 1].sTarget + balls[index].sTarget) / 2;
  } else {
    sNew = track.totalLen - CONFIG.SPACING * 6;
  }

  const b = createBall(hand, sNew);
  b.pop = 1; b.born = 1;
  balls.splice(index, 0, b);
  enforceSpacingTargets();

  // V2：插入点局部优先检测 → 再全链扫描（通过球引用找到最终位置）
  if (tutorial.active) {
  if (tutorial.active) onTutorialEvent('insert');
  } else {
  if (hand === 'O2') shotsO2--; else shotsH2O--;
  }

  const finalIdx = balls.indexOf(b);
  resolveLocalThenChain(finalIdx >= 0 ? finalIdx : index);
  enforceSpacingTargets();
}

/**
 * V2：插入点局部优先反应
 * 1. 先扫描插入位置 ±3 范围的三消 / 两两反应
 * 2. 若触发了再全链扫描（连锁）
 */
function resolveLocalThenChain(insertIdx) {
  balls.sort((a, b) => b.sTarget - a.sTarget);
  const window = 5; // 检查插入点前后各 5 个球

  let localReacted = false;
  const lo = Math.max(0, insertIdx - window);
  const hi = Math.min(balls.length, insertIdx + window + 1);

  // 局部检测三消
  const localTri = findTripleInRange(lo, hi);
  if (localTri) {
    applyTriple(localTri.start, localTri.end);
    localReacted = true;
  }

  // 局部检测两两反应
  if (!localReacted) {
    const localPair = findPairInRange(lo, hi);
    if (localPair) {
      applyPair(localPair.i, localPair.productType);
      localReacted = true;
    }
  }

  // 一旦触发了局部反应，全链扫描
  if (localReacted) {
    resolveAllReactions();
  } else {
    // 局部没触发也要全局扫描一次（可能有其他位置的反应）
    resolveAllReactions();
  }
}

/* ============================================================
   第八部分：反应系统（V2：带 combo 与计分）
   ============================================================ */

function resolveAllReactions() {
  balls.sort((a, b) => b.sTarget - a.sTarget);
  let safety = 0;
  let changed = true;
  while (changed && safety++ < 100) {
    changed = false;

    // 1. 三消
    const tri = findTripleGroup();
    if (tri) {
      applyTriple(tri.start, tri.end);
      changed = true;
      balls.sort((a, b) => b.sTarget - a.sTarget);
      enforceSpacingTargets();
      continue;
    }

    // 2. CO 氧化：2CO + O₂ → 2CO₂
    const coOx = findPattern3(['CO','CO','O2']);
    if (coOx) {
      applyTripleReaction(coOx.i, 'CO2', 'CO2', 15, 'CO氧化');
      changed = true;
      balls.sort((a, b) => b.sTarget - a.sTarget);
      enforceSpacingTargets();
      continue;
    }

    // 3. 不完全燃烧：2C + O₂ → CO₂（3球→1球）
    const incBurn = findPattern3(['C','C','O2']);
    if (incBurn) {
      apply3to1(incBurn.i, 'CO2', 10, '不完全燃烧');
      changed = true;
      balls.sort((a, b) => b.sTarget - a.sTarget);
      enforceSpacingTargets();
      continue;
    }

    // 4. 完全燃烧：C + O₂ → CO₂
    const pair = findReactivePair();
    if (pair) {
      applyPair(pair.i, pair.productType);
      changed = true;
      balls.sort((a, b) => b.sTarget - a.sTarget);
      enforceSpacingTargets();
      continue;
    }
  }
}

/** 执行三消并计分 */
function applyTriple(start, end) {
  const count = end - start;
  const avgS = (balls[start].sTarget + balls[end - 1].sTarget) / 2;

  // 粒子
  for (let i = start; i < end; i++) {
    spawnParticles(balls[i].sTarget, balls[i].type, 4);
    balls[i].flash = 1;
    balls[i].pop = 1;
  }

  // 计分
  const baseScore = CONFIG.SCORE_TRIPLE_PER_BALL * count;
  addScore(baseScore, avgS);

  balls.splice(start, count);
  playTriple();
  incCombo();
  if (tutorial.active) onTutorialEvent('triple');
}

/** 执行两两反应并计分 */
function applyPair(i, productType) {
  const sNew = balls[i].sTarget;
  const isPhoto = (balls[i].type === 'CO2' && balls[i + 1].type === 'H2O') ||
                  (balls[i].type === 'H2O' && balls[i + 1].type === 'CO2');

  spawnParticles(balls[i].sTarget, balls[i].type, 3);
  spawnParticles(balls[i + 1].sTarget, balls[i + 1].type, 3);

  balls[i].flash = 1;
  balls[i + 1].flash = 1;

  balls.splice(i, 2, createBall(productType, sNew));
  balls[i].born = 1; balls[i].pop = 1; balls[i].flash = 1;

  // 计分
  const baseScore = isPhoto ? CONFIG.SCORE_PHOTOSYNTHESIS : CONFIG.SCORE_COMBUSTION;
  isPhoto ? playPhoto() : playCombustion();
  addScore(baseScore, sNew, isPhoto);

  // 光合回收 H₂O 弹药
  if (isPhoto) {
    shotsH2O += CONFIG.PHOTO_SHOT_BONUS;
    const p = pointAtS(sNew);
    spawnFloatingText(p.x, p.y - 18, `+${CONFIG.PHOTO_SHOT_BONUS}💧`, '#7af5b8');
  }

  incCombo();
  if (tutorial.active) {
  if (tutorial.active) onTutorialEvent(isPhoto ? 'photosynthesis' : 'burn');
  }
}

/** 3球→1球反应 */
function apply3to1(i, product, baseScore, label) {
  const sAvg = (balls[i].sTarget + balls[i+2].sTarget) / 2;
  for (let k = 0; k < 3; k++) {
    spawnParticles(balls[i+k].sTarget, balls[i+k].type, 4);
    balls[i+k].flash = 1; balls[i+k].pop = 1;
  }
  balls.splice(i, 3, createBall(product, sAvg));
  balls[i].born = 1; balls[i].pop = 1.2; balls[i].flash = 1;
  addScore(baseScore, sAvg);
  const p = pointAtS(sAvg);
  spawnFloatingText(p.x, p.y - 22, label, '#7af5b8');
  incCombo();
  if (tutorial.active) onTutorialEvent('burn');
}

/** V2：局部范围三消 */
function findTripleInRange(lo, hi) {
  if (hi - lo < 3) return null;
  let i = lo;
  while (i < hi) {
    let j = i + 1;
    while (j < hi && balls[j].type === balls[i].type) j++;
    if (j - i >= 3) return { start: i, end: j };
    i = j;
  }
  return null;
}

/** V2：局部范围两两反应 */
function findPairInRange(lo, hi) {
  for (let i = lo; i < hi - 1 && i < balls.length - 1; i++) {
    const a = balls[i].type, b = balls[i + 1].type;
    if ((a === 'C' && b === 'O2') || (a === 'O2' && b === 'C')) return { i, productType: 'CO2' };
    if ((a === 'CO2' && b === 'H2O') || (a === 'H2O' && b === 'CO2')) return { i, productType: 'O2' };
  }
  return null;
}

function findTripleGroup() {
  if (balls.length < 3) return null;
  let i = 0;
  while (i < balls.length) {
    let j = i + 1;
    while (j < balls.length && balls[j].type === balls[i].type) j++;
    if (j - i >= 3) return { start: i, end: j };
    i = j;
  }
  return null;
}



function findReactivePair() {
  for (let i = 0; i < balls.length - 1; i++) {
    const a = balls[i].type, b = balls[i + 1].type;
    // 完全燃烧：C + O₂ → CO₂
    if ((a === 'C' && b === 'O2') || (a === 'O2' && b === 'C')) return { i, productType: 'CO2' };
    // 光合作用：CO₂ + H₂O → O₂
    if ((a === 'CO2' && b === 'H2O') || (a === 'H2O' && b === 'CO2')) return { i, productType: 'O2' };
  }
  return null;
}

/**
 * 查找 3 球相邻反应模式（任意排列）
 * @param {string[]} types 3 个类型，如 ['C','C','O2']
 * @returns {{i:number}|null} 起始索引
 */
function findPattern3(types) {
  const sorted = [...types].sort().join(',');
  for (let i = 0; i < balls.length - 2; i++) {
    const trio = [balls[i].type, balls[i+1].type, balls[i+2].type].sort().join(',');
    if (trio === sorted) return { i };
  }
  return null;
}

/**
 * 执行 3 球反应：消除 3 球，替换为 2 个产物
 */
function applyTripleReaction(i, typeA, typeB, baseScore, label) {
  const sA = balls[i].sTarget;
  const sB = balls[i+2].sTarget;

  for (let k = 0; k < 3; k++) {
    spawnParticles(balls[i+k].sTarget, balls[i+k].type, 4);
    balls[i+k].flash = 1; balls[i+k].pop = 1;
  }

  balls.splice(i, 3,
    createBall(typeA, (sA * 2 + sB) / 3),
    createBall(typeB, (sA + sB * 2) / 3)
  );
  // 产物球闪烁动画
  balls[i].born = 1; balls[i].pop = 1.2; balls[i].flash = 1;
  balls[i+1].born = 1; balls[i+1].pop = 1.2; balls[i+1].flash = 1;

  addScore(baseScore, (sA + sB) / 2);
  playCombustion();

  // 反应类型标签飘字
  const p = pointAtS((sA + sB) / 2);
  const labelColor = (typeA === 'CO') ? '#fbbf24' : '#7af5b8';
  spawnFloatingText(p.x, p.y - 22, label, labelColor);

  incCombo();
  if (tutorial.active) onTutorialEvent('burn');
}

/* ============================================================
   第九部分：计分 & Combo & 飘字
   ============================================================ */

function addScore(base, s, isPhoto) {
  const mult = comboMultiplier(combo);
  const gained = base * mult;
  score += gained;

  const p = pointAtS(s);

  // 飘字
  let txt;
  if (isPhoto) {
    txt = `+${gained} 🍎`;
  } else if (mult > 1) {
    txt = `+${gained} x${mult}`;
  } else {
    txt = `+${gained}`;
  }

  floatingTexts.push({
    x: p.x, y: p.y,
    text: txt,
    life: 1.2,
    maxLife: 1.2,
    color: isPhoto ? '#7af5b8' : (mult > 1 ? '#ffd700' : '#ffffff'),
  });

  // 检查胜利条件
  if (score >= CONFIG.WIN_SCORE && !gameOver) {
    setGameWin();
  }
}

function incCombo() {
  combo++;
  if (combo > 1) playCombo(combo);
  comboTimer = CONFIG.COMBO_TIMEOUT;
  lastComboFlash = 0.6;
}

/** 飘字对象 */
function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, life: 1.5, maxLife: 1.5, color });
}

/* ============================================================
   第十部分：粒子特效
   ============================================================ */

function spawnParticles(s, type, count) {
  const p = pointAtS(s);
  const clr = ELEMENTS[type] ? ELEMENTS[type].glow : '#ffffff';
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 80;
    particles.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.5,
      maxLife: 0.4 + Math.random() * 0.5,
      color: clr,
      size: 2 + Math.random() * 3,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) { particles.splice(i, 1); continue; }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
  }
}

function drawParticles() {
  for (const pt of particles) {
    const alpha = pt.life / pt.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fillStyle = pt.color;
    ctx.fill();
    ctx.restore();
  }
}

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.life -= dt;
    ft.y -= 45 * dt; // 向上飘
    if (ft.life <= 0) { floatingTexts.splice(i, 1); }
  }
}

function drawFloatingTexts() {
  for (const ft of floatingTexts) {
    const alpha = clamp(ft.life / ft.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 16px "Microsoft YaHei", ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ft.color;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

/* ============================================================
   第十一部分：起点定时生成球
   ============================================================ */

function spawnBallsAtStart() {
  balls.sort((a, b) => b.sTarget - a.sTarget);
  const count = randInt(CONFIG.SPAWN_BATCH_SIZE[0], CONFIG.SPAWN_BATCH_SIZE[1]);
  for (let k = 0; k < count; k++) {
    const type = weightedPick(CONFIG.SPAWN_WEIGHTS);
    // 始终从排放口 s=0 进入，批量时依次排队
    const b = createBall(type, CONFIG.BALL_RADIUS * 2 * k);
    b.born = 1;
    balls.push(b);
  }
  enforceSpacingTargets(); // 只推旧球向净化洞，新球留在排放口
}

/* ============================================================
   第十二部分：每帧更新逻辑
   ============================================================ */

function update(dt) {
  if (paused || gameOver) return;

  // ---- 教程：倒计时/生成挂起 ----
  if (tutorial.active) {
    // auto-advance 步骤计时
    const s = TUTORIAL_STEPS[tutorial.step];
    if (s && s.goal === 'auto') {
      tutorial.stepTimer -= dt;
      if (tutorial.stepTimer <= 0 && !tutorial.stepCompleted) {
        tutorialAdvance();
      }
    }
    // 教程中：不产生污染（CO₂ 到达终点无害）、不生成新球、不计时
    // 只做球推进和动画
  } else {
    // ---- 正常模式：倒计时 ----
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      if (score >= CONFIG.WIN_SCORE) setGameWin();
      else setGameLose();
      return;
    }

    // ---- 起点生成计时 ----
    spawnTimer += dt;
    if (spawnTimer >= nextSpawnIn) { // 预热阶段不生成
      spawnTimer = 0;
      nextSpawnIn = CONFIG.SPACING / CONFIG.SPEED;
      spawnBallsAtStart();
    }
  }

  // ---- 球推进 ----
  const ds = CONFIG.SPEED * dt;
  for (const b of balls) {
    b.sTarget += ds;
    b.sTarget = clamp(b.sTarget, 0, track.totalLen + CONFIG.SPACING * 1.5);
  }

  // ---- 净化洞检测（O₂/H₂O 无害通过，C→堵塞，CO/CO₂→泄露） ----
  const dangerS = track.totalLen - CONFIG.BALL_RADIUS * 0.12;
  balls.sort((a, b) => b.sTarget - a.sTarget);

  let anyRemoved = false;
  for (let i = 0; i < balls.length; /* manual */) {
    const b = balls[i];
    if (b.sTarget < dangerS) { i++; continue; }

    if (tutorial.active) {
      balls.splice(i, 1); anyRemoved = true; continue;
    }

    const L = LEVELS[currentLevel];
    if (b.type === 'C') {
      spawnParticles(b.sTarget, 'C', 8);
      const p = pointAtS(b.sTarget);
      spawnFloatingText(p.x, p.y, '碳堵塞！⚫', '#aaaaaa');
      balls.splice(i, 1);
      clog++; anyRemoved = true;
      onOverflow();
      if (clog >= L.CLOG) { setGameLose(); continue; }
      continue;
    }
    if (b.type === 'CO') {
      spawnParticles(b.sTarget, 'CO', 8);
      const p = pointAtS(b.sTarget);
      spawnFloatingText(p.x, p.y, 'CO泄露！☠', '#fbbf24');
      balls.splice(i, 1);
      leak++; anyRemoved = true;
      onOverflow();
      if (leak >= L.LEAK) { setGameLose(); continue; }
      continue;
    }
    if (b.type === 'CO2') {
      spawnParticles(b.sTarget, 'CO2', 12);
      const p = pointAtS(b.sTarget);
      spawnFloatingText(p.x, p.y, 'CO₂泄露！💨', '#ff4444');
      balls.splice(i, 1);
      leak++; anyRemoved = true;
      onOverflow();
      if (leak >= L.LEAK) { setGameLose(); continue; }
      continue;
    }
    // O₂ / H₂O → 无害通过，自然消失
    balls.splice(i, 1);
    anyRemoved = true;
  }

  if (anyRemoved) {
    enforceSpacingTargets();
    resolveAllReactions();
    enforceSpacingTargets();
  }

  // ---- Combo 超时衰减 ----
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) { combo = 0; comboTimer = 0; }
  }
  lastComboFlash = Math.max(0, lastComboFlash - dt * 3);

  // ---- 周期性反应 ----
  reactionTimer += dt;
  if (reactionTimer >= CONFIG.REACTION_INTERVAL && !gameOver) {
    reactionTimer = 0;
    const before = balls.length;
    resolveAllReactions();
    if (balls.length !== before) enforceSpacingTargets();
  }

  // ---- 平滑跟随 ----
  const follow = 30;
  for (const b of balls) {
    b.s += (b.sTarget - b.s) * (1 - Math.exp(-follow * dt));
  }

  // ---- 动画衰减 ----
  for (const b of balls) {
    b.pop   = Math.max(0, b.pop   - dt * 3.5);
    b.flash = Math.max(0, b.flash - dt * 4.0);
    b.born  = Math.max(0, b.born  - dt * 2.8);
  }
  shake       = Math.max(0, shake       - dt * 24);
  dangerFlash = Math.max(0, dangerFlash - dt * 3.5);

  // 碰撞修正：实际位置重叠 → 推开
  resolveCollisions();

  updateParticles(dt);
  updateFloatingTexts(dt);
  updateHUD();
}

/** 碰撞修正：只向净化洞方向推，不反推 */
function resolveCollisions() {
  const minDist = CONFIG.BALL_RADIUS * 2;
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const d = balls[i].s - balls[j].s; // i 在内侧(大s) j 在外侧(小s)
      if (Math.abs(d) < minDist) {
        const push = minDist - Math.abs(d) + 0.5;
        if (d > 0) balls[i].s += push;      // 内侧球推向净化洞
        else       balls[j].s += push;      // 内侧球推向净化洞
      }
    }
  }
}

/* ============================================================
   第十三部分：视觉反馈
   ============================================================ */

function onOverflow() {
  playOverflow();
  dangerFlash = 1;
  dangerFlashColor = '#ff2020';
  shake = 12;
}

function setGameWin() {
  if (gameOver) return;
  stopBGM(); playWin();
  gameOver = true;
  won = true;
  overlay.classList.add('visible');
  document.getElementById('endIcon').textContent = '🌱🏭💚';
  document.getElementById('endTitle').textContent = `${LEVELS[currentLevel].name} 通过！`;
  document.getElementById('endMsg').innerHTML =
    `你在 <strong>${formatTime(CONFIG.GAME_DURATION - timeLeft)}</strong> 内获得 <strong>${score} 分</strong>！<br/>蓝穹城工业区运转正常 🌍💚`;
  document.getElementById('restartBtn2').textContent = '再来一次';
  for (const b of balls) {
    const p = pointAtS(b.s);
    for (let k = 0; k < 2; k++) {
      particles.push({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120 - 40,
        life: 1 + Math.random(), maxLife: 1 + Math.random(),
        color: '#7af5b8', size: 3 + Math.random() * 4,
      });
    }
  }
}

function setGameLose() {
  if (gameOver) return;
  stopBGM(); playGameOver();
  gameOver = true;
  won = false;
  overlay.classList.add('visible');

  document.getElementById('endIcon').textContent = '💥🏭⚠';
  document.getElementById('endTitle').textContent = `${LEVELS[currentLevel].name} 失败`;
  document.getElementById('endMsg').innerHTML =
    `堵塞：<strong>${clog}/${LEVELS[currentLevel].CLOG}</strong>  |  泄露：<strong>${leak}/${LEVELS[currentLevel].LEAK}</strong>  |  得分：<strong>${score}</strong><br/>C 造成堵塞，CO/CO₂ 造成泄露，任一超限即失败！`;
  document.getElementById('restartBtn2').textContent = '再来一次';

  for (const b of balls) {
    if (b.type === 'CO2') spawnParticles(b.s, 'CO2', 3);
    if (b.type === 'C') spawnParticles(b.s, 'C', 3);
  }
}

function updateHUD() {
  const L = LEVELS[currentLevel];
  clogEl.textContent = `堵塞 ${clog}/${L.CLOG}`;
  leakEl.textContent = `泄露 ${leak}/${L.LEAK}`;

  if (clog >= L.CLOG - 1) clogEl.classList.add('danger-flash');
  else clogEl.classList.remove('danger-flash');
  if (leak >= L.LEAK - 1) leakEl.classList.add('danger-flash');
  else leakEl.classList.remove('danger-flash');

  handLabelEl.textContent = (hand === 'O2') ? 'O₂' : 'H₂O';
  timerEl.textContent = formatTimeHUD(timeLeft);
  scoreEl.textContent = `${score}`;
  document.getElementById('scoreTarget').textContent = `/${CONFIG.WIN_SCORE}`;
  shotsEl.textContent = `🔵${shotsO2} 💧${shotsH2O}`;

  // 弹药不足警告
  if (shotsO2 + shotsH2O <= 5) shotsEl.classList.add('low-shots');
  else shotsEl.classList.remove('low-shots');

  // 倒计时紧迫感
  if (timeLeft <= 30) {
    timerEl.classList.add('urgent');
  } else {
    timerEl.classList.remove('urgent');
  }

  // 切换按钮样式
  toggleBtn.classList.remove('hand-o2', 'hand-h2o');
  toggleBtn.classList.add(hand === 'O2' ? 'hand-o2' : 'hand-h2o');
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimeHUD(sec) {
  if (sec >= 3600) return '∞';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ============================================================
   第十四部分：渲染管线
   ============================================================ */

function beginFrame() {
  const sx = (shake > 0) ? (Math.random() * 2 - 1) * shake : 0;
  const sy = (shake > 0) ? (Math.random() * 2 - 1) * shake : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(sx, sy);
}

function drawTrack() {
  const pts = track.pts;
  if (pts.length < 2) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 外层暗管
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = 28;
  ctx.strokeStyle = 'rgba(14, 22, 54, 0.9)';
  ctx.stroke();

  // 中层
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = 20;
  ctx.strokeStyle = 'rgba(32, 48, 112, 0.88)';
  ctx.stroke();

  // 内层高光
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(58, 76, 152, 0.75)';
  ctx.stroke();

  // 虚线中线
  ctx.setLineDash([8, 20]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(200, 210, 255, 0.18)';
  ctx.stroke();
  ctx.setLineDash([]);

  // 微光点
  ctx.globalAlpha = 0.25;
  for (let k = 0; k < 120; k++) {
    const s = (k / 120) * track.totalLen;
    const p = pointAtS(s);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
  ctx.restore();

  // 起点/终点
  const startP = track.pts[0];
  const endP = track.pts[track.pts.length - 1];

  ctx.save();
  // 起点
  ctx.beginPath();
  ctx.arc(startP.x, startP.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(122, 245, 184, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(122, 245, 184, 0.75)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(122, 245, 184, 0.95)';
  ctx.font = 'bold 12px "Microsoft YaHei", ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('工厂排放口', startP.x, startP.y - 15);

  // 终点：净化洞
  const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.25;
  ctx.beginPath();
  ctx.arc(endP.x, endP.y, 16 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 50, 50, 0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 50, 50, 0.9)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 50, 50, 0.95)';
  ctx.textBaseline = 'top';
  ctx.fillText('☢ 净化洞', endP.x, endP.y + 19);
  ctx.restore();
}

function drawBall(x, y, element, radius, pop, flash, born, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const scale = 1 + pop * 0.13 + (born > 0 ? Math.sin(born * Math.PI) * 0.09 : 0);
  const r = radius * scale;

  const glowGrad = ctx.createRadialGradient(x, y, r * 0.5, x, y, r + 5);
  glowGrad.addColorStop(0, element.glow + '40');
  glowGrad.addColorStop(1, 'transparent');
  ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fillStyle = glowGrad; ctx.fill();

  const bodyGrad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.15, x, y, r);
  bodyGrad.addColorStop(0, '#ffffff30');
  bodyGrad.addColorStop(0.4, element.color);
  bodyGrad.addColorStop(1, '#00000040');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = bodyGrad; ctx.fill();

  ctx.strokeStyle = element.stroke; ctx.lineWidth = 2; ctx.stroke();

  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();

  if (flash > 0) {
    ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * flash})`; ctx.lineWidth = 3; ctx.stroke();
  }

  const fontSize = Math.round(r * 0.88);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = `900 ${fontSize}px "Microsoft YaHei", ui-sans-serif, system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(element.label, x + 0.5, y + 0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(element.label, x, y);

  ctx.restore();
}

function drawBalls() {
  balls.sort((a, b) => b.s - a.s);
  for (const b of balls) {
    const p = pointAtS(b.s);
    drawBall(p.x, p.y, ELEMENTS[b.type], CONFIG.BALL_RADIUS, b.pop, b.flash, b.born, 1);
  }
}

function drawShooter() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const el = ELEMENTS[hand];

  ctx.save();

  // 外环
  ctx.beginPath(); ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fillStyle = shotsLeft > 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,50,50,0.08)';
  ctx.fill();
  const ammo = hand === 'O2' ? shotsO2 : shotsH2O;

  ctx.strokeStyle = ammo > 0 ? el.glow + '60' : '#ff444488';
  ctx.lineWidth = 2.5; ctx.stroke();

  // 内环
  const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.04;
  ctx.beginPath(); ctx.arc(cx, cy, 42 * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = ammo > 0 ? el.glow + '40' : '#ff444444';
  ctx.lineWidth = 1.5; ctx.stroke();
  if (ammo > 0) {
    drawBall(cx, cy, el, 19, 0, 0, 0, 1);
  } else {
    // 无弹药：灰暗化
    drawBall(cx, cy, el, 19, 0, 0, 0, 0.35);
    // 叉号覆盖
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy - 14); ctx.lineTo(cx + 14, cy + 14);
    ctx.moveTo(cx + 14, cy - 14); ctx.lineTo(cx - 14, cy + 14);
    ctx.stroke();
  }

  // 弹药数显示
  ctx.fillStyle = ammo > 0 ? 'rgba(233,239,255,0.8)' : '#ff6666';
  ctx.font = '700 12px "Microsoft YaHei", ui-sans-serif, system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const txt = ammo > 0 ? `O₂:${shotsO2} H₂O:${shotsH2O}` : '无弹药';
  ctx.fillText(txt, cx, cy + 58);

  ctx.restore();
}

function drawInsertPreview() {
  if (gameOver) return;
  if ((hand === 'O2' ? shotsO2 : shotsH2O) <= 0) return;
  if (balls.length === 0) return;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  if (Math.hypot(mouseX - cx, mouseY - cy) < 60) return;

  const idx = findInsertIndex(mouseX, mouseY);
  const pos = getInsertPreviewPos(idx);
  if (!pos) return;

  const el = ELEMENTS[hand];
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, CONFIG.BALL_RADIUS + 5, 0, Math.PI * 2);
  ctx.setLineDash([3, 4]); ctx.strokeStyle = el.glow; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  drawBall(pos.x, pos.y, el, CONFIG.BALL_RADIUS, 0, 0, 0, 0.4);
}

function drawDangerOverlay() {
  if (dangerFlash > 0 && !gameOver) {
    ctx.save();
    ctx.globalAlpha = 0.2 * dangerFlash;
    ctx.fillStyle = dangerFlashColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

/** V2：Combo 倍率文字 */
function drawComboDisplay() {
  if (combo > 1 && (comboTimer > 0 || lastComboFlash > 0)) {
    const mult = comboMultiplier(combo);
    const alpha = Math.min(1, comboTimer / 0.5) * (0.7 + lastComboFlash * 0.3);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 90;

    // 背景光晕
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
    grad.addColorStop(0, 'rgba(255,215,0,0.3)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 80, cy - 40, 160, 80);

    ctx.font = 'bold 26px "Microsoft YaHei", ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = 'rgba(255,200,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(`Combo x${mult}`, cx, cy);
    ctx.restore();
  }
}

/** 教程轨道高亮 */
function drawTutorialHighlight() {
  if (!tutorial.active || !tutorial.highlightPos) return;

  const { x, y } = tutorial.highlightPos;
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.18;

  ctx.save();

  // 外层脉冲光晕
  const g1 = ctx.createRadialGradient(x, y, CONFIG.BALL_RADIUS, x, y, CONFIG.BALL_RADIUS + 18 * pulse);
  g1.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
  g1.addColorStop(0.5, 'rgba(255, 215, 0, 0.15)');
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1;
  ctx.fillRect(x - 50, y - 50, 100, 100);

  // 粗虚线环
  ctx.setLineDash([5, 5]);
  ctx.lineDashOffset = -performance.now() * 0.04;
  ctx.beginPath();
  ctx.arc(x, y, CONFIG.BALL_RADIUS + 8 * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);

  // 向下箭头
  ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
  ctx.beginPath();
  ctx.moveTo(x, y - 32 * pulse);
  ctx.lineTo(x - 8, y - 22 * pulse);
  ctx.lineTo(x + 8, y - 22 * pulse);
  ctx.fill();

  ctx.restore();
}

function render() {
  beginFrame();
  drawTrack();
  drawBalls();
  drawTutorialHighlight();
  drawInsertPreview();
  drawParticles();
  drawFloatingTexts();
  drawShooter();
  drawDangerOverlay();
  drawComboDisplay();
}

/* ============================================================
   第十五部分：输入处理
   ============================================================ */

function screenToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

canvas.addEventListener('pointermove', (e) => {
  const pos = screenToCanvas(e); mouseX = pos.x; mouseY = pos.y;
});
canvas.addEventListener('pointerleave', () => { mouseX = -100; mouseY = -100; });
canvas.addEventListener('pointerdown', (e) => {
  initAudio(); // 首次点击激活音频
  if (gameOver) return;
  const { x, y } = screenToCanvas(e);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  if (Math.hypot(x - cx, y - cy) < 60) return;
  hand === 'O2' ? playInsertO2() : playInsertH2O();
  insertBallAt(findInsertIndex(x, y));
});

toggleBtn.addEventListener('click', () => { initAudio(); playUI(); toggleHand(); });
restartBtn.addEventListener('click', openMenuModal);

restartBtn2.addEventListener('click', () => { playUI(); startBGM(); reset(); });
document.getElementById('lvlSelectBtn').addEventListener('click', () => { showScreen('levelSelect'); });

// ===== 返回菜单弹窗 =====
let paused = false;
let isMenuModalOpen = false;
const menuModal = document.getElementById('menuModal');

function pauseGame() { paused = true; }
function resumeGame() { paused = false; }

function openMenuModal() {
  if (isMenuModalOpen) return;
  initAudio();
  isMenuModalOpen = true;
  pauseGame();
  menuModal.classList.add('is-open');
}
function closeMenuModal() {
  if (!isMenuModalOpen) return;
  isMenuModalOpen = false;
  menuModal.classList.remove('is-open');
  resumeGame();
}
document.getElementById('menuModalBackdrop')?.addEventListener('click', closeMenuModal);
document.getElementById('menuModalCancel')?.addEventListener('click', closeMenuModal);


window.addEventListener('keydown', (e) => {
  if (!isMenuModalOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); closeMenuModal(); }
  else if (e.key === 'Enter') { e.preventDefault(); closeMenuModal(); }
}, { passive: false });





window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); toggleHand(); }
}, { passive: false });

/* ============================================================
   第十六部分：流程控制
   ============================================================ */

function toggleHand() {
  if (gameOver) return;
  if (tutorial.active && tutorial.handLock) return;
  hand = (hand === 'O2') ? 'H2O' : 'O2';
  playSwitch();
  updateHUD();
}

function reset() {
  overlay.classList.remove('visible');
  tutorialOverlay.classList.remove('visible');
  tutorial.active = false;
  tutorial.step = -1;
  tutorial.highlightS = null;
  tutorial.highlightPos = null;
  tutorial.handLock = null;

  applyLevel(currentLevel);
  gameOver = false;
  won = false;
  clog = 0;
  leak = 0;
  score = 0;
  shotsLeft = CONFIG.MAX_SHOTS;
  timeLeft = CONFIG.GAME_DURATION;
  shake = 0;
  dangerFlash = 0;
  dangerFlashColor = '#ff2020';
  hand = 'O2';
  combo = 0;
  comboTimer = 0;
  lastComboFlash = 0;
  particles = [];
  floatingTexts = [];
  reactionTimer = 0;
  spawnTimer = 0;
  nextSpawnIn = CONFIG.SPACING / CONFIG.SPEED;
  mouseX = -100; mouseY = -100;

  track = buildSpiralTrack(canvas.width, canvas.height);
  balls = [];

  balls.forEach(b => b.sTarget = b.s);
  updateHUD();
}

/** 重置到指定关卡 */
/** 启动教程 */
function startTutorial() {
  tutorial.active = true;
  tutorial.step = 0;
  tutorial.stepCompleted = false;
  tutorial.highlightS = null;
  tutorial.highlightPos = null;
  tutorial.handLock = null;

  track = buildSpiralTrack(canvas.width, canvas.height);
  balls = [];
  hand = 'O2';
  clog = 0;
  leak = 0;
  score = 0;
  timeLeft = CONFIG.GAME_DURATION;
  shotsLeft = 999;

  updateTutorialUI();
}

/* ============================================================
   第十七部分：主循环
   ============================================================ */

let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

/* ============================================================
   第十八部分：启动
   ============================================================ */

applyLevel(1);
showScreen('menu');
requestAnimationFrame(gameLoop);

// 教程 Intro 点击 → 进入 Step 1
tutorialOverlay.addEventListener('click', () => {
  if (!tutorial.active || tutorial.step !== 0 || tutorial.stepCompleted) return;
  tutorialAdvance();
});

// 跳过教程
tutSkipEl.addEventListener('click', (e) => {
  e.stopPropagation();
  finishTutorial();
});

/* ============================================================
   信息面板（底部图标 → 玩法/世界观）
   ============================================================ */

const infoIcons    = document.getElementById('infoIcons');
const infoPanel    = document.getElementById('infoPanel');
const infoContent  = document.getElementById('infoPanelContent');
const infoCloseBtn = document.getElementById('infoPanelClose');

const INFO_CONTENT = {
  gameplay: `
    <h3>🎮 玩法说明</h3>

    <strong style="font-size:14px">🕹️ 操作方式</strong><br><br>
    🎯 <strong>点击轨道任意位置</strong><br>
    将当前手牌球 <strong>精准插入</strong> 两颗珠子之间。<br><br>
    ⌨️ 按 <span class="kbd">Space</span> 键切换弹药：<br>
    💧 <strong>水雾喷淋（H₂O）</strong><br>
    🔵 <strong>氧气注入（O₂）</strong><br>
    合理切换元素，维持碳循环平衡。<br><br>

    <strong style="font-size:14px">⚗️ 反应系统</strong><br><br>
    <span style="color:#ff4d4d">🔥 完全燃烧（高排放）</span><br>
    C + O₂ → CO₂<br>
    <span style="font-size:11px;color:var(--muted)">生成大量二氧化碳，会加速污染压力</span><br><br>

    <span style="color:#fbbf24">⚠️ 不完全燃烧</span><br>
    2C + O₂ → CO₂<br>
    <span style="font-size:11px;color:var(--muted)">两碳一氧，直接生成二氧化碳</span><br><br>

    <span style="color:#fbbf24">💨 CO氧化（污染转化）</span><br>
    2CO + O₂ → 2CO₂<br>
    <span style="font-size:11px;color:var(--muted)">有毒 CO 被进一步氧化，但仍会产生 CO₂</span><br><br>

    <span style="color:#7af5b8">🌿 生物碳汇（生态修复）</span><br>
    CO₂ + H₂O → O₂ + 🍎<br>
    <span style="font-size:11px;color:var(--muted)">吸收二氧化碳，释放氧气，获得 🍎 生态积分。这是维持生态平衡的关键机制。</span><br><br>

    <span style="color:#ffd700">💥 三消连锁</span><br>
    ≥3 个相同元素连续相邻 → 自动消除 → 连锁反应与倍率加成<br><br>

    <strong style="font-size:14px">☣️ 胜负规则</strong><br><br>
    <span style="color:#ff4d4d">❌ 污染失控</span><br>
    ⚫ C 到达净化洞 → <strong>堵塞 +1</strong><br>
    ☁️ CO / CO₂ 到达净化洞 → <strong>泄露 +1</strong><br>
    达到上限后：🌍 地球污染超标，游戏失败<br><br>

    <span style="color:#7af5b8">✅ 生存目标</span><br>
    在生态系统崩溃前：控制污染扩散、保持轨道稳定、达成目标生态积分<br><br>

    <strong style="font-size:14px">♻️ 资源机制</strong><br>
    🔵 O₂ / 💧 H₂O 弹药有限<br>
    🌿 可通过「生物碳汇」逐步回收资源。<br><br>

    <span style="color:var(--muted)">🌍 这不仅是一个消除游戏。你正在操控一条不断失衡的"地球碳循环"。</span>
  `,
  lore: `
    <h3>📖 世界观</h3>
    <strong>蓝穹城·排放通道控制室</strong><br>
    所有工厂废气汇入庞大的<strong>中央排放通道</strong>，末端是被称为<strong>"净化洞"</strong>的处理装置。<br><br>

    <strong>你的身份</strong><br>
    你是<strong>碳平衡调控员</strong>，掌控两种调控手段：<br>
    💧 <strong>水雾喷淋</strong>：冷却、吸收、净化废气<br>
    🔵 <strong>氧气注入</strong>：改变局部反应（可控但危险）<br><br>

    <strong>通道中的物质</strong><br>
    ⚫ <strong>C 碳颗粒</strong>：未完全燃烧的煤渣 → 堵塞阀门<br>
    🟠 <strong>CO 一氧化碳</strong>：有毒中间产物 → 泄露中毒<br>
    💨 <strong>CO₂ 二氧化碳</strong>：高压废气 → 密封失效泄露<br>
    🔵 <strong>O₂ 氧气</strong>：注入调控（可控但危险）<br>
    💧 <strong>H₂O 水雾</strong>：喷淋吸收 CO₂<br><br>

    <strong>你的使命</strong><br>
    维持通道畅通、阻止泄露，让工厂运转且不伤害环境。
  `,
};

let infoOpen = false;

infoIcons.addEventListener('click', (e) => {
  e.stopPropagation();
  const btn = e.target.closest('.info-icon-btn');
  if (!btn) return;
  const panel = btn.dataset.panel;

  if (infoOpen && infoPanel.dataset.active === panel) {
    closeInfoPanel();
    return;
  }

  infoContent.innerHTML = INFO_CONTENT[panel] || '';
  infoPanel.dataset.active = panel;
  infoPanel.classList.add('visible');
  infoOpen = true;
});

// 面板自身拦截点击，防止穿透关闭
infoPanel.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
});

infoCloseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeInfoPanel();
});

// 点击面板外关闭
document.addEventListener('pointerdown', (e) => {
  if (infoOpen) {
    const inPanel = e.target.closest('#infoPanel');
    const inIcon  = e.target.closest('#infoIcons');
    if (!inPanel && !inIcon) closeInfoPanel();
  }
});

function closeInfoPanel() {
  infoPanel.classList.remove('visible');
  infoOpen = false;
  infoPanel.dataset.active = '';
}


