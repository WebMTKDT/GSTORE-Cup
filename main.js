/**
 * GSTORE CUP — Motor de juego arcade 2D (Vanilla JS)
 * Vista cenital · 5v5 · Física simplificada · IA visitante
 */

// ═══════════════════════════════════════════
// CONFIGURACIÓN Y CONSTANTES
// ═══════════════════════════════════════════

const GSTORE_BRANCHES = [
  'GSTORE Tijuana',
  'GSTORE San Diego',
  'GSTORE Monterrey',
  'GSTORE CDMX'
];

const STORAGE_KEY = 'gstoreCupLeaderboard';
const MATCH_DURATION = 180; // 3:00 en segundos

// Dimensiones lógicas del canvas (se escalan al contenedor)
const FIELD = { w: 1400, h: 800 };
const GOAL = { w: 20, h: 180, margin: 30 };
const BALL_R = 11;
const PLAYER_R = 18;
const FRICTION = 0.985;
const BALL_FRICTION = 0.992;
const PLAYER_SPEED = 3.8;
const AI_SPEED = 3.2;
const PASS_FORCE = 14;
const SHOOT_BASE = 16;
const SHOOT_MAX = 28;
const TACKLE_FORCE = 8;
const TACKLE_RANGE = 42;
const POSSESS_DIST = PLAYER_R + BALL_R + 4;
const INTERCEPT_RANGE = 120;

// Colores de cancha
const COLORS = {
  grass1: '#2c7a3f',
  grass2: '#4caf50',
  lines: '#e6e6e6',
  ball: '#ffffff',
  home: '#ec7700',
  away: '#5b9bd5',
  metal: '#a6a6a6',
  shadow: 'rgba(0,0,0,0.25)'
};

// ═══════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════

const AppState = {
  current: 'INIT', // INIT | SELECTION | GAME | LEADERBOARD
  homeTeam: null,
  awayTeam: null,
  leaderboard: {}
};

let game = null; // instancia activa del partido

// ═══════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const views = {
  start: $('#view-start'),
  selection: $('#view-selection'),
  game: $('#view-game'),
  leaderboard: $('#view-leaderboard')
};

// ═══════════════════════════════════════════
// LOCALSTORAGE / LEADERBOARD
// ═══════════════════════════════════════════

function defaultLeaderboard() {
  const data = {};
  GSTORE_BRANCHES.forEach((b) => { data[b] = { points: 0 }; });
  return data;
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLeaderboard();
    const parsed = JSON.parse(raw);
    // Asegurar que todas las sucursales existan
    const data = defaultLeaderboard();
    GSTORE_BRANCHES.forEach((b) => {
      if (parsed[b]) data[b].points = parsed[b].points || 0;
    });
    return data;
  } catch {
    return defaultLeaderboard();
  }
}

function saveLeaderboard() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.leaderboard));
}

function applyMatchPoints(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) {
    AppState.leaderboard[AppState.homeTeam].points += 1;
  } else if (awayGoals > homeGoals) {
    AppState.leaderboard[AppState.awayTeam].points += 1;
  }
  saveLeaderboard();
}

// ═══════════════════════════════════════════
// NAVEGACIÓN DE VISTAS
// ═══════════════════════════════════════════

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    el.classList.remove('active');
    el.classList.add('hidden');
    if (key === name) {
      el.classList.remove('hidden');
      // Forzar reflow para transición
      void el.offsetWidth;
      el.classList.add('active');
    }
  });
  AppState.current = name.toUpperCase();
}

// ═══════════════════════════════════════════
// PANTALLA DE SELECCIÓN
// ═══════════════════════════════════════════

function renderSelectionGrids() {
  const gridLocal = $('#grid-local');
  const gridAway = $('#grid-away');
  gridLocal.innerHTML = '';
  gridAway.innerHTML = '';

  GSTORE_BRANCHES.forEach((branch) => {
    const btnLocal = createBranchButton(branch, 'local');
    const btnAway = createBranchButton(branch, 'away');
    gridLocal.appendChild(btnLocal);
    gridAway.appendChild(btnAway);
  });
}

