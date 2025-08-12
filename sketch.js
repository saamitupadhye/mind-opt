// ===== Handguns and Hand Grenades ft. JavaMonkey =====
// Final cleaned sketch — deltaTime fixes, single declarations, randomized targets per round
// + font loading fix + inverted vertical aim fix

// --------- Config ----------
const ROUNDS_TOTAL = 4;
const ROUND_DURATION_MS = 45 * 1000; // 45s per round
const MOUSE_SENS = 0.0025;
const SNIPER_GRAVITY = -0.01; // base gravity used (scaled by dt)
const MAX_BULLETS = 400;

// --------- Globals ----------
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

// --------- Preload ----------
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

// --------- Setup ----------
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

// --------- Utilities ----------
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

// --------- Targets & Rounds ----------
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

// --------- Bullet & Grenade Classes (dt passed to update) ----------
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
  this.explosionTimer = 0;      // NEW: time since explosion
  this.explosionPos = null;     // NEW: where it exploded
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
    // Draw explosion for 500ms
    if (this.explosionTimer < 500 && this.explosionPos) {
      push();
      translate(this.explosionPos.x, this.explosionPos.y, this.explosionPos.z);
      noStroke();
      ambientMaterial(255, 180, 40, 200);
      sphere(60 + this.explosionTimer * 0.5); // Expanding sphere
      pop();
    }
    return;
  }
  // Draw grenade sphere
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
  // Trigger screen shake
  shakeTimer = 400; // ms
  shakeStrength = 18; // pixels
  popupMessage("Boom! grenade exploded", 1600);
};

// --------- Spawners ----------
// FIXED vertical aim inversion here: the 'fy' component sign is flipped to match mouse movement
function spawnBulletFromCamera() {
  // Calculate forward vector in world axes
  const forwardX = Math.cos(cam.phi) * Math.cos(cam.th); // x (left/right)
  const forwardY = Math.cos(cam.phi) * Math.sin(cam.th); // y (forward/back)
  const forwardZ = -Math.sin(cam.phi);                   // z (up/down), negative for correct direction

  const speed = 20;
  const vx = forwardX * speed;
  const vy = forwardY * speed;
  const vz = forwardZ * speed;

  // Apply bullet drop to all rounds (hasDrop = true)
  bullets.push(new Bullet(
    cam.x + vx * 2,
    cam.y + vy * 2,
    cam.z + vz * 2,
    vx, vy, vz, true
  ));
  if (bullets.length > MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS);
}

function spawnGrenadeFromCameraWrapper(works = false) {
  if (!works) {
    popupMessage("can't program everything in 4 hours", 2400);
    return;
  }
  // Use the same forward vector mapping as bullets
  const forwardX = Math.cos(cam.phi) * Math.cos(cam.th);
  const forwardY = Math.cos(cam.phi) * Math.sin(cam.th);
  const forwardZ = -Math.sin(cam.phi);

  const speed = 16;
  const vx = forwardX * speed;
  const vy = forwardY * speed;
  // Only a small upward boost (e.g., +2)
  const vz = forwardZ * speed + 2;

  // Spawn grenade further in front and a bit lower than camera
  grenades.push(new Grenade(
    cam.x + forwardX * 30,
    cam.y + forwardY * 30,
    cam.z - 20,
    vx, vy, vz
  ));
}

