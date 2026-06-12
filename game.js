/* ═══════════════════════════════════════════
   game.js — FPS Shooter
═══════════════════════════════════════════ */

// ─── CONFIG ───────────────────────────────
const GAME_DURATION = 60;
const MAX_AMMO      = 30;
const RESERVE_AMMO  = 90;
const RELOAD_TIME   = 2.0;
const TARGET_COUNT  = 8;
const ARENA_SIZE    = 28;
const ARENA_HEIGHT  = 8;

const TARGET_TYPES = [
  { color: 0xff3333, points: 100, size: 0.60, speed: 0.8 }, // rouge  — rapide
  { color: 0xffaa00, points:  50, size: 0.90, speed: 0.4 }, // orange — moyen
  { color: 0x44ccff, points: 200, size: 0.35, speed: 1.2 }, // bleu   — petit & rapide
];

// ─── SETTINGS (valeurs par défaut) ────────
const settings = {
  sensitivity:  1.0,   // multiplicateur souris  (0.5 – 2.0)
  fov:          75,    // champ de vision         (60 – 110)
  volume:       0.8,   // volume global           (0 – 1)
  showFps:      false, // compteur FPS
  hitmarker:    true,  // afficher le hitmarker
  autoReload:   true,  // rechargement auto à 0
  crosshairSize:1.0,   // taille du réticule      (0.5 – 2.0)
  difficulty:   'normal', // easy | normal | hard
};

const DIFFICULTY_SPEED = { easy: 0.5, normal: 1.0, hard: 1.6 };

// ─── THREE.JS STATE ───────────────────────
let scene, camera, renderer, raycaster;
const clock = new THREE.Clock();

// ─── GAME STATE ───────────────────────────
let targets       = [];
let score         = 0;
let hits          = 0;
let shots         = 0;
let ammo          = MAX_AMMO;
let reserve       = RESERVE_AMMO;
let timeLeft      = GAME_DURATION;
let isPlaying     = false;
let isReloading   = false;
let reloadStart   = 0;
let timerInterval = null;
let hitmarkerTimeout;

// ─── CAMERA STATE ─────────────────────────
let yaw   = 0;
let pitch = 0;
let pointerLocked = false;

// ─── FPS COUNTER ──────────────────────────
let fpsFrames = 0;
let fpsTime   = 0;
let fpsDisplay = 0;

// ═══════════════════════════════════════════
//  INIT SCENE
// ═══════════════════════════════════════════
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 20, 50);

  camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.7, 0);

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('canvas'),
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  raycaster = new THREE.Raycaster();

  // Lumières
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  scene.add(sun);

  [
    { color: 0x3344ff, pos: [-10, 3, -10] },
    { color: 0xff2244, pos: [ 10, 3, -10] },
    { color: 0x22ff88, pos: [  0, 3,  12] },
  ].forEach(({ color, pos }) => {
    const pt = new THREE.PointLight(color, 0.8, 18);
    pt.position.set(...pos);
    scene.add(pt);
  });

  buildArena();
  window.addEventListener('resize', onResize);
}

// ═══════════════════════════════════════════
//  ARENA
// ═══════════════════════════════════════════
function buildArena() {
  // Sol
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 16, 16),
    new THREE.MeshLambertMaterial({ color: 0x222233 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grille
  const grid = new THREE.GridHelper(ARENA_SIZE, 20, 0x334455, 0x223344);
  grid.position.y = 0.01;
  scene.add(grid);

  // Plafond
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
    new THREE.MeshLambertMaterial({ color: 0x111122, side: THREE.BackSide })
  );
  ceil.position.y = ARENA_HEIGHT;
  ceil.rotation.x = -Math.PI / 2;
  scene.add(ceil);

  // Murs
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x1e2035 });
  [
    { w: ARENA_SIZE, x:            0, z: -ARENA_SIZE/2, ry: 0          },
    { w: ARENA_SIZE, x:            0, z:  ARENA_SIZE/2, ry: Math.PI    },
    { w: ARENA_SIZE, x: -ARENA_SIZE/2, z:            0, ry: Math.PI/2  },
    { w: ARENA_SIZE, x:  ARENA_SIZE/2, z:            0, ry: -Math.PI/2 },
  ].forEach(({ w, x, z, ry }) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ARENA_HEIGHT), wallMat);
    m.position.set(x, ARENA_HEIGHT / 2, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    scene.add(m);
  });

  // Piliers
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, ARENA_HEIGHT, 8),
      new THREE.MeshLambertMaterial({ color: 0x2a2d4a })
    );
    pillar.position.set(Math.cos(angle) * 9, ARENA_HEIGHT / 2, Math.sin(angle) * 9);
    pillar.castShadow = true;
    scene.add(pillar);
  }

  // Caisses
  for (let i = 0; i < 8; i++) {
    const size  = 0.8 + Math.random() * 0.8;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 4 + Math.random() * 7;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({ color: 0x3a3050 })
    );
    box.position.set(Math.cos(angle) * dist, size / 2, Math.sin(angle) * dist);
    box.rotation.y = Math.random() * Math.PI;
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }
}