function createBranchButton(branch, side) {
  const btn = document.createElement('button');
  btn.className = 'branch-btn';
  btn.textContent = branch.replace('GSTORE ', '');
  btn.dataset.branch = branch;
  btn.dataset.side = side;
  btn.addEventListener('click', () => selectBranch(branch, side));
  return btn;
}

function selectBranch(branch, side) {
  if (side === 'local') {
    AppState.homeTeam = branch;
  } else {
    AppState.awayTeam = branch;
  }

  // No permitir mismo equipo en ambos lados
  updateSelectionUI();
}

function updateSelectionUI() {
  $$('.branch-btn').forEach((btn) => {
    const b = btn.dataset.branch;
    const side = btn.dataset.side;
    btn.classList.remove('selected-local', 'selected-away', 'disabled-branch');

    if (side === 'local') {
      if (b === AppState.homeTeam) btn.classList.add('selected-local');
      if (b === AppState.awayTeam) btn.classList.add('disabled-branch');
    } else {
      if (b === AppState.awayTeam) btn.classList.add('selected-away');
      if (b === AppState.homeTeam) btn.classList.add('disabled-branch');
    }
  });

  const summary = $('#selection-summary');
  const startBtn = $('#btn-start-match');
  const ready = AppState.homeTeam && AppState.awayTeam && AppState.homeTeam !== AppState.awayTeam;

  if (ready) {
    summary.textContent = `${AppState.homeTeam} vs ${AppState.awayTeam}`;
    startBtn.disabled = false;
    startBtn.classList.remove('opacity-50', 'pointer-events-none');
  } else {
    summary.textContent = AppState.homeTeam
      ? 'Selecciona el equipo visitante'
      : 'Selecciona el equipo local';
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'pointer-events-none');
  }
}

// ═══════════════════════════════════════════
// ENTIDADES DEL JUEGO
// ═══════════════════════════════════════════

function createPlayer(x, y, team, number, isGK = false) {
  return {
    x, y,
    vx: 0, vy: 0,
    team, // 'home' | 'away'
    number,
    isGK,
    isActive: false,
    tackleCooldown: 0,
    aimAngle: team === 'home' ? 0 : Math.PI
  };
}

function createFormation(team) {
  const players = [];
  const isHome = team === 'home';
  const dir = isHome ? 1 : -1;
  const baseX = isHome ? 100 : FIELD.w - 100;

  // Portero
  players.push(createPlayer(baseX, FIELD.h / 2, team, 1, true));

  // 4 de campo en formación
  const positions = [
    { x: baseX + dir * 180, y: FIELD.h * 0.25 },
    { x: baseX + dir * 180, y: FIELD.h * 0.75 },
    { x: baseX + dir * 340, y: FIELD.h * 0.38 },
    { x: baseX + dir * 340, y: FIELD.h * 0.62 }
  ];

  positions.forEach((pos, i) => {
    players.push(createPlayer(pos.x, pos.y, team, i + 2, false));
  });

  return players;
}

function createBall() {
  return { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0, owner: null };
}

// ═══════════════════════════════════════════
// SISTEMA DE ENTRADA
// ═══════════════════════════════════════════

const Input = {
  keys: {},
  touch: { up: false, down: false, left: false, right: false, a: false, b: false },
  aimX: 1,
  aimY: 0,
  bHeld: false,
  bHoldTime: 0,

  init() {
    window.addEventListener('keydown', (e) => {
      Input.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { Input.keys[e.code] = false; });

    // D-Pad táctil
    $$('.dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir;
      const press = (on) => { Input.touch[dir] = on; btn.classList.toggle('pressed', on); };
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(true); }, { passive: false });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); press(false); });
      btn.addEventListener('mousedown', () => press(true));
      btn.addEventListener('mouseup', () => press(false));
      btn.addEventListener('mouseleave', () => press(false));
    });

    const setupActionBtn = (id, key) => {
      const el = $(id);
      if (!el) return;
      const press = (on) => { Input.touch[key] = on; el.classList.toggle('pressed', on); };
      el.addEventListener('touchstart', (e) => { e.preventDefault(); press(true); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); press(false); });
      el.addEventListener('mousedown', () => press(true));
      el.addEventListener('mouseup', () => press(false));
      el.addEventListener('mouseleave', () => press(false));
    };
    setupActionBtn('#btn-touch-a', 'a');
    setupActionBtn('#btn-touch-b', 'b');
  },

  isUp()    { return Input.keys['KeyW'] || Input.keys['ArrowUp']    || Input.touch.up; },
  isDown()  { return Input.keys['KeyS'] || Input.keys['ArrowDown']  || Input.touch.down; },
  isLeft()  { return Input.keys['KeyA'] || Input.keys['ArrowLeft']  || Input.touch.left; },
  isRight() { return Input.keys['KeyD'] || Input.keys['ArrowRight'] || Input.touch.right; },
  isA()     { return Input.keys['KeyJ'] || Input.touch.a; },
  isB()     { return Input.keys['KeyK'] || Input.touch.b; },

  getMoveVector() {
    let mx = 0, my = 0;
    if (Input.isUp()) my -= 1;
    if (Input.isDown()) my += 1;
    if (Input.isLeft()) mx -= 1;
    if (Input.isRight()) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    return { x: mx, y: my };
  },

  reset() {
    Input.keys = {};
    Input.touch = { up: false, down: false, left: false, right: false, a: false, b: false };
    Input.bHeld = false;
    Input.bHoldTime = 0;
  }
};

