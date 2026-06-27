import { r as reactExports, w as jsxRuntimeExports } from "./index-DcHYFhnp.js";
import { i as isCoarsePointer, A as ASSET_SLOTS } from "./index-Cm8oW7Mh.js";
function createCascadeAudio() {
  let ctx = null;
  try {
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (AC) ctx = new AC();
  } catch {
    ctx = null;
  }
  let master = null;
  if (ctx) {
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }
  let clearBuffer = null;
  let clearLoaded = false;
  function resume() {
    if (ctx && ctx.state === "suspended") {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {
        });
      } catch {
      }
    }
  }
  async function loadClear(url) {
    clearLoaded = true;
    if (!ctx || !url || typeof fetch === "undefined") return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      clearBuffer = await ctx.decodeAudioData(arr);
    } catch {
      clearBuffer = null;
    }
  }
  function blip(freq, dur, type, gain, when = 0) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(1e-4, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 6e-3);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function playMove() {
    blip(420, 0.04, "square", 0.05);
  }
  function playRotate() {
    blip(560, 0.05, "triangle", 0.06);
  }
  function playLock() {
    blip(180, 0.07, "square", 0.09);
  }
  function playDrop() {
    blip(120, 0.1, "sawtooth", 0.1);
  }
  function synthClear(lines) {
    if (!ctx || !master) return;
    const n = Math.max(1, Math.min(4, lines));
    const root = 392;
    for (let i = 0; i < n + 1; i++) {
      blip(root * Math.pow(1.18, i), 0.12, "triangle", 0.12, i * 0.05);
    }
  }
  function playClear(lines) {
    resume();
    if (clearBuffer && ctx && master) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = clearBuffer;
        const g = ctx.createGain();
        g.gain.value = 0.9;
        src.connect(g);
        g.connect(master);
        src.start();
        return;
      } catch {
      }
    }
    synthClear(lines);
  }
  function playGameOver() {
    if (!ctx || !master) return;
    const freqs = [330, 262, 196, 147];
    for (let i = 0; i < freqs.length; i++) {
      blip(freqs[i], 0.18, "sawtooth", 0.14, i * 0.12);
    }
  }
  function dispose() {
    if (ctx) {
      try {
        const p = ctx.close();
        if (p && typeof p.catch === "function") p.catch(() => {
        });
      } catch {
      }
      ctx = null;
      master = null;
    }
    clearBuffer = null;
  }
  return {
    get available() {
      return !!ctx;
    },
    get clearLoaded() {
      return clearLoaded;
    },
    resume,
    loadClear,
    playMove,
    playRotate,
    playLock,
    playDrop,
    playClear,
    playGameOver,
    dispose
  };
}
const COLS = 10;
const ROWS = 20;
const PIECE_TYPES = ["I", "O", "T", "S", "Z", "J", "L"];
function colorIndex(type) {
  return PIECE_TYPES.indexOf(type) + 1;
}
function rngNext(state) {
  let a = state | 0;
  a = a + 1831565813 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  const value = ((t ^ t >>> 14) >>> 0) / 4294967296;
  return { value, state: a };
}
const BOX = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 };
const SPAWN_CELLS = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};
function rotateCellCW(x, y, n) {
  return [n - 1 - y, x];
}
const ROTATIONS = {};
for (let p = 0; p < PIECE_TYPES.length; p++) {
  const type = PIECE_TYPES[p];
  const n = BOX[type];
  let cells = SPAWN_CELLS[type].map(([x, y]) => [x, y]);
  ROTATIONS[type] = [];
  for (let r = 0; r < 4; r++) {
    ROTATIONS[type].push(cells.map(([x, y]) => [x, y]));
    cells = cells.map(([x, y]) => rotateCellCW(x, y, n));
  }
}
function rotatedCells(type, rot) {
  return ROTATIONS[type][(rot % 4 + 4) % 4];
}
function spawnCol(type) {
  return Math.floor((COLS - BOX[type]) / 2);
}
function spawnPiece(type) {
  return { type, rot: 0, x: spawnCol(type), y: 0 };
}
function forEachPieceCell(piece, cb) {
  const rel = rotatedCells(piece.type, piece.rot);
  for (let i = 0; i < rel.length; i++) cb(piece.x + rel[i][0], piece.y + rel[i][1]);
}
function createBoard() {
  const board = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) board[r] = new Array(COLS).fill(0);
  return board;
}
function cloneBoard(board) {
  const out = new Array(board.length);
  for (let r = 0; r < board.length; r++) out[r] = board[r].slice();
  return out;
}
function collides(board, piece) {
  const rel = rotatedCells(piece.type, piece.rot);
  for (let i = 0; i < rel.length; i++) {
    const c = piece.x + rel[i][0];
    const r = piece.y + rel[i][1];
    if (c < 0 || c >= COLS) return true;
    if (r >= ROWS) return true;
    if (r >= 0 && board[r][c] !== 0) return true;
  }
  return false;
}
function tryMove(board, piece, dx, dy) {
  const next = { type: piece.type, rot: piece.rot, x: piece.x + dx, y: piece.y + dy };
  return collides(board, next) ? null : next;
}
const KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, 0],
  [2, 0],
  [-1, -1],
  [1, -1],
  [0, -2]
];
function tryRotate(board, piece, dir) {
  const rot = ((piece.rot + (dir > 0 ? 1 : 3)) % 4 + 4) % 4;
  for (let i = 0; i < KICKS.length; i++) {
    const cand = { type: piece.type, rot, x: piece.x + KICKS[i][0], y: piece.y + KICKS[i][1] };
    if (!collides(board, cand)) return cand;
  }
  return null;
}
function hardDropPiece(board, piece) {
  let p = piece;
  let distance = 0;
  for (; ; ) {
    const next = tryMove(board, p, 0, 1);
    if (!next) break;
    p = next;
    distance++;
  }
  return { piece: p, distance };
}
function ghostFor(board, piece) {
  return hardDropPiece(board, piece).piece;
}
function lockPiece(board, piece) {
  const out = cloneBoard(board);
  const color = colorIndex(piece.type);
  const rel = rotatedCells(piece.type, piece.rot);
  for (let i = 0; i < rel.length; i++) {
    const c = piece.x + rel[i][0];
    const r = piece.y + rel[i][1];
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) out[r][c] = color;
  }
  return out;
}
function isRowFull(row) {
  for (let c = 0; c < row.length; c++) if (row[c] === 0) return false;
  return true;
}
function clearLines(board) {
  const kept = [];
  const rows = [];
  for (let r = 0; r < board.length; r++) {
    if (isRowFull(board[r])) rows.push(r);
    else kept.push(board[r].slice());
  }
  const cleared = rows.length;
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
  return { board: kept, cleared, rows };
}
function refillQueue(queue, rngState, min = 7) {
  const q = queue.slice();
  let state = rngState;
  while (q.length < min) {
    const bag = PIECE_TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const step = rngNext(state);
      state = step.state;
      const j = Math.floor(step.value * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    for (let i = 0; i < bag.length; i++) q.push(bag[i]);
  }
  return { queue: q, state };
}
const LINE_SCORES = [0, 100, 300, 500, 800];
function levelForLines(lines) {
  return 1 + Math.floor(lines / 10);
}
function scoreForClear(cleared, level) {
  const base = LINE_SCORES[Math.min(cleared, 4)] || 0;
  return base * level;
}
function gravityMs(level) {
  return Math.max(60, Math.round(800 - (level - 1) * 65));
}
function createGame(seed = 2654435761) {
  const init = refillQueue([], seed >>> 0, 7);
  const type = init.queue[0];
  const queue = init.queue.slice(1);
  const board = createBoard();
  const piece = spawnPiece(type);
  return {
    board,
    piece,
    ghost: ghostFor(board, piece),
    queue,
    // upcoming piece types (queue[0] is "next")
    rngState: init.state,
    score: 0,
    lines: 0,
    level: 1,
    cleared: 0,
    // lines cleared by the LAST lock (for the component's flash)
    clearedRows: [],
    // their row indices
    pieces: 0,
    // pieces locked (stat)
    over: false
  };
}
function withGhost(game) {
  return { ...game, ghost: ghostFor(game.board, game.piece) };
}
function spawnNext(game, board) {
  let queue = game.queue;
  let rngState = game.rngState;
  if (queue.length < 1) {
    const r = refillQueue(queue, rngState, 7);
    queue = r.queue;
    rngState = r.state;
  }
  const type = queue[0];
  const rest = queue.slice(1);
  const refilled = refillQueue(rest, rngState, 7);
  const piece = spawnPiece(type);
  const over = collides(board, piece);
  return {
    ...game,
    board,
    piece,
    ghost: ghostFor(board, piece),
    queue: refilled.queue,
    rngState: refilled.state,
    over
  };
}
function moveLeft(game) {
  if (game.over) return game;
  const next = tryMove(game.board, game.piece, -1, 0);
  return next ? withGhost({ ...game, piece: next }) : game;
}
function moveRight(game) {
  if (game.over) return game;
  const next = tryMove(game.board, game.piece, 1, 0);
  return next ? withGhost({ ...game, piece: next }) : game;
}
function rotateGame(game, dir) {
  if (game.over) return game;
  const next = tryRotate(game.board, game.piece, dir);
  return next ? withGhost({ ...game, piece: next }) : game;
}
function dropStep(game, soft = false) {
  if (game.over) return { game, moved: false };
  const next = tryMove(game.board, game.piece, 0, 1);
  if (!next) return { game, moved: false };
  const g = withGhost({ ...game, piece: next, score: game.score + (soft ? 1 : 0) });
  return { game: g, moved: true };
}
function lockAndSpawn(game) {
  if (game.over) return game;
  const locked = lockPiece(game.board, game.piece);
  const { board, cleared, rows } = clearLines(locked);
  const lines = game.lines + cleared;
  const level = levelForLines(lines);
  const score = game.score + scoreForClear(cleared, game.level);
  const base = {
    ...game,
    score,
    lines,
    level,
    cleared,
    clearedRows: rows,
    pieces: game.pieces + 1
  };
  return spawnNext(base, board);
}
function hardDrop(game) {
  if (game.over) return game;
  const { piece, distance } = hardDropPiece(game.board, game.piece);
  const dropped = { ...game, piece, score: game.score + distance * 2 };
  return lockAndSpawn(dropped);
}
const DAS_MS = 150;
const ARR_MS = 45;
const SOFT_DROP_MS = 45;
const LOCK_DELAY_MS = 480;
const MAX_LOCK_RESETS = 15;
const CLEAR_FLASH_MS = 320;
const SEED = 1511506142;
const STICKER_COLORS = ["#ffd23b", "#36ff9e", "#00e0c6", "#ff8a3b"];
const PIECE_COLORS = [
  "#0a0a14",
  // 0 — empty (unused as a fill)
  "#36d6ff",
  // I — cyan
  "#ffd23b",
  // O — gold
  "#ff5cf4",
  // T — magenta
  "#36ff9e",
  // S — green
  "#ff3b6b",
  // Z — red
  "#5a8bff",
  // J — blue
  "#ff8a3b"
  // L — orange
];
function perfNow() {
  return typeof performance !== "undefined" ? performance.now() : 0;
}
function usePrefersReducedMotion() {
  const [reduced, setReduced] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return void 0;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}
function CascadeGame({ onExit }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = reactExports.useState(() => isCoarsePointer());
  const canvasRef = reactExports.useRef(null);
  const rootRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const mountedRef = reactExports.useRef(true);
  const reducedRef = reactExports.useRef(reducedMotion);
  const onExitRef = reactExports.useRef(onExit);
  const actionRef = reactExports.useRef(null);
  const gRef = reactExports.useRef(null);
  if (gRef.current === null) {
    gRef.current = {
      game: createGame(SEED),
      // input/timing state (component-owned; engine stays pure)
      seed: SEED,
      dropAcc: 0,
      // ms accumulator toward the next gravity step
      landed: false,
      // resting on the stack (lock-delay armed)
      lockAt: 0,
      // timestamp the piece will lock at (0 = not armed)
      lockResets: 0,
      // move/rotate lock-delay resets used this piece
      lowestRow: -Infinity,
      // deepest piece.y reached this spawn (anti-stall baseline)
      softHeld: false,
      hDir: 0,
      // held horizontal: -1, 0, +1
      hSince: 0,
      // when the hold began (for DAS)
      hNext: 0,
      // next auto-repeat time
      clearFlashAt: 0,
      // line-clear feedback start
      clearCount: 0,
      // lines cleared in the last lock
      paused: false,
      pauseStart: 0,
      // perfNow() when the current pause began (for timer rebasing)
      // cached HUD strings (rebuilt only when the value changes)
      _score: -1,
      _scoreStr: "",
      _lines: -1,
      _linesStr: "",
      _level: -1,
      _levelStr: "",
      _compactA: "",
      _compactB: ""
      // cached compact-mode HUD lines
    };
  }
  const [over, setOver] = reactExports.useState(false);
  reactExports.useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);
  reactExports.useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  reactExports.useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext("2d") : null;
    const audio = createCascadeAudio();
    audio.loadClear(ASSET_SLOTS.audio.stackClear);
    let bezelImg = null;
    let bezelLoader = null;
    if (typeof Image !== "undefined" && ASSET_SLOTS.textures && ASSET_SLOTS.textures.stackCabinet) {
      bezelLoader = new Image();
      bezelLoader.onload = () => {
        bezelImg = bezelLoader;
      };
      bezelLoader.onerror = () => {
        bezelImg = null;
      };
      bezelLoader.src = ASSET_SLOTS.textures.stackCabinet;
    }
    try {
      const el = rootRef.current;
      if (el && el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && typeof p.catch === "function") p.catch(() => {
        });
      }
    } catch {
    }
    let W = 0;
    let H = 0;
    let baseGrad = null;
    const layout = {
      cell: 22,
      boardLeft: 0,
      boardTop: 0,
      boardW: 0,
      boardH: 0,
      panelLeft: 0,
      panelW: 0,
      compact: false,
      bezel: 14,
      // bezel thickness around the screen
      titleFont: "",
      labelFont: "",
      valueFont: "",
      hudFont: "",
      bigFont: ""
    };
    const relayout = () => {
      if (!W || !H) return;
      const compact = W < 720;
      const availH = H * (compact ? 0.74 : 0.84);
      const panelW = compact ? 0 : Math.max(132, Math.min(220, W * 0.18));
      const gap = compact ? 0 : Math.max(16, W * 0.02);
      const availW = W * 0.96 - panelW - gap;
      const cell = Math.max(12, Math.floor(Math.min(availH / ROWS, availW / COLS)));
      const boardW = cell * COLS;
      const boardH = cell * ROWS;
      const bezel = Math.max(10, Math.round(cell * 0.55));
      const totalW = boardW + (compact ? 0 : gap + panelW);
      const groupLeft = Math.round((W - totalW) / 2);
      layout.cell = cell;
      layout.bezel = bezel;
      layout.boardW = boardW;
      layout.boardH = boardH;
      layout.boardLeft = groupLeft;
      layout.boardTop = Math.round(Math.max(H * (compact ? 0.16 : 0.09), (H - boardH) / 2));
      layout.compact = compact;
      layout.panelW = panelW;
      layout.panelLeft = groupLeft + boardW + gap;
      layout.titleFont = `800 ${Math.max(18, Math.round(cell * 1.1))}px 'Courier New', monospace`;
      layout.labelFont = `700 ${Math.max(11, Math.round(cell * 0.52))}px 'Courier New', monospace`;
      layout.valueFont = `800 ${Math.max(16, Math.round(cell * 0.82))}px 'Courier New', monospace`;
      layout.hudFont = "700 13px 'Courier New', monospace";
      layout.bigFont = `800 ${Math.max(26, Math.min(64, W * 0.06))}px 'Courier New', monospace`;
    };
    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        baseGrad = ctx.createLinearGradient(0, 0, 0, H);
        baseGrad.addColorStop(0, "#0a0524");
        baseGrad.addColorStop(0.6, "#0b0626");
        baseGrad.addColorStop(1, "#04020c");
      }
      relayout();
    };
    resize();
    window.addEventListener("resize", resize);
    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    function drawSticker(x, y, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    function drawStat(label, value, color, sx, sy, lh) {
      ctx.fillStyle = "#7f93c4";
      ctx.font = layout.labelFont;
      ctx.fillText(label, sx, sy);
      ctx.fillStyle = color;
      ctx.font = layout.valueFont;
      ctx.fillText(value, sx, sy + lh);
    }
    function drawCell(px, py, size, color, reduced, filled, alpha) {
      const inset = Math.max(1, size * 0.06);
      const s = size - inset * 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (filled) {
        ctx.fillStyle = color;
        if (!reduced) {
          ctx.shadowColor = color;
          ctx.shadowBlur = size * 0.4;
        }
        roundRect(px + inset, py + inset, s, s, size * 0.16);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        roundRect(px + inset * 1.6, py + inset * 1.6, s * 0.42, s * 0.42, size * 0.1);
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, size * 0.07);
        ctx.globalAlpha = alpha;
        roundRect(px + inset, py + inset, s, s, size * 0.16);
        ctx.stroke();
      }
      ctx.restore();
    }
    let dpCell = 0, dpColor = "#fff", dpReduced = false, dpFilled = true, dpAlpha = 1;
    const drawActiveCb = (c, r) => {
      if (r < 0) return;
      const px = layout.boardLeft + c * dpCell;
      const py = layout.boardTop + r * dpCell;
      drawCell(px, py, dpCell, dpColor, dpReduced, dpFilled, dpAlpha);
    };
    let pvCell = 0, pvOx = 0, pvOy = 0, pvColor = "#fff", pvReduced = false;
    const previewCb = (c, r) => {
      drawCell(pvOx + c * pvCell, pvOy + r * pvCell, pvCell, pvColor, pvReduced, true, 1);
    };
    const previewPiece = { type: "I", rot: 0, x: 0, y: 0 };
    let nbMinX = 0, nbMinY = 0, nbMaxX = 0, nbMaxY = 0;
    const boundsCb = (c, r) => {
      if (c < nbMinX) nbMinX = c;
      if (c > nbMaxX) nbMaxX = c;
      if (r < nbMinY) nbMinY = r;
      if (r > nbMaxY) nbMaxY = r;
    };
    function computeNextBounds(type) {
      previewPiece.type = type;
      previewPiece.rot = 0;
      previewPiece.x = 0;
      previewPiece.y = 0;
      nbMinX = 9;
      nbMinY = 9;
      nbMaxX = -9;
      nbMaxY = -9;
      forEachPieceCell(previewPiece, boundsCb);
    }
    function drawCabinetFrame() {
      const bz = layout.bezel;
      const bx = layout.boardLeft - bz;
      const by = layout.boardTop - bz;
      const bw = layout.boardW + bz * 2;
      const bh = layout.boardH + bz * 2;
      ctx.save();
      if (bezelImg) {
        try {
          ctx.drawImage(bezelImg, bx - bz, by - bz * 1.6, bw + bz * 2, bh + bz * 3);
        } catch {
        }
      } else {
        ctx.fillStyle = "#160a2c";
        roundRect(bx, by, bw, bh, bz * 0.9);
        ctx.fill();
        ctx.lineWidth = Math.max(2, bz * 0.32);
        ctx.strokeStyle = "#ff5cf4";
        if (!reducedRef.current) {
          ctx.shadowColor = "#ff5cf4";
          ctx.shadowBlur = bz;
        }
        roundRect(bx, by, bw, bh, bz * 0.9);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#36d6ff";
        ctx.lineWidth = Math.max(1, bz * 0.14);
        roundRect(bx + bz * 0.35, by + bz * 0.35, bw - bz * 0.7, bh - bz * 0.7, bz * 0.7);
        ctx.stroke();
        const sr = bz * 0.5;
        const sIn = bz * 0.9;
        ctx.globalAlpha = 0.85;
        drawSticker(bx + sIn, by + sIn, sr, STICKER_COLORS[0]);
        drawSticker(bx + bw - sIn, by + sIn, sr, STICKER_COLORS[1]);
        drawSticker(bx + sIn, by + bh - sIn, sr, STICKER_COLORS[2]);
        drawSticker(bx + bw - sIn, by + bh - sIn, sr, STICKER_COLORS[3]);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    function drawBoardBackground() {
      ctx.fillStyle = "#06030f";
      ctx.fillRect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
      ctx.strokeStyle = "rgba(120,140,200,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < COLS; c++) {
        const x = layout.boardLeft + c * layout.cell;
        ctx.moveTo(x, layout.boardTop);
        ctx.lineTo(x, layout.boardTop + layout.boardH);
      }
      for (let r = 1; r < ROWS; r++) {
        const y = layout.boardTop + r * layout.cell;
        ctx.moveTo(layout.boardLeft, y);
        ctx.lineTo(layout.boardLeft + layout.boardW, y);
      }
      ctx.stroke();
    }
    function drawSidePanel(g) {
      const cell = layout.cell;
      const reduced = reducedRef.current;
      const compact = layout.compact;
      let bx;
      let by;
      let bw;
      let bh;
      if (compact) {
        bw = cell * 4.2;
        bh = cell * 3.2;
        bx = layout.boardLeft + layout.boardW - bw;
        by = layout.boardTop - layout.bezel - bh - 6;
        if (by < 4) by = 4;
      } else {
        bw = layout.panelW;
        bh = cell * 4.4;
        bx = layout.panelLeft;
        by = layout.boardTop;
      }
      ctx.save();
      ctx.fillStyle = "rgba(14,8,38,0.85)";
      ctx.strokeStyle = "#2a1d66";
      ctx.lineWidth = 1.5;
      roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#9bb4e8";
      ctx.font = layout.labelFont;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("NEXT", bx + 10, by + 8);
      const nextType = g.queue[0];
      if (nextType) {
        computeNextBounds(nextType);
        pvCell = Math.min((bw - 24) / 4, (bh - cell) / 3.2);
        const pw = (nbMaxX - nbMinX + 1) * pvCell;
        const ph = (nbMaxY - nbMinY + 1) * pvCell;
        pvOx = bx + (bw - pw) / 2 - nbMinX * pvCell;
        pvOy = by + cell * 0.9 + (bh - cell - ph) / 2 - nbMinY * pvCell;
        pvColor = PIECE_COLORS[colorIndex(nextType)];
        pvReduced = reduced;
        forEachPieceCell(previewPiece, previewCb);
      }
      ctx.restore();
      if (g.score !== g._score) {
        g._score = g.score;
        g._scoreStr = String(g.score).padStart(6, "0");
        g._compactA = `SCORE ${g._scoreStr}`;
      }
      let lvChanged = false;
      if (g.lines !== g._lines) {
        g._lines = g.lines;
        g._linesStr = String(g.lines);
        lvChanged = true;
      }
      if (g.level !== g._level) {
        g._level = g.level;
        g._levelStr = String(g.level);
        lvChanged = true;
      }
      if (lvChanged) g._compactB = `LINES ${g._linesStr}   LV ${g._levelStr}`;
      ctx.save();
      ctx.textBaseline = "top";
      if (compact) {
        ctx.textAlign = "left";
        ctx.font = layout.hudFont;
        const hy = Math.max(6, layout.boardTop - layout.bezel - 40);
        ctx.fillStyle = "#cfe6ff";
        ctx.fillText(g._compactA, layout.boardLeft, hy);
        ctx.fillStyle = "#9bb4e8";
        ctx.fillText(g._compactB, layout.boardLeft, hy + 18);
      } else {
        const sx = layout.panelLeft + 6;
        const step = Math.max(46, cell * 1.7);
        const lh = Math.max(14, cell * 0.55);
        let sy = layout.boardTop + cell * 4.4 + 18;
        drawStat("SCORE", g._scoreStr, "#cfe6ff", sx, sy, lh);
        sy += step;
        drawStat("LINES", g._linesStr, "#36ff9e", sx, sy, lh);
        sy += step;
        drawStat("LEVEL", g._levelStr, "#ffd23b", sx, sy, lh);
      }
      ctx.restore();
    }
    function drawTitle() {
      if (layout.compact) return;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = layout.titleFont;
      ctx.fillStyle = "#ff5cf4";
      if (!reducedRef.current) {
        ctx.shadowColor = "#ff48c4";
        ctx.shadowBlur = 18;
      }
      ctx.fillText("CASCADE", layout.boardLeft + layout.boardW / 2, layout.boardTop - layout.bezel - 14);
      ctx.restore();
    }
    function draw() {
      if (!ctx) return;
      const g = gRef.current.game;
      const reduced = reducedRef.current;
      const tNow = perfNow();
      const cell = layout.cell;
      ctx.fillStyle = baseGrad || "#05010f";
      ctx.fillRect(0, 0, W, H);
      drawTitle();
      drawCabinetFrame();
      drawBoardBackground();
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
      ctx.clip();
      const board = g.board;
      for (let r = 0; r < ROWS; r++) {
        const row = board[r];
        const py = layout.boardTop + r * cell;
        for (let c = 0; c < COLS; c++) {
          const v = row[c];
          if (v !== 0) {
            drawCell(layout.boardLeft + c * cell, py, cell, PIECE_COLORS[v], reduced, true, 1);
          }
        }
      }
      if (!g.over) {
        dpCell = cell;
        dpReduced = reduced;
        dpFilled = false;
        dpAlpha = reduced ? 0.5 : 0.35;
        dpColor = PIECE_COLORS[colorIndex(g.piece.type)];
        forEachPieceCell(g.ghost, drawActiveCb);
        dpFilled = true;
        dpAlpha = 1;
        forEachPieceCell(g.piece, drawActiveCb);
      }
      if (gRef.current.clearFlashAt) {
        const age = tNow - gRef.current.clearFlashAt;
        if (age < CLEAR_FLASH_MS) {
          const k = 1 - age / CLEAR_FLASH_MS;
          ctx.save();
          ctx.globalAlpha = (reduced ? 0.3 : 0.55) * k;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
          ctx.restore();
        } else {
          gRef.current.clearFlashAt = 0;
        }
      }
      ctx.restore();
      drawSidePanel(g);
      if (gRef.current.paused && !g.over) {
        ctx.save();
        ctx.globalAlpha = 0.66;
        ctx.fillStyle = "#05010f";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#bfe9ff";
        ctx.font = layout.bigFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PAUSED", W / 2, H / 2);
        ctx.restore();
      }
      if (g.over) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#0a0414";
        ctx.fillRect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
        ctx.restore();
      }
    }
    function groundLock(now) {
      const s = gRef.current;
      const y = s.game.piece.y;
      if (y > s.lowestRow) {
        s.lowestRow = y;
        s.landed = true;
        s.lockAt = now + LOCK_DELAY_MS;
      } else if (!s.landed) {
        if (s.lockResets < MAX_LOCK_RESETS) {
          s.lockResets += 1;
          s.landed = true;
          s.lockAt = now + LOCK_DELAY_MS;
        } else {
          s.landed = true;
          if (!s.lockAt) s.lockAt = now;
        }
      } else if (s.lockResets < MAX_LOCK_RESETS) {
        s.lockResets += 1;
        s.lockAt = now + LOCK_DELAY_MS;
      }
    }
    function reLand(now) {
      const s = gRef.current;
      const g = s.game;
      if (tryMove(g.board, g.piece, 0, 1) === null) groundLock(now);
      else {
        s.landed = false;
        s.lockAt = 0;
      }
    }
    function bumpLock(now) {
      reLand(now);
    }
    function afterSpawn(now) {
      const s = gRef.current;
      s.dropAcc = 0;
      s.landed = false;
      s.lockAt = 0;
      s.lockResets = 0;
      s.lowestRow = -Infinity;
      reLand(now);
      if (s.game.over) {
        audio.playGameOver();
        if (mountedRef.current) setOver(true);
      }
    }
    function performLock(now) {
      const s = gRef.current;
      s.game = lockAndSpawn(s.game);
      if (s.game.cleared > 0) {
        s.clearFlashAt = now;
        s.clearCount = s.game.cleared;
        audio.playClear(s.game.cleared);
      } else {
        audio.playLock();
      }
      afterSpawn(now);
    }
    function doMoveH(dir, now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      audio.resume();
      const prev = s.game;
      s.game = dir < 0 ? moveLeft(prev) : moveRight(prev);
      if (s.game !== prev) {
        audio.playMove();
        bumpLock(now);
      }
    }
    function doRotate(dir, now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      audio.resume();
      const prev = s.game;
      s.game = rotateGame(prev, dir);
      if (s.game !== prev) {
        audio.playRotate();
        bumpLock(now);
      }
    }
    function doSoftStep(now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      const r = dropStep(s.game, true);
      if (r.moved) {
        s.game = r.game;
        s.landed = false;
        s.lockAt = 0;
      } else {
        reLand(now);
      }
    }
    function doHardDrop(now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      audio.resume();
      audio.playDrop();
      s.game = hardDrop(s.game);
      if (s.game.cleared > 0) {
        s.clearFlashAt = now;
        s.clearCount = s.game.cleared;
        audio.playClear(s.game.cleared);
      }
      afterSpawn(now);
    }
    function restart() {
      const s = gRef.current;
      s.seed = s.seed * 1664525 + 1013904223 >>> 0;
      s.game = createGame(s.seed);
      s.dropAcc = 0;
      s.landed = false;
      s.lockAt = 0;
      s.lockResets = 0;
      s.lowestRow = -Infinity;
      s.softHeld = false;
      s.hDir = 0;
      s.clearFlashAt = 0;
      s.paused = false;
      s.pauseStart = 0;
      if (mountedRef.current) setOver(false);
    }
    function setPaused(next, now) {
      const s = gRef.current;
      if (s.game.over) return;
      if (next === s.paused) return;
      if (next) {
        s.paused = true;
        s.pauseStart = now;
      } else {
        const elapsed = now - s.pauseStart;
        if (s.lockAt) s.lockAt += elapsed;
        if (s.hDir !== 0) s.hNext += elapsed;
        s.paused = false;
      }
    }
    actionRef.current = {
      moveLeft: () => doMoveH(-1, perfNow()),
      moveRight: () => doMoveH(1, perfNow()),
      rotateCW: () => doRotate(1, perfNow()),
      rotateCCW: () => doRotate(-1, perfNow()),
      softDrop: () => doSoftStep(perfNow()),
      softHeldOn: () => {
        gRef.current.softHeld = true;
      },
      softHeldOff: () => {
        gRef.current.softHeld = false;
      },
      hardDrop: () => doHardDrop(perfNow()),
      togglePause: () => setPaused(!gRef.current.paused, perfNow()),
      restart
    };
    const keyDown = /* @__PURE__ */ new Set();
    const onKeyDown = (e) => {
      const code = e.code;
      const now = perfNow();
      const s = gRef.current;
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          e.preventDefault();
          e.stopPropagation();
          if (!keyDown.has(code)) {
            keyDown.add(code);
            s.hDir = -1;
            s.hSince = now;
            s.hNext = now + DAS_MS;
            doMoveH(-1, now);
          }
          break;
        case "ArrowRight":
        case "KeyD":
          e.preventDefault();
          e.stopPropagation();
          if (!keyDown.has(code)) {
            keyDown.add(code);
            s.hDir = 1;
            s.hSince = now;
            s.hNext = now + DAS_MS;
            doMoveH(1, now);
          }
          break;
        case "ArrowUp":
        case "KeyW":
        case "KeyX":
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) doRotate(1, now);
          break;
        case "KeyZ":
        case "ControlLeft":
        case "ControlRight":
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) doRotate(-1, now);
          break;
        case "ArrowDown":
        case "KeyS":
          e.preventDefault();
          e.stopPropagation();
          s.softHeld = true;
          if (!keyDown.has(code)) {
            keyDown.add(code);
            doSoftStep(now);
            s.dropAcc = 0;
          }
          break;
        case "Space":
          e.preventDefault();
          e.stopPropagation();
          if (!keyDown.has(code)) {
            keyDown.add(code);
            doHardDrop(now);
          }
          break;
        case "KeyP":
          e.preventDefault();
          e.stopPropagation();
          setPaused(!s.paused, now);
          break;
        case "KeyR":
          e.preventDefault();
          e.stopPropagation();
          if (s.game.over) restart();
          break;
      }
    };
    const onKeyUp = (e) => {
      const code = e.code;
      const s = gRef.current;
      keyDown.delete(code);
      if ((code === "ArrowLeft" || code === "KeyA") && s.hDir === -1) s.hDir = 0;
      if ((code === "ArrowRight" || code === "KeyD") && s.hDir === 1) s.hDir = 0;
      if (s.hDir === 0) {
        if (keyDown.has("ArrowLeft") || keyDown.has("KeyA")) {
          s.hDir = -1;
          s.hSince = perfNow();
          s.hNext = perfNow() + DAS_MS;
        } else if (keyDown.has("ArrowRight") || keyDown.has("KeyD")) {
          s.hDir = 1;
          s.hSince = perfNow();
          s.hNext = perfNow() + DAS_MS;
        }
      }
      if (code === "ArrowDown" || code === "KeyS") {
        if (!keyDown.has("ArrowDown") && !keyDown.has("KeyS")) s.softHeld = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    let gesture = null;
    const onPointerDown = (e) => {
      gesture = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: perfNow(), moved: 0, col: 0 };
      audio.resume();
    };
    const onPointerMove = (e) => {
      if (!gesture) return;
      const stepPx = Math.max(20, layout.cell * 0.9);
      let dx = e.clientX - gesture.x;
      while (dx >= stepPx) {
        doMoveH(1, perfNow());
        gesture.x += stepPx;
        gesture.moved += 1;
        dx -= stepPx;
      }
      while (dx <= -stepPx) {
        doMoveH(-1, perfNow());
        gesture.x -= stepPx;
        gesture.moved += 1;
        dx += stepPx;
      }
      const dy = e.clientY - gesture.y;
      if (dy >= stepPx) {
        doSoftStep(perfNow());
        gesture.y += stepPx;
        gesture.moved += 1;
      }
    };
    const onPointerUp = (e) => {
      if (!gesture) return;
      const totalY = e.clientY - gesture.y0;
      const totalX = e.clientX - gesture.x0;
      const dt = perfNow() - gesture.t;
      const moved = gesture.moved;
      gesture = null;
      const s = gRef.current;
      if (s.game.over) {
        restart();
        return;
      }
      if (totalY > layout.cell * 3 && Math.abs(totalX) < layout.cell * 1.5 && dt < 250) {
        doHardDrop(perfNow());
        return;
      }
      if (moved === 0 && Math.abs(totalX) < 18 && Math.abs(totalY) < 18) {
        doRotate(1, perfNow());
      }
    };
    if (canvas) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
    }
    let lastTime = perfNow();
    function frame() {
      if (!mountedRef.current) return;
      const now = perfNow();
      let dt = now - lastTime;
      lastTime = now;
      if (dt > 100) dt = 100;
      const s = gRef.current;
      const g = s.game;
      if (!g.over && !s.paused) {
        if (s.hDir !== 0 && now >= s.hNext) {
          doMoveH(s.hDir, now);
          s.hNext = now + ARR_MS;
        }
        s.dropAcc += dt;
        const interval = s.softHeld ? SOFT_DROP_MS : gravityMs(g.level);
        let steps = 0;
        while (s.dropAcc >= interval && steps < 4) {
          s.dropAcc -= interval;
          steps += 1;
          const r = dropStep(s.game, s.softHeld);
          if (r.moved) {
            s.game = r.game;
            s.landed = false;
            s.lockAt = 0;
          } else {
            reLand(now);
            break;
          }
        }
        if (s.landed && s.lockAt && now >= s.lockAt) {
          performLock(now);
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }
    reLand(perfNow());
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (canvas) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      }
      actionRef.current = null;
      if (bezelLoader) {
        bezelLoader.onload = null;
        bezelLoader.onerror = null;
        bezelLoader = null;
      }
      audio.dispose();
      try {
        if (typeof document !== "undefined" && document.fullscreenElement) {
          const p = document.exitFullscreen();
          if (p && typeof p.catch === "function") p.catch(() => {
          });
        }
      } catch {
      }
    };
  }, []);
  const handleExit = reactExports.useCallback(() => {
    if (onExitRef.current) onExitRef.current();
  }, []);
  const act = reactExports.useCallback((name) => {
    const a = actionRef.current;
    if (a && a[name]) a[name]();
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: rootRef,
      role: "application",
      "aria-label": "CASCADE stacking game",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "#04020c",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: canvasRef, style: { position: "absolute", inset: 0, display: "block" }, "aria-hidden": true }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleExit,
            style: {
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 5,
              color: "#fff",
              background: "rgba(255,59,107,0.85)",
              border: "1px solid #ff3b6b",
              borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "monospace",
              fontWeight: 700,
              cursor: "pointer"
            },
            children: "EXIT ✕"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "absolute",
              bottom: coarse ? 168 : 22,
              left: "50%",
              transform: "translateX(-50%)",
              color: "#8aa0c8",
              fontFamily: "monospace",
              fontSize: 12,
              textAlign: "center",
              pointerEvents: "none",
              zIndex: 2,
              textShadow: "0 0 8px #000",
              maxWidth: "92vw"
            },
            children: coarse ? "swipe ← → to move · swipe ↓ to drop · tap to rotate · use the pad below · ESC to exit" : "← → move · ↑/X rotate · Z rotate ccw · ↓ soft drop · Space hard drop · P pause · R restart · ESC exit"
          }
        ),
        coarse && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            "aria-label": "pause",
            onClick: () => act("togglePause"),
            style: {
              position: "absolute",
              top: 14,
              left: 14,
              zIndex: 5,
              color: "#bfe9ff",
              background: "rgba(20,12,46,0.82)",
              border: "1px solid #2a1d66",
              borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "monospace",
              fontWeight: 700,
              cursor: "pointer"
            },
            children: "⏸ PAUSE"
          }
        ),
        coarse && /* @__PURE__ */ jsxRuntimeExports.jsx(ControlPad, { onAct: act }),
        over && /* @__PURE__ */ jsxRuntimeExports.jsx(GameOverPanel, { game: gRef.current.game, onRestart: () => act("restart"), onExit: handleExit })
      ]
    }
  );
}
function ControlPad({ onAct }) {
  const baseStyle = {
    width: 52,
    height: 52,
    borderRadius: 12,
    border: "1px solid #2a1d66",
    background: "rgba(20,12,46,0.82)",
    color: "#bfe9ff",
    fontFamily: "monospace",
    fontSize: 19,
    fontWeight: 800,
    touchAction: "none",
    cursor: "pointer"
  };
  const tap = (label, name, aria, extra) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      "aria-label": aria,
      onPointerDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        onAct(name);
      },
      style: { ...baseStyle, ...extra },
      children: label
    }
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        position: "absolute",
        bottom: 22,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-between",
        padding: "0 14px",
        zIndex: 4,
        pointerEvents: "none"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 6, pointerEvents: "auto" }, children: [
          tap("←", "moveLeft", "move left"),
          tap("→", "moveRight", "move right"),
          tap("⟲", "rotateCCW", "rotate counter-clockwise"),
          tap("⟳", "rotateCW", "rotate clockwise")
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 6, pointerEvents: "auto" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              "aria-label": "soft drop",
              onPointerDown: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onAct("softHeldOn");
              },
              onPointerUp: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onAct("softHeldOff");
              },
              onPointerLeave: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onAct("softHeldOff");
              },
              onPointerCancel: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onAct("softHeldOff");
              },
              style: baseStyle,
              children: "↓"
            }
          ),
          tap("⤓", "hardDrop", "hard drop", { background: "rgba(54,214,255,0.22)", borderColor: "#36d6ff" })
        ] })
      ]
    }
  );
}
function GameOverPanel({ game, onRestart, onExit }) {
  const restartRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (restartRef.current) {
      try {
        restartRef.current.focus();
      } catch {
      }
    }
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "CASCADE game over",
      style: {
        position: "absolute",
        inset: 0,
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        pointerEvents: "none"
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          style: {
            pointerEvents: "auto",
            textAlign: "center",
            background: "rgba(8,4,22,0.9)",
            border: "1px solid #ff3b6b",
            borderRadius: 14,
            padding: "26px 34px",
            fontFamily: "monospace",
            boxShadow: "0 0 40px rgba(255,59,107,0.35)"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { color: "#ff5cf4", fontWeight: 800, fontSize: 30, letterSpacing: 2 }, children: "STACK TOPPED OUT" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { color: "#cfe6ff", fontSize: 15, marginTop: 10 }, children: [
              "score ",
              String(game.score).padStart(6, "0"),
              " · lines ",
              game.lines,
              " · level ",
              game.level
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  ref: restartRef,
                  onClick: onRestart,
                  style: {
                    color: "#04130c",
                    background: "#36ff9e",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    fontFamily: "monospace",
                    fontWeight: 800,
                    cursor: "pointer"
                  },
                  children: "RESTART ↺"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: onExit,
                  style: {
                    color: "#fff",
                    background: "rgba(255,59,107,0.85)",
                    border: "1px solid #ff3b6b",
                    borderRadius: 8,
                    padding: "10px 20px",
                    fontFamily: "monospace",
                    fontWeight: 800,
                    cursor: "pointer"
                  },
                  children: "EXIT ✕"
                }
              )
            ] })
          ]
        }
      )
    }
  );
}
export {
  CascadeGame as default
};
//# sourceMappingURL=CascadeGame-DlhxSyRc.js.map