// ═══════════════════════════════════════════
//  TARGETS
// ═══════════════════════════════════════════
function spawnTarget() {
  const speedMult = DIFFICULTY_SPEED[settings.difficulty] || 1;
  const type  = TARGET_TYPES[Math.floor(Math.random() * TARGET_TYPES.length)];
  const mesh  = new THREE.Mesh(
    new THREE.SphereGeometry(type.size, 16, 16),
    new THREE.MeshPhongMaterial({
      color: type.color,
      emissive: type.color,
      emissiveIntensity: 0.3,
      shininess: 80,
    })
  );

  const angle = Math.random() * Math.PI * 2;
  const dist  = 4 + Math.random() * 9;
  mesh.position.set(
    Math.cos(angle) * dist,
    1.5 + Math.random() * 3,
    Math.sin(angle) * dist
  );
  mesh.castShadow = true;

  const halo = new THREE.PointLight(type.color, 0.6, 3);
  mesh.add(halo);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(type.size * 1.4, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: type.color, transparent: true, opacity: 0.6 })
  );
  mesh.add(ring);

  scene.add(mesh);

  const dir = new THREE.Vector3(
    Math.random() - 0.5,
    (Math.random() - 0.5) * 0.3,
    Math.random() - 0.5
  ).normalize();

  targets.push({
    mesh,
    type,
    dir,
    speed: type.speed * speedMult,
    ring,
    alive: true,
    baseY: mesh.position.y,
  });
}

function clearTargets() {
  targets.forEach(t => scene.remove(t.mesh));
  targets = [];
}

function spawnAllTargets() {
  clearTargets();
  for (let i = 0; i < TARGET_COUNT; i++) spawnTarget();
}

// ═══════════════════════════════════════════
//  GAME FLOW
// ═══════════════════════════════════════════
function startGame() {
  showOverlay(null);

  score = 0; hits = 0; shots = 0;
  ammo  = MAX_AMMO; reserve = RESERVE_AMMO;
  timeLeft    = GAME_DURATION;
  isReloading = false;
  yaw = 0; pitch = 0;

  applySettings();
  updateHUD();
  spawnAllTargets();
  isPlaying = true;
  clock.start();

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isPlaying) return;
    timeLeft--;
    document.getElementById('timer-val').textContent = timeLeft;
    if (timeLeft <= 0) endGame();
  }, 1000);

  document.getElementById('canvas').requestPointerLock();
}

function endGame() {
  isPlaying = false;
  clearInterval(timerInterval);
  clearTargets();
  document.exitPointerLock();

  const acc = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-hits').textContent  = hits;
  document.getElementById('final-acc').textContent   = acc + '%';
  document.getElementById('final-shots').textContent = shots;

  showOverlay('gameover');
}

// ═══════════════════════════════════════════
//  SHOOT
// ═══════════════════════════════════════════
function shoot() {
  if (!isPlaying || isReloading) return;
  if (ammo <= 0) { triggerReload(); return; }

  ammo--;
  shots++;
  updateHUD();

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const meshes   = targets.filter(t => t.alive).map(t => t.mesh);
  const hitsList = raycaster.intersectObjects(meshes);

  if (hitsList.length > 0) {
    const hitMesh = hitsList[0].object;
    const target  = targets.find(t => t.mesh === hitMesh);
    if (target && target.alive) {
      target.alive = false;
      hits++;
      score += target.type.points;
      if (settings.hitmarker) showHitmarker();
      addKillFeed(target.type.points);
      hitEffect(hitMesh);
      setTimeout(() => {
        scene.remove(hitMesh);
        targets = targets.filter(t => t !== target);
        spawnTarget();
      }, 250);
    }
  } else {
    flashMiss();
  }

  updateHUD();

  if (ammo === 0 && reserve > 0 && settings.autoReload) triggerReload();
}