// --------- Input handlers ----------
function keyPressed() {
  keys[keyCode] = true;

  if (gameState === "intro") {
    // press any key to start
    startRound(0);
    return;
  }
  if (gameState === "round_end") {
    if (roundIndex + 1 < ROUNDS_TOTAL) startRound(roundIndex + 1);
    else {
      gameState = "game_over";
      creditsStartTime = millis();
    }
    return;
  }

  // Weapon switching
  if (key === '1') weaponType = "pistol";
  if (key === '2') weaponType = "shotgun";

  // Reload
  if ((key === 'r' || key === 'R') && !reloading && ammo[weaponType] < magSize[weaponType] && reserve[weaponType] > 0) {
    reloading = true;
    reloadTimer = millis();
    popupMessage("Reloading...", reloadTime[weaponType]);
    return;
  }

  // grenade: G
  if (keyCode === 71 && gameState === "round") {
    if (grenadeState === 0) {
      grenadeState = 1;
      popupMessage("can't program everything in 4 hours", 1600);
    } else if (grenadeState === 1) {
      // Only allow second message if previous popup is gone
      if (!popup.text) {
        grenadeState = 2;
        popupMessage("or maybe you can program everything in 4 hours", 1800);
        spawnGrenadeFromCameraWrapper(true);
      }
    } else {
      popupMessage("grenades over.", 1400);
    }
  }

  // shoot: C (short burst sim)
  if ((key === 'c' || key === 'C') && gameState === "round") {
    if (!shootingFlag && !reloading) {
      if (ammo[weaponType] > 0) {
        shootingFlag = true;
        shootTimer = 0;
        burstShots = 0; // Reset burst shot count
      } else {
        popupMessage("Out of ammo! Press R to reload.", 1800);
      }
    }
  }
}

function keyReleased() {
  keys[keyCode] = false;
}

function keyTyped() {
  if (gameState === "intro") {
    startRound(0);
    return;
  }
  if (gameState === "round_end") {
    if (roundIndex + 1 < ROUNDS_TOTAL) startRound(roundIndex + 1);
    else {
      gameState = "game_over";
      creditsStartTime = millis(); // Start credits timer
    }
    return;
  }
}

// pointer lock click/start
function mousePressed() {
  if (canvasElt && canvasElt.requestPointerLock) canvasElt.requestPointerLock();

  if (gameState === "intro") {
    cam.th = -Math.PI / 2;
    cam.phi = 0;
    startRound(0);
  }
}

// --------- Main draw (dt used only here and passed down) ----------
function draw() {
  // set text font per frame (reduces WEBGL font warnings)
  textFont(safeFont);
  textSize(16);

  // background sky
  background(64, 110, 160);

  // early states
  if (gameState === "intro") {
    drawIntro();
    drawPopupIfAny();
    return;
  }
  if (gameState === "round_end") {
    // Draw overlays in 2D
    resetMatrix();
    drawHUDOverlay();
    drawPopupIfAny();
    return;
  }
  if (gameState === "game_over") {
    popupMessage("Game is over. Refresh to play again.", 2000);
    return;
  }

  // Handle reloading
  if (reloading) {
    if (millis() - reloadTimer >= reloadTime[weaponType]) {
      let needed = magSize[weaponType] - ammo[weaponType];
      let toLoad = min(needed, reserve[weaponType]);
      ammo[weaponType] += toLoad;
      reserve[weaponType] -= toLoad;
      reloading = false;
    }
  }

  // movement
  handleMovement();

  // --- Screen shake effect ---
  let shakeX = 0, shakeY = 0, shakeZ = 0;
  if (shakeTimer > 0) {
    shakeX = random(-shakeStrength, shakeStrength);
    shakeY = random(-shakeStrength, shakeStrength);
    shakeZ = random(-shakeStrength * 0.5, shakeStrength * 0.5);
    shakeTimer -= deltaTime;
    if (shakeTimer < 0) shakeTimer = 0;
    if (shakeTimer === 0) shakeStrength = 0;
  }

  // camera
  applyCameraTransform(shakeX, shakeY, shakeZ);

  // lights & floor
  ambientLight(80);
  directionalLight(255, 255, 255, 0.5, 0.5, -1);
  drawFloorAndWalls();

  // draw targets
  drawTargetsWorld();

  // dt for updates (ms)
  const dt = deltaTime;

  // grenades update & draw
  for (let i = grenades.length - 1; i >= 0; i--) {
    grenades[i].update(dt);
    grenades[i].draw();
    if (grenades[i].exploded) grenades.splice(i, 1);
  }

  // bullets update & draw, with collision checks
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update(dt);
    b.draw();
    if (!b.hit) {
      for (let j = 0; j < targets.length; j++) {
        const t = targets[j];
        if (!t.alive) continue;
        const d = dist(b.pos.x, b.pos.y, b.pos.z, t.pos.x, t.pos.y, t.pos.z);
        if (d < t.radius + b.radius) {
          b.hit = true;
          t.alive = false;
          score += t.pts;
          hits++;
          popupMessage("Target hit! +" + t.pts, 900);
          break;
        }
      }
    }
    if (b.hit) bullets.splice(i, 1);
  }

  // draw weapon placeholder
  drawWeaponPlaceholder();

  // handle short-burst shooting behavior (uses shootTimer/shootingFlag)
  handleShortBurst(dt);

  // end-of-round conditions
  if (gameState === "round") {
    const elapsed = millis() - roundStartTime;
    const aliveCount = targets.filter(t => t.alive).length;
    if (elapsed >= ROUND_DURATION_MS || aliveCount === 0) {
      endRound();
    }
  }

  // Draw overlays in 2D
  resetMatrix();
  drawHUDOverlay();
  drawPopupIfAny();
}