// ═══════════════════════════════════════════
// FÍSICA Y COLISIONES
// ═══════════════════════════════════════════

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lineOfSight(x1, y1, x2, y2, obstacles, radius) {
  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const obs of obstacles) {
      if (Math.hypot(px - obs.x, py - obs.y) < radius + obs.r) return false;
    }
  }
  return true;
}

function resolvePlayerWall(p) {
  const pad = PLAYER_R;
  p.x = clamp(p.x, GOAL.w + pad, FIELD.w - GOAL.w - pad);
  p.y = clamp(p.y, pad, FIELD.h - pad);
}

function resolveBallWall(ball) {
  const goalTop = (FIELD.h - GOAL.h) / 2;
  const goalBot = goalTop + GOAL.h;

  // Paredes superior e inferior
  if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy *= -0.7; }
  if (ball.y + BALL_R > FIELD.h) { ball.y = FIELD.h - BALL_R; ball.vy *= -0.7; }

  // Paredes laterales (excepto porterías)
  if (ball.x - BALL_R < 0) {
    if (ball.y > goalTop && ball.y < goalBot) return; // zona de gol
    ball.x = BALL_R;
    ball.vx *= -0.7;
  }
  if (ball.x + BALL_R > FIELD.w) {
    if (ball.y > goalTop && ball.y < goalBot) return;
    ball.x = FIELD.w - BALL_R;
    ball.vx *= -0.7;
  }
}

function playerBallCollision(player, ball) {
  const d = dist(player, ball);
  const minDist = PLAYER_R + BALL_R;
  if (d >= minDist || d === 0) return;

  const nx = (ball.x - player.x) / d;
  const ny = (ball.y - player.y) / d;
  const overlap = minDist - d;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  // Transferir momentum
  const relVx = ball.vx - player.vx;
  const relVy = ball.vy - player.vy;
  const dot = relVx * nx + relVy * ny;
  if (dot < 0) {
    ball.vx -= dot * nx * 1.2;
    ball.vy -= dot * ny * 1.2;
  }
}

function playerPlayerCollision(a, b) {
  const d = dist(a, b);
  const minDist = PLAYER_R * 2;
  if (d >= minDist || d === 0) return;
  const nx = (b.x - a.x) / d;
  const ny = (b.y - a.y) / d;
  const overlap = minDist - d;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
}

// ═══════════════════════════════════════════
// LÓGICA DE POSESIÓN
// ═══════════════════════════════════════════

function updatePossession(g) {
  const { ball, allPlayers } = g;
  ball.owner = null;

  let closest = null;
  let closestDist = POSSESS_DIST;

  for (const p of allPlayers) {
    const d = dist(p, ball);
    if (d < closestDist) {
      closestDist = d;
      closest = p;
    }
  }

  if (closest && Math.hypot(ball.vx, ball.vy) < 6) {
    ball.owner = closest;
    // Pegar balón al jugador
    const angle = closest.aimAngle;
    ball.x = closest.x + Math.cos(angle) * (PLAYER_R + BALL_R - 2);
    ball.y = closest.y + Math.sin(angle) * (PLAYER_R + BALL_R - 2);
    ball.vx = closest.vx;
    ball.vy = closest.vy;
  }
}

