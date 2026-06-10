/**
 * GSTORE CUP — Motor de juego arcade 2D (Vanilla JS)
 * Vista cenital · 5v5 · Física simplificada · IA visitante
 */

// ═══════════════════════════════════════════
// CONFIGURACIÓN Y CONSTANTES
// ═══════════════════════════════════════════

const initialStores = [
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
const AI_CHASE_DIST = 180;
const AI_TACTICAL_DIST = 320;
const LERP_CHASE = 0.045;
const LERP_BASE = 0.028;
const GK_BOX_W = 95;
const GK_BOX_H = 140;

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
  initialStores.forEach((b) => { data[b] = { points: 0 }; });
  return data;
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLeaderboard();
    const parsed = JSON.parse(raw);
    // Asegurar que todas las sucursales existan
    const data = defaultLeaderboard();
    initialStores.forEach((b) => {
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

function renderSelectionLists() {
  const listLocal = $('#list-local');
  const listAway = $('#list-away');
  listLocal.innerHTML = '';
  listAway.innerHTML = '';

  initialStores.forEach((store) => {
    listLocal.appendChild(createStoreRow(store, 'local'));
    listAway.appendChild(createStoreRow(store, 'away'));
  });
}

function createStoreRow(store, side) {
  const li = document.createElement('li');
  li.className = 'store-row';
  li.dataset.branch = store;
  li.dataset.side = side;
  li.setAttribute('role', 'option');
  li.innerHTML = `
    <span class="store-radio" aria-hidden="true"></span>
    <span class="store-name">${store}</span>
  `;
  li.addEventListener('click', () => selectBranch(store, side));
  return li;
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
  $$('.store-row').forEach((row) => {
    const b = row.dataset.branch;
    const side = row.dataset.side;
    row.classList.remove('selected-local', 'selected-away', 'disabled-row');
    row.setAttribute('aria-selected', 'false');

    if (side === 'local') {
      if (b === AppState.homeTeam) {
        row.classList.add('selected-local');
        row.setAttribute('aria-selected', 'true');
      }
      if (b === AppState.awayTeam) row.classList.add('disabled-row');
    } else {
      if (b === AppState.awayTeam) {
        row.classList.add('selected-away');
        row.setAttribute('aria-selected', 'true');
      }
      if (b === AppState.homeTeam) row.classList.add('disabled-row');
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

/** Slots únicos por equipo — evita amontonamiento en esquinas */
function getFormationSlots(team) {
  const isHome = team === 'home';
  const gkX = isHome ? 88 : FIELD.w - 88;
  const lineDef = isHome ? 265 : FIELD.w - 265;
  const lineMid = isHome ? 425 : FIELD.w - 425;
  return [
    { x: gkX, y: FIELD.h * 0.5, isGK: true, role: 'gk' },
    { x: lineDef, y: FIELD.h * 0.22, isGK: false, role: 'def' },
    { x: lineDef, y: FIELD.h * 0.78, isGK: false, role: 'def' },
    { x: lineMid, y: FIELD.h * 0.36, isGK: false, role: 'mid' },
    { x: lineMid, y: FIELD.h * 0.64, isGK: false, role: 'mid' }
  ];
}

function createPlayer(x, y, team, number, isGK = false) {
  const player = {
    x, y,
    vx: 0, vy: 0,
    team,
    number,
    isGK,
    isActive: false,
    tackleCooldown: 0,
    aimAngle: team === 'home' ? 0 : Math.PI,
    baseX: x,
    baseY: y,
    role: 'mid',
    jitterTimer: Math.random() * 0.3,

    update(dt, game) {
      updatePlayerEntity(this, game, dt);
    }
  };
  return player;
}

/** Inicializa un equipo con coordenadas base únicas por jugador */
function initializePlayers(team) {
  return getFormationSlots(team).map((slot, i) => {
    const player = createPlayer(slot.x, slot.y, team, i + 1, slot.isGK);
    player.baseX = slot.x;
    player.baseY = slot.y;
    player.role = slot.role;
    return player;
  });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clampPlayerSpeed(p, maxSpeed) {
  const spd = Math.hypot(p.vx, p.vy);
  if (spd > maxSpeed) {
    p.vx = (p.vx / spd) * maxSpeed;
    p.vy = (p.vy / spd) * maxSpeed;
  }
}

function applyLerpSteering(player, targetX, targetY, lerpFactor) {
  const nx = lerp(player.x, targetX, lerpFactor);
  const ny = lerp(player.y, targetY, lerpFactor);
  player.vx += (nx - player.x) * 0.14;
  player.vy += (ny - player.y) * 0.14;
  const dx = targetX - player.x;
  const dy = targetY - player.y;
  if (Math.hypot(dx, dy) > 2) player.aimAngle = Math.atan2(dy, dx);
}

function applyJitter(player) {
  player.vx += (Math.random() - 0.5) * 0.4;
  player.vy += (Math.random() - 0.5) * 0.4;
}

function getGoalkeeperTarget(player, ball) {
  const isHome = player.team === 'home';
  const goalCY = FIELD.h / 2;
  const anchorX = isHome ? GOAL.w + 58 : FIELD.w - GOAL.w - 58;
  const minX = isHome ? GOAL.w + PLAYER_R : FIELD.w - GOAL.w - GK_BOX_W;
  const maxX = isHome ? GOAL.w + GK_BOX_W : FIELD.w - GOAL.w - PLAYER_R;
  const minY = goalCY - GK_BOX_H / 2;
  const maxY = goalCY + GK_BOX_H / 2;
  return {
    x: clamp(anchorX, minX, maxX),
    y: clamp(lerp(player.baseY, ball.y, 0.32), minY, maxY)
  };
}

function computeMoveTarget(player, g) {
  const { ball, allPlayers } = g;
  if (player.isGK) return getGoalkeeperTarget(player, ball);

  let tx = player.baseX;
  let ty = player.baseY;
  const ballDist = dist(player, ball);
  const ballShift = clamp((ball.x - FIELD.w / 2) / (FIELD.w / 2), -1, 1);
  const push = (player.team === 'home' ? 1 : -1) * ballShift * 45;
  tx += push * (player.role === 'mid' ? 0.75 : 0.4);
  ty += ballShift * 18 * (player.role === 'def' ? 0.5 : 1);

  if (ballDist < AI_CHASE_DIST) {
    const w = (1 - ballDist / AI_CHASE_DIST) * 0.55;
    let bx = ball.x;
    let by = ball.y;
    if (ball.owner && ball.owner.team !== player.team) {
      const obstacles = allPlayers.filter((p) => p !== player);
      if (!lineOfSight(player.x, player.y, ball.x, ball.y, obstacles, PLAYER_R)) {
        bx = ball.owner.x;
        by = ball.owner.y;
      }
    }
    tx = lerp(tx, bx, w);
    ty = lerp(ty, by, w);
  } else if (ballDist < AI_TACTICAL_DIST && !ball.owner) {
    tx = lerp(tx, ball.x, 0.3);
    ty = lerp(ty, ball.y, 0.3);
  }

  return { x: tx, y: ty };
}

function updateAwayBallCarrier(player, g) {
  const midfield = FIELD.w / 2;
  const goalX = 0;
  const goalY = FIELD.h / 2;
  if (player.x > midfield - 60 && g.aiShootCooldown <= 0) {
    const dx = goalX - player.x;
    const dy = goalY - player.y;
    const d = Math.hypot(dx, dy) || 1;
    g.ball.owner = null;
    g.ball.vx = (dx / d) * (SHOOT_BASE + 4);
    g.ball.vy = (dy / d) * (SHOOT_BASE + 4);
    g.aiShootCooldown = 60;
    return;
  }
  applyLerpSteering(player, goalX + 60, goalY, LERP_CHASE * 1.4);
  clampPlayerSpeed(player, AI_SPEED);
}

function updateAutoMovement(player, g, maxSpeed) {
  const target = computeMoveTarget(player, g);
  const lerpF = dist(player, g.ball) < AI_CHASE_DIST ? LERP_CHASE : LERP_BASE;
  applyLerpSteering(player, target.x, target.y, lerpF);
  clampPlayerSpeed(player, maxSpeed);
}

function updatePlayerEntity(player, g, dt) {
  if (player.tackleCooldown > 0) player.tackleCooldown--;

  if (player.team === 'home' && player.isActive) {
    const move = Input.getMoveVector();
    if (move.x !== 0 || move.y !== 0) {
      player.vx += move.x * 0.65;
      player.vy += move.y * 0.65;
      player.aimAngle = Math.atan2(move.y, move.x);
    }
    clampPlayerSpeed(player, PLAYER_SPEED);
  } else if (player.team === 'away' && g.ball.owner === player) {
    updateAwayBallCarrier(player, g);
  } else {
    const maxSpd = player.team === 'home' ? PLAYER_SPEED * 0.9 : AI_SPEED;
    updateAutoMovement(player, g, maxSpd);
  }

  player.jitterTimer = (player.jitterTimer || 0) + dt;
  if (player.jitterTimer >= 0.35 + Math.random() * 0.15) {
    applyJitter(player);
    player.jitterTimer = 0;
  }

  player.vx *= FRICTION;
  player.vy *= FRICTION;
  player.x += player.vx;
  player.y += player.vy;
  resolvePlayerWall(player);
}

function updateAIPassIntercept(g) {
  const { ball, awayPlayers, allPlayers } = g;
  if (ball.owner !== null || Math.hypot(ball.vx, ball.vy) <= 3) return;

  for (const ai of awayPlayers) {
    if (dist(ai, ball) < POSSESS_DIST + 10) {
      const obstacles = allPlayers.filter((p) => p !== ai);
      if (lineOfSight(ai.x, ai.y, ball.x + ball.vx * 5, ball.y + ball.vy * 5, obstacles, PLAYER_R)) {
        applyLerpSteering(ai, ball.x, ball.y, LERP_CHASE * 1.5);
      }
    }
  }
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
  const r = PLAYER_R;
  p.x = clamp(p.x, GOAL.w + r, FIELD.w - GOAL.w - r);
  p.y = clamp(p.y, r, FIELD.h - r);
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

function syncAllPlayers(g) {
  g.allPlayers = [...g.homePlayers, ...g.awayPlayers];
  const active = g.homePlayers.find((p) => p.isActive);
  if (active) g.activePlayer = active;
  return g.allPlayers;
}

function resetAfterGoal(g, scorer) {
  g.ball.x = FIELD.w / 2;
  g.ball.y = FIELD.h / 2;
  g.ball.vx = 0;
  g.ball.vy = 0;
  g.ball.owner = null;
  g.goalPause = 90; // ~1.5s a 60fps

  g.homePlayers = initializePlayers('home');
  g.awayPlayers = initializePlayers('away');
  g.homePlayers[2].isActive = true;
  syncAllPlayers(g);
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

    this.homePlayers = initializePlayers('home');
    this.awayPlayers = initializePlayers('away');
    this.ball = createBall();

    this.homePlayers[2].isActive = true;
    syncAllPlayers(this);

    this.canvas = $('#game-canvas');
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.addEventListener('click', () => this.canvas.focus());
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    Input.reset();
    this.setupHUD();
    this.canvas.focus();
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

    const allPlayers = syncAllPlayers(this);
    allPlayers.forEach((player) => player.update(dt, this));
    updateAIPassIntercept(this);

    const active = this.activePlayer;

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
    if (!active) return;

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

function renderLeaderboardTable({ showResult = false, homeGoals = 0, awayGoals = 0 } = {}) {
  const titleEl = $('#leaderboard-title');
  const resultEl = $('#match-result');

  if (showResult && AppState.homeTeam) {
    titleEl.textContent = 'RESULTADO FINAL';
    let resultText;
    if (homeGoals > awayGoals) {
      resultText = `¡Victoria de ${AppState.homeTeam}! (${homeGoals} - ${awayGoals})`;
    } else if (awayGoals > homeGoals) {
      resultText = `¡Victoria de ${AppState.awayTeam}! (${homeGoals} - ${awayGoals})`;
    } else {
      resultText = `Empate (${homeGoals} - ${awayGoals}) — Sin puntos`;
    }
    resultEl.textContent = resultText;
    resultEl.classList.remove('hidden');
  } else {
    titleEl.textContent = 'TABLA DE POSICIONES';
    resultEl.textContent = '';
    resultEl.classList.add('hidden');
  }

  const sorted = initialStores
    .map((b) => ({ name: b, points: AppState.leaderboard[b].points }))
    .sort((a, b) => b.points - a.points);

  const tbody = $('#leaderboard-body');
  tbody.innerHTML = '';
  sorted.forEach((entry, i) => {
    const tr = document.createElement('tr');
    const isMatchTeam = showResult && (entry.name === AppState.homeTeam || entry.name === AppState.awayTeam);
    tr.className = `leaderboard-row${isMatchTeam ? ' highlight' : ''}`;
    tr.innerHTML = `
      <td class="py-3 pl-2 text-gstore-muted">${i + 1}</td>
      <td class="py-3 text-white font-bold">${entry.name.replace('GSTORE ', '')}</td>
      <td class="py-3 text-right pr-2 text-gstore-accent font-bold text-xl">${entry.points}</td>
    `;
    tbody.appendChild(tr);
  });
}

function showLeaderboard(homeGoals, awayGoals) {
  renderLeaderboardTable({ showResult: true, homeGoals, awayGoals });
  showView('leaderboard');
}

function openLeaderboardFromMenu() {
  renderLeaderboardTable({ showResult: false });
  showView('leaderboard');
}

// ═══════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════

function init() {
  AppState.leaderboard = loadLeaderboard();
  Input.init();
  renderSelectionLists();

  $('#btn-play').addEventListener('click', () => {
    AppState.homeTeam = null;
    AppState.awayTeam = null;
    updateSelectionUI();
    showView('selection');
  });

  $('#btn-leaderboard').addEventListener('click', () => {
    openLeaderboardFromMenu();
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