// ═══════════════════════════════════════════
//  RELOAD
// ═══════════════════════════════════════════
function triggerReload() {
  if (isReloading || reserve <= 0 || ammo === MAX_AMMO) return;
  isReloading = true;
  reloadStart = performance.now() / 1000;
  document.getElementById('reload-bar-wrap').style.display = 'block';
}

function updateReload(now) {
  if (!isReloading) return;
  const elapsed  = now - reloadStart;
  const progress = Math.min(elapsed / RELOAD_TIME, 1);
  document.getElementById('reload-bar-fill').style.width = (progress * 100) + '%';

  if (progress >= 1) {
    const needed = MAX_AMMO - ammo;
    const take   = Math.min(needed, reserve);
    ammo    += take;
    reserve -= take;
    isReloading = false;
    document.getElementById('reload-bar-wrap').style.display = 'none';
    updateHUD();
  }
}

// ═══════════════════════════════════════════
//  VISUAL FX
// ═══════════════════════════════════════════
function showHitmarker() {
  const hm = document.getElementById('hitmarker');
  hm.classList.add('show');
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => hm.classList.remove('show'), 120);
}

function flashMiss() {
  const f = document.getElementById('flash');
  f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 80);
}

function hitEffect(mesh) {
  mesh.material.emissiveIntensity = 1.5;
  setTimeout(() => { if (mesh.material) mesh.material.emissiveIntensity = 0.3; }, 60);
}

function addKillFeed(pts) {
  const feed = document.getElementById('killfeed');
  const el   = document.createElement('div');
  el.className   = 'kill-entry';
  el.textContent = `+${pts} pts`;
  feed.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// ═══════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════
function updateHUD() {
  document.getElementById('score-val').textContent = score;
  document.getElementById('hits-val').textContent  = hits;
  document.getElementById('ammo-val').textContent  = `${ammo} / ${reserve}`;
  const acc = shots > 0 ? Math.round((hits / shots) * 100) + '%' : '—';
  document.getElementById('acc-val').textContent = acc;
}

// ═══════════════════════════════════════════
//  OVERLAY ROUTER
// ═══════════════════════════════════════════
function showOverlay(name) {
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  if (name) {
    const el = document.getElementById(name + '-overlay');
    if (el) el.classList.add('active');
  }
}

// ═══════════════════════════════════════════
//  SETTINGS UI
// ═══════════════════════════════════════════
function openSettings(fromGame = false) {
  if (fromGame && isPlaying) {
    isPlaying = false;
    document.exitPointerLock();
  }
  document.getElementById('settings-overlay').dataset.fromGame = fromGame ? '1' : '0';
  showOverlay('settings');
}

function closeSettings() {
  const fromGame = document.getElementById('settings-overlay').dataset.fromGame === '1';
  applySettings();
  if (fromGame) {
    showOverlay(null);
    isPlaying = true;
    document.getElementById('canvas').requestPointerLock();
  } else {
    showOverlay('menu');
  }
}

function resetSettings() {
  settings.sensitivity  = 1.0;
  settings.fov          = 75;
  settings.volume       = 0.8;
  settings.showFps      = false;
  settings.hitmarker    = true;
  settings.autoReload   = true;
  settings.crosshairSize= 1.0;
  settings.difficulty   = 'normal';
  populateSettingsUI();
}

function populateSettingsUI() {
  setSlider('sens-slider',       settings.sensitivity,   v => v.toFixed(1));
  setSlider('fov-slider',        settings.fov,           v => Math.round(v));
  setSlider('volume-slider',     settings.volume,        v => Math.round(v * 100) + '%');
  setSlider('crosshair-slider',  settings.crosshairSize, v => v.toFixed(1));
  setToggle('fps-toggle',        settings.showFps);
  setToggle('hitmarker-toggle',  settings.hitmarker);
  setToggle('autoreload-toggle', settings.autoReload);
  document.getElementById('difficulty-select').value = settings.difficulty;
}

function setSlider(id, value, fmt) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = value;
  const display = input.closest('.setting-slider-wrap')?.querySelector('span');
  if (display) display.textContent = fmt(value);
}