function userHasBall(g) {
  return g.ball.owner && g.ball.owner.team === 'home';
}

function aiHasBall(g) {
  return g.ball.owner && g.ball.owner.team === 'away';
}

// ═══════════════════════════════════════════
// ACCIONES DEL JUGADOR (A / B)
// ═══════════════════════════════════════════

function findPassTarget(active, teammates, aimAngle) {
  let best = null;
  let bestScore = -Infinity;
  const coneAngle = Math.PI / 3;

  for (const tm of teammates) {
    if (tm === active) continue;
    const dx = tm.x - active.x;
    const dy = tm.y - active.y;
    const d = Math.hypot(dx, dy);
    if (d < 40 || d > 500) continue;

    const angleTo = Math.atan2(dy, dx);
    let diff = Math.abs(angleTo - aimAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > coneAngle) continue;

    const score = d * (1 - diff / coneAngle);
    if (score > bestScore) {
      bestScore = score;
      best = tm;
    }
  }
  return best;
}

function doPass(g, player) {
  const teammates = g.homePlayers.filter((p) => p !== player);
  const target = findPassTarget(player, teammates, player.aimAngle);

  g.ball.owner = null;
  if (target) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const d = Math.hypot(dx, dy);
    g.ball.vx = (dx / d) * PASS_FORCE;
    g.ball.vy = (dy / d) * PASS_FORCE;
  } else {
    g.ball.vx = Math.cos(player.aimAngle) * PASS_FORCE;
    g.ball.vy = Math.sin(player.aimAngle) * PASS_FORCE;
  }
  g.actionCooldown = 15;
}

function doShoot(g, player, power) {
  g.ball.owner = null;
  const force = SHOOT_BASE + (SHOOT_MAX - SHOOT_BASE) * power;
  // Disparar hacia portería rival (derecha)
  const goalX = FIELD.w - GOAL.w;
  const goalY = FIELD.h / 2;
  const dx = goalX - player.x;
  const dy = goalY - player.y;
  const d = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  // Mezclar con dirección de apuntado
  const aimAngle = player.aimAngle;
  const finalAngle = angle * 0.6 + aimAngle * 0.4;
  g.ball.vx = Math.cos(finalAngle) * force;
  g.ball.vy = Math.sin(finalAngle) * force;
  g.actionCooldown = 20;
}

function doSwitchControl(g) {
  let closest = null;
  let closestDist = Infinity;
  for (const p of g.homePlayers) {
    const d = dist(p, g.ball);
    if (d < closestDist) {
      closestDist = d;
      closest = p;
    }
  }
  if (closest) {
    g.homePlayers.forEach((p) => { p.isActive = false; });
    closest.isActive = true;
    g.activePlayer = closest;
  }
  g.actionCooldown = 10;
}

function doTackle(g, player) {
  if (player.tackleCooldown > 0) return;
  player.tackleCooldown = 45;

  const dashAngle = player.aimAngle;
  player.vx += Math.cos(dashAngle) * TACKLE_FORCE;
  player.vy += Math.sin(dashAngle) * TACKLE_FORCE;

  // Robar si hay rival cercano con balón
  if (g.ball.owner && g.ball.owner.team === 'away') {
    const d = dist(player, g.ball.owner);
    if (d < TACKLE_RANGE) {
      g.ball.owner = null;
      g.ball.vx = Math.cos(dashAngle) * 6;
      g.ball.vy = Math.sin(dashAngle) * 6;
    }
  }
  g.actionCooldown = 20;
}

// ═══════════════════════════════════════════
// INTELIGENCIA ARTIFICIAL
// ═══════════════════════════════════════════