// --------- Movement & Camera Helpers ----------
function handleMovement() {
  const forward = (keys[87] ? 1 : 0) - (keys[83] ? 1 : 0); // W,S
  const strafe = (keys[68] ? 1 : 0) - (keys[65] ? 1 : 0); // D,A
  // scale down spd slightly because world units are large
  cam.x += (forward * Math.cos(cam.th) - strafe * Math.sin(cam.th)) * (spd * 0.01);
  cam.y += (forward * Math.sin(cam.th) + strafe * Math.cos(cam.th)) * (spd * 0.01);
  // cam.z fixed
}

function applyCameraTransform(shakeX = 0, shakeY = 0, shakeZ = 0) {
  const camX = cam.x + shakeX;
  const camY = cam.y + shakeY;
  const camZ = cam.z + shakeZ;
  const lookX = camX + 10 * Math.cos(cam.phi) * Math.cos(cam.th);
  const lookY = camY + 10 * Math.cos(cam.phi) * Math.sin(cam.th);
  const lookZ = camZ + -10 * Math.sin(cam.phi);
  camera(camX, camY, camZ, lookX, lookY, lookZ, 0, 0, -1);
}

// --------- Drawing helpers ---------
function drawFloorAndWalls() {
  if (floorTexture) {
    push();
    noStroke();
    texture(floorTexture);
    rotateX(HALF_PI);
    translate(0, 0, -100);
    plane(2000, 2000);
    pop();
  } else {
    push();
    noStroke();
    ambientMaterial(100, 140, 80);
    rotateX(HALF_PI);
    translate(0, 0, -100);
    plane(2000, 2000);
    pop();
  }
}

function drawTargetsWorld() {
  let tNow = millis() * 0.001;

  // Find the closest alive target (smallest pos.y, since y is forward/back)
  let closestIdx = -1;
  let closestDist = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive) continue;
    // Use distance from camera to target for generality
    let distToCam = dist(cam.x, cam.y, cam.z, t.pos.x, t.pos.y, t.pos.z);
    if (distToCam < closestDist) {
      closestDist = distToCam;
      closestIdx = i;
    }
  }

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive) continue;
    let moveX = t.pos.x;
    if (i === closestIdx) {
      // Only the closest target moves
      moveX = t.baseX + 60 * sin(tNow + t.phase);
      t.pos.x = moveX; // Update for collision
    }
    push();
    translate(moveX, t.pos.y, t.pos.z);
    noStroke();
    ambientMaterial(200, 60, 60);
    sphere(t.radius);
    pop();
  }
}

function drawWeaponPlaceholder() {
  // Draw a simple 3D gun shape always in front of the camera (first-person)
  push();

  // Move to camera position
  translate(cam.x, cam.y, cam.z);

  // Rotate to match camera orientation
  rotateZ(cam.th + Math.PI / 2);
  rotateX(-cam.phi);

  // Offset gun forward and down/right relative to camera
  translate(40, 15, -20);

  // Gun body
  ambientMaterial(30, 30, 30);
  box(40, 10, 10);

  // Gun barrel
  push();
  translate(20, 0, 0);
  ambientMaterial(80, 80, 80);
  box(20, 5, 5);
  pop();

  pop();
}

