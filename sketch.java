/*
===== Handguns and Hand Grenades ft. JavaMonkey =====
Final cleaned sketch — deltaTime fixes, single declarations, randomized targets per round
+ font loading fix + inverted vertical aim fix

--------- Config ----------
const ROUNDS_TOTAL = 4;
const ROUND_DURATION_MS = 45 * 1000; // 45s per round
const MOUSE_SENS = 0.0025;
const SNIPER_GRAVITY = -0.01; // base gravity used (scaled by dt)
const MAX_BULLETS = 400;

--------- Globals ----------
let floorTexture = null;

let cam = {
  x: 0,    // world X (left-right)
  y: 100, // world Y (forward/back) - negative is "forward/downrange"
  z: 150,  // vertical height
  th: -Math.PI / 2, // yaw facing downrange by default
  phi: 0            // pitch
};

let spd = 8; // movement speed base

let keys = {};
let pointerLocked = false;
let dragging = false;
let dragPrev = { x: 0, y: 0 };

let bullets = [];
let grenades = [];
let targets = [];

let score = 0;
let hits = 0;
let roundIndex = -1; // -1 before starting
let roundStartTime = 0;
let roundScores = [];

let gameState = "intro"; // "intro", "round", "round_end", "game_over"
let popup = { text: "", start: 0, dur: 0 };
let grenadeState = 0; // 0=unused,1=fake used,2=real used/exhausted

let canvasElt = null;

// Shooting burst state (single declaration)
let shootingFlag = false;
let shootTimer = 0;
let burstShots = 0; // Add this line to track burst shots
const BURST_MAX = 3; // Only 3 shots per burst

// Font variable
let safeFont;

// Credits timer for rolling credits
let creditsStartTime = 0;

// --- Add weapon/ammo globals ---
let weaponType = "pistol"; // "pistol" or "shotgun"
let ammo = { pistol: 12, shotgun: 5 };
let reserve = { pistol: 60, shotgun: 25 };
let magSize = { pistol: 12, shotgun: 5 };
let reloading = false;
let reloadTimer = 0;
const reloadTime = { pistol: 1200, shotgun: 1800 }; // ms

// Shake effect variables
let shakeTimer = 0;
let shakeStrength = 0;

--------- Preload ----------
function preload() {
  try {
    floorTexture = loadImage("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Parquet_flooring_in_Mus%C3%A9e_des_arts_d%C3%A9coratifs_de_Strasbourg.jpg/1280px-Parquet_flooring_in_Mus%C3%A9e_des_arts_d%C3%A9coratifs_de_Strasbourg.jpg");
  } catch (e) {
    floorTexture = null;
  }
  try {
    safeFont = loadFont('Roboto-Regular.ttf');
  } catch (e) {
    safeFont = 'sans-serif';
  }
}

--------- Setup ----------
function setup() {
  createCanvas(window.innerWidth, window.innerHeight, WEBGL);
  pixelDensity(1);

  textFont(safeFont); // Set the safe font here to fix WEBGL font error
  textAlign(CENTER, CENTER);

  // camera initially facing downrange
  cam.x = 0;
  cam.y = 100; // moved further back for higher difficulty
  cam.z = 150;
  cam.th = -Math.PI / 2;
  cam.phi = 0;

  setupPointerLockAndMouse();
  //preveny obj spawn before first click
}

// Pointer-lock + drag fallback
function setupPointerLockAndMouse() {
  canvasElt = document.querySelector('canvas');
  if (!canvasElt) return;

  canvasElt.addEventListener('click', () => {
    if (canvasElt.requestPointerLock) {
      canvasElt.requestPointerLock();
    } else {
      dragging = true;
      dragPrev = { x: mouseX, y: mouseY };
    }
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvasElt);
  });

  document.addEventListener('mousemove', (e) => {
    if (pointerLocked && (gameState === "round" || gameState === "intro" || gameState === "round_end" || gameState === "game_over")) {
      cam.th += e.movementX * MOUSE_SENS;
      cam.phi += -e.movementY * MOUSE_SENS;
      const lim = Math.PI / 2 - 0.01;
      cam.phi = constrain(cam.phi, -lim, lim);
    } else if (dragging && !pointerLocked && (gameState === "round" || gameState === "intro" || gameState === "round_end" || gameState === "game_over")) {
      const dx = mouseX - dragPrev.x;
      const dy = mouseY - dragPrev.y;
      cam.th += dx * 0.01;
      cam.phi += -dy * 0.01;
      dragPrev = { x: mouseX, y: mouseY };
      cam.phi = constrain(cam.phi, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }
  });

  document.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('blur', () => { dragging = false; });
}

--------- Utilities ----------
function popupMessage(txt, dur = 3500) { // Increased default duration
  popup.text = txt;
  popup.start = millis();
  popup.dur = dur;
}

function cameraForwardVec() {
  // forward vector from camera yaw/pitch
  const fx = Math.cos(cam.phi) * Math.cos(cam.th); // x (left/right)
  const fy = Math.cos(cam.phi) * Math.sin(cam.th); // y (forward/back)
  const fz = -Math.sin(cam.phi);                   // z (up/down), negative for correct direction
  return createVector(fx, fy, fz);
}

function worldToScreen(wx, wy, wz) {
  // Projects a 3D world point to 2D screen coordinates
  let screenPos = createVector(wx, wy, wz);
  let projected = screenPosition(screenPos);
  // screenPosition returns coordinates relative to canvas center
  return projected;
}

--------- Targets & Rounds ----------
function resetTargetsForRound(r) {
  targets = [];
  const base = [
    [500, 800, 1100],
    [700, 1200, 1700],
    [900, 1500, 2100],
    [1400, 2000, 2800]
  ];
  const dists = base[r];
  for (let i = 0; i < dists.length; i++) {
    const side = (i % 2 === 0) ? -1 : 1;
    let tx = side * (200 + random(-150, 150));        // X
    let ty = -dists[i] + random(-60, 60);             // Y (forward/back)
    let tz = random(20, 80);                          // Z (height)
    let radius = map(dists[i], 500, 2800, 60, 28);
    targets.push({
      pos: createVector(tx, ty, tz),
      baseX: tx,
      phase: random(TWO_PI),
      radius: radius,
      alive: true,
      pts: Math.round(map(dists[i], 500, 2800, 20, 120))
    });
  }
}

function startRound(idx) {
  roundIndex = idx;
  roundStartTime = millis();
  resetTargetsForRound(idx);
  bullets = [];
  grenades = [];
  popupMessage("Round " + (idx + 1) + " start!", 1200);
  gameState = "round";
}

function endRound() {
  // Center the camera after each round
  cam.th = -Math.PI / 2;
  cam.phi = 0;
  const prevSum = roundScores.reduce((a, b) => a + b, 0);
  const thisRoundPts = score - prevSum;
  roundScores.push(thisRoundPts);
  popupMessage("Round " + (roundIndex + 1) + " complete: +" + thisRoundPts, 1800);

  if (roundIndex + 1 >= ROUNDS_TOTAL) {
    gameState = "game_over";
    creditsStartTime = millis(); // <-- Set credits timer here
  } else {
    gameState = "round_end";
  }
}

--------- Bullet & Grenade Classes (dt passed to update) ----------
function Bullet(px, py, pz, vx, vy, vz, hasDrop) {
  this.pos = createVector(px, py, pz);
  this.vel = createVector(vx, vy, vz);
  this.radius = 6;
  this.travel = 0;
  this.maxTravel = 10000;
  this.hit = false;
  this.hasDrop = hasDrop;
}
Bullet.prototype.update = function (dt) {
  if (this.hit) return;
  if (this.hasDrop) {
    const g = SNIPER_GRAVITY * (dt / 16.6667);
    this.vel.z += g; // z is vertical
  }
  this.pos.add(this.vel);
  this.travel += this.vel.mag();
  if (this.travel > this.maxTravel) this.hit = true;
};
Bullet.prototype.draw = function () {
  if (this.hit) return;
  push();
  translate(this.pos.x, this.pos.y, this.pos.z);
  noStroke();
  ambientMaterial(240, 220, 40);
  sphere(this.radius);
  pop();
};

function Grenade(px, py, pz, vx, vy, vz) {
  this.pos = createVector(px, py, pz);
  this.vel = createVector(vx, vy, vz);
  this.timer = 0;
  this.exploded = false;
  this.explosionTimer = 0;
  this.explosionPos = null;
}
Grenade.prototype.update = function (dt) {
  if (this.exploded) {
    this.explosionTimer += dt;
    return;
  }
  const g = -0.08 * (dt / 16.6667);
  this.vel.z += g;
  this.pos.add(this.vel);
  this.timer += dt;

  // Explode on contact with any alive target
  for (let t of targets) {
    if (!t.alive) continue;
    const d = dist(this.pos.x, this.pos.y, this.pos.z, t.pos.x, t.pos.y, t.pos.z);
    if (d < t.radius + 10) { // 10 is grenade radius
      this.explode();
      return;
    }
  }

  if (this.timer > 1800) this.explode();
};
Grenade.prototype.draw = function () {
  if (this.exploded) {
    if (this.explosionTimer < 500 && this.explosionPos) {
      push();
      translate(this.explosionPos.x, this.explosionPos.y, this.explosionPos.z);
      noStroke();
      ambientMaterial(255, 180, 40, 200);
      sphere(60 + this.explosionTimer * 0.5);
      pop();
    }
    return;
  }
  push();
  translate(this.pos.x, this.pos.y, this.pos.z);
  ambientMaterial(220, 120, 40);
  sphere(10);
  pop();
};
Grenade.prototype.explode = function () {
  if (this.exploded) return;
  this.exploded = true;
  this.explosionTimer = 0;
  this.explosionPos = this.pos.copy();
  const explR = 300;
  for (let t of targets) {
    if (!t.alive) continue;
    const d = dist(this.pos.x, this.pos.y, this.pos.z, t.pos.x, t.pos.y, t.pos.z);
    if (d < explR) {
      t.alive = false;
      score += t.pts;
      hits++;
    }
  }
  shakeTimer = 400;
  shakeStrength = 18;
  popupMessage("Boom! grenade exploded", 1600);
};

--------- Spawners ----------
function spawnBulletFromCamera() {
  const forwardX = Math.cos(cam.phi) * Math.cos(cam.th);
  const forwardY = Math.cos(cam.phi) * Math.sin(cam.th);
  const forwardZ = -Math.sin(cam.phi);

  const speed = 14;
  const vx = forwardX * speed;
  const vy = forwardY * speed;
  const vz = forwardZ * speed;

  bullets.push(new Bullet(
    cam.x + vx * 2,
    cam.y + vy * 2,
    cam.z + vz * 2,
    vx, vy, vz, true
  ));
  if (bullets.length > MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS);
}

function spawnShotgunFromCamera() {
  const forwardX = Math.cos(cam.phi) * Math.cos(cam.th);
  const forwardY = Math.cos(cam.phi) * Math.sin(cam.th);
  const forwardZ = -Math.sin(cam.phi);
  const speed = 13;
  for (let i = 0; i < 5; i++) {
    let spreadTh = cam.th + random(-0.08, 0.08);
    let spreadPhi = cam.phi + random(-0.06, 0.06);
    let fx = Math.cos(spreadPhi) * Math.cos(spreadTh);
    let fy = Math.cos(spreadPhi) * Math.sin(spreadTh);
    let fz = -Math.sin(spreadPhi);
    let vx = fx * speed;
    let vy = fy * speed;
    let vz = fz * speed;
    bullets.push(new Bullet(
      cam.x + vx * 2,
      cam.y + vy * 2,
      cam.z + vz * 2,
      vx, vy, vz, true
    ));
  }
  if (bullets.length > MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS);
}

function spawnGrenadeFromCameraWrapper(works = false) {
  if (!works) {
    popupMessage("can't program everything in 4 hours", 2400);
    return;
  }
  const forwardX = Math.cos(cam.phi) * Math.cos(cam.th);
  const forwardY = Math.cos(cam.phi) * Math.sin(cam.th);
  const forwardZ = -Math.sin(cam.phi);

  const speed = 12;
  const vx = forwardX * speed;
  const vy = forwardY * speed;
  const vz = forwardZ * speed + 2;

  grenades.push(new Grenade(
    cam.x + forwardX * 30,
    cam.y + forwardY * 30,
    cam.z - 20,
    vx, vy, vz
  ));
}*/