function updateAI(g) {
  const { ball, awayPlayers, homePlayers, allPlayers } = g;
  const midfield = FIELD.w / 2;

  for (const ai of awayPlayers) {
    if (ai.tackleCooldown > 0) ai.tackleCooldown--;

    let targetX, targetY;
    const hasBall = ball.owner === ai;
    const homeHasBall = ball.owner && ball.owner.team === 'home';

    if (hasBall) {
      // Con balón: avanzar y disparar si cruza medio campo
      const goalX = 0;
      const goalY = FIELD.h / 2;
      targetX = goalX + 60;
      targetY = goalY;

      if (ai.x < midfield + 80) {
        // Avanzar con balón
        const dx = targetX - ai.x;
        const dy = targetY - ai.y;
        const d = Math.hypot(dx, dy) || 1;
        ai.vx += (dx / d) * 0.5;
        ai.vy += (dy / d) * 0.5;
        ai.aimAngle = Math.atan2(dy, dx);
      } else {
        // Oportunidad de disparo
        const dx = goalX - ai.x;
        const dy = goalY - ai.y;
        const d = Math.hypot(dx, dy) || 1;
        ball.owner = null;
        ball.vx = (dx / d) * (SHOOT_BASE + 4);
        ball.vy = (dy / d) * (SHOOT_BASE + 4);
        g.aiShootCooldown = 60;
      }
    } else if (homeHasBall) {
      // Defensa: perseguir portador o interceptar
      const carrier = ball.owner;
      const obstacles = allPlayers.filter((p) => p !== ai);
      const canIntercept = lineOfSight(ai.x, ai.y, ball.x, ball.y, obstacles, PLAYER_R);

      if (canIntercept && dist(ai, ball) < INTERCEPT_RANGE) {
        targetX = ball.x;
        targetY = ball.y;
      } else {
        targetX = carrier.x;
        targetY = carrier.y;
      }
    } else {
      // Balón libre: ir al balón o posición táctica
      if (dist(ai, ball) < 300) {
        targetX = ball.x;
        targetY = ball.y;
      } else {
        // Posición de formación espejo
        const homeIdx = awayPlayers.indexOf(ai);
        const homeMirror = homePlayers[homeIdx];
        if (homeMirror) {
          targetX = FIELD.w - homeMirror.x;
          targetY = homeMirror.y;
        } else {
          targetX = ai.x;
          targetY = ai.y;
        }
      }
    }

    const dx = targetX - ai.x;
    const dy = targetY - ai.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 5) {
      ai.vx += (dx / d) * 0.45;
      ai.vy += (dy / d) * 0.45;
      ai.aimAngle = Math.atan2(dy, dx);
    }

    // Portero IA: quedarse cerca de portería
    if (ai.isGK) {
      ai.x = clamp(ai.x, FIELD.w - GOAL.w - 80, FIELD.w - 60);
      ai.y += (ball.y - ai.y) * 0.04;
    }

    // Limitar velocidad IA
    const spd = Math.hypot(ai.vx, ai.vy);
    if (spd > AI_SPEED) {
      ai.vx = (ai.vx / spd) * AI_SPEED;
      ai.vy = (ai.vy / spd) * AI_SPEED;
    }

    ai.vx *= FRICTION;
    ai.vy *= FRICTION;
    ai.x += ai.vx;
    ai.y += ai.vy;
    resolvePlayerWall(ai);
  }

  // Intercepción de pases en línea de visión
  if (ball.owner === null && Math.hypot(ball.vx, ball.vy) > 3) {
    for (const ai of awayPlayers) {
      if (dist(ai, ball) < POSSESS_DIST + 10) {
        const obstacles = allPlayers.filter((p) => p !== ai);
        if (lineOfSight(ai.x, ai.y, ball.x + ball.vx * 5, ball.y + ball.vy * 5, obstacles, PLAYER_R)) {
          // IA intercepta
          break;
        }
      }
    }
  }
}

// ═══════════════════════════════════════════
// DETECCIÓN DE GOLES
// ═══════════════════════════════════════════

function checkGoals(g) {
  const goalTop = (FIELD.h - GOAL.h) / 2;
  const goalBot = goalTop + GOAL.h;
  const { ball } = g;

  if (ball.y > goalTop && ball.y < goalBot) {
    if (ball.x < GOAL.w / 2) {
      // Gol visitante
      g.awayScore++;
      resetAfterGoal(g, 'away');
      return true;
    }
    if (ball.x > FIELD.w - GOAL.w / 2) {
      // Gol local
      g.homeScore++;
      resetAfterGoal(g, 'home');
      return true;
    }
  }
  return false;
}