function setToggle(id, value) {
  const input = document.getElementById(id);
  if (input) input.checked = value;
}

function readSettings() {
  settings.sensitivity  = parseFloat(document.getElementById('sens-slider').value);
  settings.fov          = parseInt(document.getElementById('fov-slider').value);
  settings.volume       = parseFloat(document.getElementById('volume-slider').value);
  settings.crosshairSize= parseFloat(document.getElementById('crosshair-slider').value);
  settings.showFps      = document.getElementById('fps-toggle').checked;
  settings.hitmarker    = document.getElementById('hitmarker-toggle').checked;
  settings.autoReload   = document.getElementById('autoreload-toggle').checked;
  settings.difficulty   = document.getElementById('difficulty-select').value;
}

function applySettings() {
  readSettings();
  if (camera) {
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
  }
  document.getElementById('fps-counter').style.display = settings.showFps ? 'block' : 'none';
}

// Live slider feedback
function initSettingsListeners() {
  const sliders = [
    { id: 'sens-slider',      key: 'sensitivity',   fmt: v => (+v).toFixed(1) },
    { id: 'fov-slider',       key: 'fov',           fmt: v => Math.round(v) },
    { id: 'volume-slider',    key: 'volume',        fmt: v => Math.round(v * 100) + '%' },
    { id: 'crosshair-slider', key: 'crosshairSize', fmt: v => (+v).toFixed(1) },
  ];
  sliders.forEach(({ id, key, fmt }) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
      settings[key] = parseFloat(input.value);
      const display = input.closest('.setting-slider-wrap')?.querySelector('span');
      if (display) display.textContent = fmt(input.value);
    });
  });
}

// ═══════════════════════════════════════════
//  POINTER LOCK & INPUT
// ═══════════════════════════════════════════
function initInput() {
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === document.getElementById('canvas');
  });

  document.addEventListener('mousemove', e => {
    if (!pointerLocked || !isPlaying) return;
    const sens = 0.0018 * settings.sensitivity;
    yaw   -= e.movementX * sens;
    pitch -= e.movementY * sens;
    pitch  = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
  });

  document.getElementById('canvas').addEventListener('click', () => {
    if (!isPlaying) return;
    if (!pointerLocked) {
      document.getElementById('canvas').requestPointerLock();
    } else {
      shoot();
    }
  });

  document.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'r' && isPlaying && !isReloading && ammo < MAX_AMMO && reserve > 0) {
      triggerReload();
    }
    if (key === 'escape' && isPlaying) {
      // Ouvre les settings depuis le jeu
      openSettings(true);
    }
  });
}

// ═══════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════
function animate(now) {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t  = clock.getElapsedTime();

  // FPS counter
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsDisplay = Math.round(fpsFrames / fpsTime);
    fpsFrames  = 0;
    fpsTime    = 0;
    document.getElementById('fps-counter').textContent = fpsDisplay + ' FPS';
  }

  if (isPlaying) {
    // Caméra
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    // Reload
    updateReload(performance.now() / 1000);

    // Cibles
    targets.forEach(target => {
      if (!target.alive) return;
      const m   = target.mesh;
      const spd = target.speed * dt;

      m.position.addScaledVector(target.dir, spd);
      m.position.y = target.baseY + Math.sin(t * 1.5 + m.id) * 0.4;

      const limit = ARENA_SIZE / 2 - 1;
      if (Math.abs(m.position.x) > limit) {
        target.dir.x *= -1;
        m.position.x = Math.sign(m.position.x) * limit;
      }
      if (Math.abs(m.position.z) > limit) {
        target.dir.z *= -1;
        m.position.z = Math.sign(m.position.z) * limit;
      }

      target.ring.rotation.x = t;
      target.ring.rotation.y = t * 0.7;
    });
  }

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ═══════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════
initScene();
initInput();
initSettingsListeners();
populateSettingsUI();
showOverlay('menu');
animate();