function drawHUDOverlay() {
  resetMatrix();
  fill(255);
  textSize(20);
  textAlign(LEFT, TOP);

  // Always show HUD in top left
  text("Score: " + score, 260 - width / 2, 20 - height / 2);
  text("Hits: " + hits, 260 - width / 2, 50 - height / 2);
  text("Round: " + (roundIndex + 1) + "/" + ROUNDS_TOTAL, 260 - width / 2, 80 - height / 2);
  text("Weapon: " + weaponType.toUpperCase(), 260 - width / 2, 150 - height / 2);
  text("Ammo: " + ammo[weaponType] + " / " + reserve[weaponType], 260 - width / 2, 200 - height / 2);
  if (reloading) {
    text("Reloading...", 20 - width / 2, 80 - height / 2);
  }

  // Show centered stats after round end
  if (gameState === "round_end") {
    textAlign(CENTER, CENTER);
    textSize(36);
    fill(255, 255, 0);
    text("Round " + (roundIndex + 1) + " Complete!", 0, -60);
    fill(255);
    textSize(28);
    text("Score: " + score, 0, 0);
    text("Hits: " + hits, 0, 40);
    text("Press any key to continue...", 0, 120);
  }

  // Show static end screen after game over
  if (gameState === "game_over") {
    resetMatrix();
    fill(255);
    textSize(30);
    textAlign(CENTER, CENTER);
    fill(255, 255, 0);
    textSize(36);
    text("Game Over!", 0, -100);
    fill(255);
    textSize(24);
    text("Final Score: " + score, 0, -40);
    text("Total Hits: " + hits, 0, 0);
    text("Thanks for playing!", 0, 60);
    textSize(18);
    text("Handguns and Hand Grenades\nby JavaMonkey\nMind Optimizer\nSaamit Upadhye XII A", 0, 120);
    // No restart prompt, game stays on this screen
  }
}

function drawPopupIfAny() {
  if (!popup.text) return;
  const elapsed = millis() - popup.start;
  if (elapsed > popup.dur) {
    popup.text = "";
    return;
  }
  resetMatrix();
  fill(255, 255, 0);
  textSize(32);
  textAlign(CENTER, CENTER);
  text(popup.text, 0, -height / 4);
}

function drawIntro() {
  resetMatrix();
  fill(255);
  textSize(30);
  textAlign(CENTER, CENTER);
  text("Hand Guns and Hand Grenades \n ft. JavaMonkey \n Mind Opimizer \n Saamit Upadhye XII A", 0, -100);
  textSize(20);
  text("Use WASD to move, mouse to look around.", 0, 10);
  text("Press any key to start.", 0, 50);
}

function handleShortBurst(dt) {
  if (!shootingFlag) return;
  shootTimer += dt;
  if (burstShots < BURST_MAX && shootTimer > burstShots * 100) {
    if (weaponType === "pistol") {
      if (ammo.pistol > 0) {
        spawnBulletFromCamera();
        ammo.pistol--;
      }
    } else if (weaponType === "shotgun") {
      if (ammo.shotgun > 0) {
        spawnShotgunFromCamera();
        ammo.shotgun--;
      }
    }
    burstShots++;
  }
  if (shootTimer >= BURST_MAX * 100) {
    shootingFlag = false;
    shootTimer = 0;
    burstShots = 0;
  }
}

// --------- Window resize ----------
function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
}

// --- Shotgun spawner ---
function spawnShotgunFromCamera() {
  const forwardX = Math.cos(cam.phi) * Math.cos(cam.th);
  const forwardY = Math.cos(cam.phi) * Math.sin(cam.th);
  const forwardZ = -Math.sin(cam.phi);
  const speed = 13;
  for (let i = 0; i < 5; i++) {
    // Spread: randomize pitch/yaw slightly
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