function resetAfterGoal(g, scorer) {
  g.ball.x = FIELD.w / 2;
  g.ball.y = FIELD.h / 2;
  g.ball.vx = 0;
  g.ball.vy = 0;
  g.ball.owner = null;
  g.goalPause = 90; // ~1.5s a 60fps

  // Reposicionar jugadores
  g.homePlayers = createFormation('home');
  g.awayPlayers = createFormation('away');
  g.allPlayers = [...g.homePlayers, ...g.awayPlayers];
  g.homePlayers[2].isActive = true;
  g.activePlayer = g.homePlayers[2];
  updateHUD(g);
}

// ═══════════════════════════════════════════
// CLASE PRINCIPAL DEL PARTIDO
// ═══════════════════════════════════════════

class Match {
  constructor(homeName, awayName) {
    this.homeName = homeName;
    this.awayName = awayName;
    this.homeScore = 0;
    this.awayScore = 0;
    this.timeLeft = MATCH_DURATION;
    this.lastTimestamp = 0;
    this.running = false;
    this.goalPause = 0;
    this.actionCooldown = 0;
    this.aPressed = false;
    this.bPressed = false;
    this.aiShootCooldown = 0;

    this.homePlayers = createFormation('home');
    this.awayPlayers = createFormation('away');
    this.allPlayers = [...this.homePlayers, ...this.awayPlayers];
    this.ball = createBall();

    // Jugador activo: mediocampista
    this.homePlayers[2].isActive = true;
    this.activePlayer = this.homePlayers[2];

    this.canvas = $('#game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    Input.reset();
    this.setupHUD();
    this.running = true;
    this.lastTimestamp = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const container = $('#game-container');
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.displayW = rect.width;
    this.displayH = rect.height;
    this.scaleX = this.displayW / FIELD.w;
    this.scaleY = this.displayH / FIELD.h;
  }

  setupHUD() {
    $('#hud-home-name').textContent = this.homeName.replace('GSTORE ', '');
    $('#hud-away-name').textContent = this.awayName.replace('GSTORE ', '');
    updateHUD(this);
  }

  loop(timestamp) {
    if (!this.running) return;

    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;

    this.update(dt);
    this.render();

    if (this.running) requestAnimationFrame(this.loop);
  }

  update(dt) {
    if (this.goalPause > 0) {
      this.goalPause--;
      return;
    }

    // Temporizador
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endMatch();
      return;
    }
    updateTimerDisplay(this.timeLeft);

    if (this.actionCooldown > 0) this.actionCooldown--;
    if (this.aiShootCooldown > 0) this.aiShootCooldown--;

    const active = this.activePlayer;
    const move = Input.getMoveVector();

    // Movimiento jugador activo
    if (move.x !== 0 || move.y !== 0) {
      active.vx += move.x * 0.6;
      active.vy += move.y * 0.6;
      active.aimAngle = Math.atan2(move.y, move.x);
    }

    const spd = Math.hypot(active.vx, active.vy);
    if (spd > PLAYER_SPEED) {
      active.vx = (active.vx / spd) * PLAYER_SPEED;
      active.vy = (active.vy / spd) * PLAYER_SPEED;
    }

    // Otros jugadores locales siguen formación suavemente
    for (const p of this.homePlayers) {
      if (p === active) continue;
      p.vx *= 0.9;
      p.vy *= 0.9;
      // Deriva hacia posición de formación
      const idx = this.homePlayers.indexOf(p);
      const form = createFormation('home');
      const target = form[idx];
      p.vx += (target.x - p.x) * 0.008;
      p.vy += (target.y - p.y) * 0.008;
    }

    // Aplicar velocidad y fricción a locales
    for (const p of this.homePlayers) {
      p.vx *= FRICTION;
      p.vy *= FRICTION;
      p.x += p.vx;
      p.y += p.vy;
      if (p.tackleCooldown > 0) p.tackleCooldown--;
      resolvePlayerWall(p);
    }

    // IA visitante
    updateAI(this);

    // Colisiones jugador-jugador
    for (let i = 0; i < this.allPlayers.length; i++) {
      for (let j = i + 1; j < this.allPlayers.length; j++) {
        playerPlayerCollision(this.allPlayers[i], this.allPlayers[j]);
      }
    }

    // Física del balón
    if (!this.ball.owner) {
      this.ball.vx *= BALL_FRICTION;
      this.ball.vy *= BALL_FRICTION;
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      resolveBallWall(this.ball);
    }

    // Colisiones balón-jugador
    for (const p of this.allPlayers) {
      playerBallCollision(p, this.ball);
    }

    updatePossession(this);
    checkGoals(this);

    // ── Botones A / B ──
    const aDown = Input.isA();
    const bDown = Input.isB();

    if (userHasBall(this)) {
      // Ataque
      if (aDown && !this.aPressed && this.actionCooldown <= 0) {
        doPass(this, active);
      }
      if (bDown) {
        Input.bHoldTime += dt;
        Input.bHeld = true;
      } else if (Input.bHeld && this.actionCooldown <= 0) {
        const power = clamp(Input.bHoldTime / 1.2, 0, 1);
        doShoot(this, active, power);
        Input.bHeld = false;
        Input.bHoldTime = 0;
      }
    } else if (aiHasBall(this) || (!this.ball.owner && dist(active, this.ball) > POSSESS_DIST)) {
      // Defensa
      if (aDown && !this.aPressed && this.actionCooldown <= 0) {
        doSwitchControl(this);
      }
      if (bDown && !this.bPressed && this.actionCooldown <= 0) {
        doTackle(this, active);
      }
    } else if (!this.ball.owner) {
      // Balón libre: B para empujar/disparar
      if (bDown && !this.bPressed && this.actionCooldown <= 0 && dist(active, this.ball) < POSSESS_DIST + 20) {
        doShoot(this, active, 0.3);
      }
    }

    this.aPressed = aDown;
    this.bPressed = bDown;
  }

  render() {
    const ctx = this.ctx;
    const w = this.displayW;
    const h = this.displayH;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(this.scaleX, this.scaleY);

    drawField(ctx);
    drawGoals(ctx);

    // Jugadores (sombra + cuerpo)
    for (const p of this.allPlayers) {
      drawPlayer(ctx, p, p.isActive);
    }

    drawBall(ctx, this.ball);

    // Indicador de carga de tiro
    if (Input.bHeld && userHasBall(this)) {
      const power = clamp(Input.bHoldTime / 1.2, 0, 1);
      drawPowerBar(ctx, this.activePlayer, power);
    }

    ctx.restore();
  }

  endMatch() {
    this.running = false;
    applyMatchPoints(this.homeScore, this.awayScore);
    showLeaderboard(this.homeScore, this.awayScore);
  }

  destroy() {
    this.running = false;
  }
}

// ═══════════════════════════════════════════
// RENDERIZADO CANVAS
// ═══════════════════════════════════════════

function drawField(ctx) {
  const stripeH = FIELD.h / 12;
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? COLORS.grass1 : COLORS.grass2;
    ctx.fillRect(0, i * stripeH, FIELD.w, stripeH);
  }

  ctx.strokeStyle = COLORS.lines;
  ctx.lineWidth = 3;

  // Perímetro
  ctx.strokeRect(GOAL.w, 0, FIELD.w - GOAL.w * 2, FIELD.h);

  // Línea central
  ctx.beginPath();
  ctx.moveTo(FIELD.w / 2, 0);
  ctx.lineTo(FIELD.w / 2, FIELD.h);
  ctx.stroke();

  // Círculo central
  ctx.beginPath();
  ctx.arc(FIELD.w / 2, FIELD.h / 2, 80, 0, Math.PI * 2);
  ctx.stroke();

  // Punto central
  ctx.fillStyle = COLORS.lines;
  ctx.beginPath();
  ctx.arc(FIELD.w / 2, FIELD.h / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  // Áreas
  const areaW = 180;
  const areaH = 320;
  ctx.strokeRect(GOAL.w, (FIELD.h - areaH) / 2, areaW, areaH);
  ctx.strokeRect(FIELD.w - GOAL.w - areaW, (FIELD.h - areaH) / 2, areaW, areaH);
}

function drawGoals(ctx) {
  const goalTop = (FIELD.h - GOAL.h) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, goalTop, GOAL.w, GOAL.h);
  ctx.fillRect(FIELD.w - GOAL.w, goalTop, GOAL.w, GOAL.h);

  ctx.strokeStyle = COLORS.lines;
  ctx.lineWidth = 4;
  ctx.strokeRect(0, goalTop, GOAL.w, GOAL.h);
  ctx.strokeRect(FIELD.w - GOAL.w, goalTop, GOAL.w, GOAL.h);
}

function drawPlayer(ctx, p, isActive) {
  const color = p.team === 'home' ? COLORS.home : COLORS.away;

  // Sombra
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + PLAYER_R * 0.6, PLAYER_R * 0.9, PLAYER_R * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Círculo jugador
  ctx.fillStyle = color;
  ctx.strokeStyle = isActive ? '#ffffff' : COLORS.metal;
  ctx.lineWidth = isActive ? 3 : 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Número
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${PLAYER_R}px Oswald, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.number, p.x, p.y + 1);

  // Indicador activo
  if (isActive) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBall(ctx, ball) {
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y + BALL_R * 0.5, BALL_R * 0.8, BALL_R * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.ball;
  ctx.strokeStyle = COLORS.metal;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Pentágono decorativo
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const px = ball.x + Math.cos(a) * (BALL_R * 0.5);
    const py = ball.y + Math.sin(a) * (BALL_R * 0.5);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawPowerBar(ctx, player, power) {
  const barW = 40;
  const barH = 6;
  const x = player.x - barW / 2;
  const y = player.y - PLAYER_R - 14;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = `rgb(${236}, ${119 + power * 50 | 0}, 0)`;
  ctx.fillRect(x, y, barW * power, barH);
  ctx.strokeStyle = COLORS.metal;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);
}

// ═══════════════════════════════════════════
// HUD Y LEADERBOARD
// ═══════════════════════════════════════════

function updateHUD(g) {
  $('#hud-home-score').textContent = g.homeScore;
  $('#hud-away-score').textContent = g.awayScore;
}

function updateTimerDisplay(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  $('#hud-timer').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function showLeaderboard(homeGoals, awayGoals) {
  let resultText;
  if (homeGoals > awayGoals) {
    resultText = `¡Victoria de ${AppState.homeTeam}! (${homeGoals} - ${awayGoals})`;
  } else if (awayGoals > homeGoals) {
    resultText = `¡Victoria de ${AppState.awayTeam}! (${homeGoals} - ${awayGoals})`;
  } else {
    resultText = `Empate (${homeGoals} - ${awayGoals}) — Sin puntos`;
  }
  $('#match-result').textContent = resultText;

  const sorted = GSTORE_BRANCHES
    .map((b) => ({ name: b, points: AppState.leaderboard[b].points }))
    .sort((a, b) => b.points - a.points);

  const tbody = $('#leaderboard-body');
  tbody.innerHTML = '';
  sorted.forEach((entry, i) => {
    const tr = document.createElement('tr');
    const isMatchTeam = entry.name === AppState.homeTeam || entry.name === AppState.awayTeam;
    tr.className = `leaderboard-row${isMatchTeam ? ' highlight' : ''}`;
    tr.innerHTML = `
      <td class="py-3 pl-2 text-gstore-muted">${i + 1}</td>
      <td class="py-3 text-white font-bold">${entry.name.replace('GSTORE ', '')}</td>
      <td class="py-3 text-right pr-2 text-gstore-accent font-bold text-xl">${entry.points}</td>
    `;
    tbody.appendChild(tr);
  });

  showView('leaderboard');
}

// ═══════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════

function init() {
  AppState.leaderboard = loadLeaderboard();
  Input.init();
  renderSelectionGrids();

  $('#btn-play').addEventListener('click', () => {
    AppState.homeTeam = null;
    AppState.awayTeam = null;
    updateSelectionUI();
    showView('selection');
  });

  $('#btn-start-match').addEventListener('click', () => {
    if (!AppState.homeTeam || !AppState.awayTeam) return;
    if (game) game.destroy();
    showView('game');
    game = new Match(AppState.homeTeam, AppState.awayTeam);
  });

  $('#btn-home').addEventListener('click', () => {
    if (game) { game.destroy(); game = null; }
    AppState.homeTeam = null;
    AppState.awayTeam = null;
    showView('start');
  });

  showView('start');
}

document.addEventListener('DOMContentLoaded', init);
