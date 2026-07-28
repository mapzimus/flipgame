// physics.js — Matter.js world, bottle body, liquid sim

const Physics = (() => {
  const { Engine, Bodies, Body, World } = Matter;

  let engine, world, bottle, ground, leftWall, rightWall, ceilingBody;
  let groundedFrames = 0;
  let angleWin = [];   // sliding window of recent angles (settle detection)
  let totalRotation = 0, hasFlipped = false, launchAngle = 0, hasLanded = false;
  let lastLandingInfo = null;
  let lastFlickInfo = null;
  let canvasW;
  let groundY;
  let arenaH;   // full canvas height — obstacles are placed relative to it
  let sideWallsEnabled = true;
  let openArena = false;  // mobile open sides (no wall caroms)

  // Spin tuning (rad/step) — see applyFlick. Single sweet spot near 1 turn:
  // soft flick under-rotates (<360, fails), medium ≈ one clean turn (make),
  // hard overshoots (~1.3 turns, miss). Rotation ranges ~0.8 to ~1.35.
  const SPIN_BASE   = 0.140;  // spin from a soft flick (~0.8 turn)
  const SPIN_RANGE  = 0.100;  // extra spin at full-strength flick (~1.35 turn)
  const POWER_SPEED = 4000;   // flick speed (px/s) that maps to full power
  const WALL_INSET  = 14;     // px from each screen edge to the wall's inner face (matches renderer)
  const FIXED_DT    = 1 / 60; // multiplayer-safe fixed physics step
  let acc = 0;

  // ── Landing-detection knobs (the false-miss fix) ───────────────────────────
  // A verdict is read ONLY once the bottle has truly come to rest. A make is
  // called the instant it settles upright; an obvious miss (toppled flat, or
  // never completed a 360°) the instant it settles in that pose. But a
  // tipped-yet-recoverable pose — the bowling-pin bottle hovering near its ~40°
  // tipping point — is NOT judged: it can still slowly RIGHT itself into a make,
  // so we wait it out instead of calling a premature miss. Only if nothing
  // resolves within MISS_CAP_FRAMES (the glitch / teeter-stall fallback) do we
  // force a MISS so a turn can never soft-lock in EVALUATING.
  const SETTLE_FRAMES   = 22;    // frames of stillness required to read the pose
  const SETTLE_RANGE    = 0.03;  // rad — max angle spread across that window
  const MAKE_ANGLE      = 0.61;  // ≤±35° upright = MAKE
  const PERFECT_ANGLE   = 0.16;  // ≤~9° upright = perfect landing flair
  const FALLEN_ANGLE    = 1.20;  // ≥~69° tilt = toppled past recovery → certain MISS
  const MISS_CAP_FRAMES = 300;   // ~5s grounded with no verdict → forced MISS (fallback)

  // ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────
  // All in-flight randomness (launch jitter + landing kick + pad placement)
  // draws from this stream. applyFlick reseeds per flick, records the seed in
  // lastFlickInfo, and accepts an explicit seed to replay a flick exactly.
  let rngState = 1;
  function seedRng(seed) { rngState = (seed >>> 0) || 1; }
  function rand() {
    rngState = (rngState + 0x6D2B79F5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ── Per-edition physics profiles ───────────────────────────────────────────
  // Most editions are pure reskins and flip under the normal rules. An edition
  // can instead ship a profile (see META.physics in skins.js) that retunes
  // gravity, drag, bounce, the launch impulse and how a landing is judged.
  //
  // BOUNCE MODE (the 25-win alien) is a different game — a bank shot, not a
  // flip. You aim sideways, the object caroms off the two walls and the ceiling,
  // and the FLOOR is dead: the first time it touches down is where it landed,
  // and it counts if any part of it is over the target pad.
  //
  // OLYMPUS MODE (the 50-win gods) keeps the flip, but the floor is mostly
  // void: you must settle upright on a moving golden altar while wind gusts
  // and lightning bolts try to ruin the shot. Soft cloud bumpers nudge you.
  const DEFAULT_PROFILE = {
    gravity: 1.5,
    frictionAir: 0.025,
    friction: 0.85,
    restitution: 0.02,
    spinScale: 1,
    launchScale: 1,        // multiplies the upward launch speed
    horizDivisor: 280,     // px/s of flick per unit of sideways launch speed
    horizMax: 6,           // cap on sideways launch speed
    wallBounce: 0,         // restitution given to walls + ceiling
    ceiling: false,
    floorResolve: false,
    landOnTarget: false,
    targetHalfWidth: 84,
    requireFlip: true,
    missCapFrames: MISS_CAP_FRAMES,
    // Bounce-mode furniture. Multiple wedges + lots of saucers for alien.
    deflector: false,
    deflectorCount: 1,
    saucerCount: 0,
    // Olympus furniture
    movingTarget: false,
    wind: false,
    windStrength: 0,
    cloudCount: 0,
    lightning: false,
    keepWalls: false,      // force side walls even on mobile (alien needs them)
    minHorizRatio: 0,
    strictTarget: false,   // true = bottle CENTER must be on the pad (not any overlap)
    allowSlideIn: true,    // bounce mode: off-pad touchdown can still slide onto a MAKE
  };
  let profile = { ...DEFAULT_PROFILE };
  let targetX = null;      // pad center, only set when profile.landOnTarget
  let targetHW = 84;       // pad half-width actually in play (screen-scaled)
  let targetPhase = 0;     // moving altar phase
  let arenaTime = 0;
  let windDir = 1;
  let windTimer = 0;
  let windForce = 0;

  // The profile's targetHalfWidth is tuned for a phone. On a big screen the
  // same pad is a sliver of the arena and the bank shot turns pixel-perfect,
  // so the pad grows with canvas width — but alien's base is now small, and
  // the scale-up is capped tighter so smartboards aren't a freebie.
  function currentTargetHalfWidth() {
    const base = profile.targetHalfWidth;
    // Alien/hard pads: grow gently. Generous pads (legacy): old curve.
    const maxScale = base <= 55 ? 1.55 : 2.2;
    const frac = base <= 55 ? 0.07 : 0.115;
    return Math.round(Math.max(base, Math.min(canvasW * frac, base * maxScale)));
  }
  let launched = false;    // a flick has been taken this turn
  let wasAirborne = false; // ...and the body actually left the floor
  let floorTouched = false; // bounce mode: first touchdown happened (slide window open)
  let slideFrames = 0;      // frames spent in the post-touchdown slide window
  let maxGroundedTilt = 0;  // display-only: worst |tilt| seen while grounded this flip

  function wantsOpenArena() {
    if (profile.keepWalls || profile.wallBounce > 0) return false;
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    // Phones / small tablets: no side walls so wall-caroms can't make mobile easier.
    return canvasW < 900 || (coarse && canvasW < 1100);
  }

  function syncSideWalls() {
    openArena = wantsOpenArena();
    sideWallsEnabled = !openArena;
    const mask = sideWallsEnabled ? 0xFFFFFFFF : 0;
    if (leftWall)  leftWall.collisionFilter.mask = mask;
    if (rightWall) rightWall.collisionFilter.mask = mask;
  }

  // Apply before the turn's flick (main.js calls this per turn). Safe to call
  // with null/undefined to go back to normal physics.
  function setProfile(next) {
    profile = { ...DEFAULT_PROFILE, ...(next || {}) };
    if (engine) engine.gravity.y = profile.gravity;
    if (ceilingBody) ceilingBody.collisionFilter.mask = profile.ceiling ? 0xFFFFFFFF : 0;
    // Walls and ceiling are normally dead (no carom, no spin transfer — see
    // init) so difficulty doesn't track screen width. Bounce mode needs them
    // live. The GROUND is deliberately left dead in every profile: in bounce
    // mode the floor is where the shot ends, so it must not throw the object
    // back up.
    if (leftWall)    leftWall.restitution    = profile.wallBounce;
    if (rightWall)   rightWall.restitution   = profile.wallBounce;
    if (ceilingBody) ceilingBody.restitution = profile.wallBounce;
    applyBodyMaterial();
    syncSideWalls();
    placeTarget();
    buildObstacles(arenaH);
  }

  function applyBodyMaterial() {
    if (!bottle) return;
    const parts = [bottle, ...bottle.parts];
    for (const part of parts) {
      part.frictionAir = profile.frictionAir;
      part.friction    = profile.friction;
      part.restitution = profile.restitution;
    }
  }

  // ── Obstacles: deflector wedges, saucers, olympus clouds, lightning ────────
  let deflectors = [];
  let saucers = [];      // { body, vx, phase, rx, ry }
  let clouds = [];       // soft olympus bumpers
  let bolts = [];        // { x, active, timer, life }

  function clearObstacles() {
    for (const d of deflectors) World.remove(world, d);
    deflectors = [];
    for (const s of saucers) World.remove(world, s.body);
    saucers = [];
    for (const c of clouds) World.remove(world, c.body);
    clouds = [];
    bolts = [];
  }

  function addDeflector(cx, apexWorldY, halfW, height) {
    // fromVertices centers the body on the shape's centroid, which for this
    // triangle is height/6 above the middle — so the apex sits 2/3·height
    // below the centroid.
    const body = Bodies.fromVertices(cx, apexWorldY - (2 * height) / 3, [[
      { x: -halfW, y: -height / 2 },
      { x:  halfW, y: -height / 2 },
      { x: 0,      y:  height / 2 },
    ]], { isStatic: true, label: 'deflector', friction: 0, restitution: profile.wallBounce });
    if (body) {
      World.add(world, body);
      deflectors.push(body);
    }
  }

  function buildObstacles(h) {
    if (!world) return;
    clearObstacles();
    const arenaH = h || (groundY + 30);

    if (profile.deflector) {
      const count = Math.max(1, profile.deflectorCount || 1);
      const halfW = 62, height = 78;
      // Primary wedge over the launch spot — then extras staggered across the
      // ceiling band so ricochets keep getting scrambled (alien nerf).
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const cx = WALL_INSET + 90 + t * Math.max(40, canvasW - WALL_INSET * 2 - 180);
        // Alternate height bands so they don't form one solid roof.
        const apexWorldY = groundY - (400 + (i % 3) * 55 + (i % 2) * 25);
        addDeflector(cx, apexWorldY, halfW - (i % 3) * 6, height - (i % 2) * 8);
      }
    }

    for (let i = 0; i < profile.saucerCount; i++) {
      const lane = (i + 0.5) / Math.max(1, profile.saucerCount);
      const x = WALL_INSET + 50 + lane * Math.max(40, canvasW - WALL_INSET * 2 - 100);
      const y = groundY - 150 - (i % 4) * 70 - (i % 3) * 18;
      const rx = 38 + (i % 3) * 4, ry = 16 + (i % 2) * 3;
      const body = Bodies.rectangle(x, y, rx * 2, ry * 2, {
        label: 'saucer',
        frictionAir: 0.05,
        friction: 0,
        restitution: Math.max(0.7, profile.wallBounce),
        density: 0.0011,
      });
      World.add(world, body);
      saucers.push({
        body,
        vx: (i % 2 ? 1 : -1) * (0.85 + 0.55 * (i % 4)),
        phase: i * 1.3,
        rx, ry,
      });
    }

    for (let i = 0; i < profile.cloudCount; i++) {
      const lane = (i + 0.5) / Math.max(1, profile.cloudCount);
      const x = WALL_INSET + 70 + lane * Math.max(40, canvasW - WALL_INSET * 2 - 140);
      const y = groundY - 200 - (i % 3) * 95;
      const rx = 52, ry = 24;
      const body = Bodies.rectangle(x, y, rx * 2, ry * 2, {
        label: 'cloud',
        frictionAir: 0.08,
        friction: 0.02,
        restitution: 0.55,
        density: 0.0005,
      });
      World.add(world, body);
      clouds.push({
        body,
        vx: (i % 2 ? 1 : -1) * (0.35 + 0.2 * (i % 3)),
        phase: i * 2.1,
        rx, ry,
      });
    }

    if (profile.lightning) {
      const n = Math.max(2, Math.round(canvasW / 280));
      for (let i = 0; i < n; i++) {
        bolts.push({
          x: WALL_INSET + 80 + ((i + 0.5) / n) * Math.max(40, canvasW - WALL_INSET * 2 - 160),
          active: false,
          timer: 1.2 + i * 0.7,
          life: 0,
        });
      }
    }
  }

  function updateSaucers(dt) {
    if (!saucers.length) return;
    const gy = engine.gravity.y * engine.gravity.scale;
    for (const s of saucers) {
      const b = s.body;
      Body.applyForce(b, b.position, { x: 0, y: -b.mass * gy });
      const bob = Math.sin(arenaTime * 1.6 + s.phase) * 0.28;
      const lo = (sideWallsEnabled ? WALL_INSET : 8) + s.rx + 8;
      const hi = canvasW - (sideWallsEnabled ? WALL_INSET : 8) - s.rx - 8;
      if (b.position.x < lo) s.vx = Math.abs(s.vx);
      if (b.position.x > hi) s.vx = -Math.abs(s.vx);
      Body.setVelocity(b, {
        x: b.velocity.x + (s.vx - b.velocity.x) * 0.04,
        y: b.velocity.y * 0.96 + bob * 0.3,
      });
      Body.setAngularVelocity(b, b.angularVelocity * 0.9);
    }
  }

  function updateClouds(dt) {
    if (!clouds.length) return;
    const gy = engine.gravity.y * engine.gravity.scale;
    for (const c of clouds) {
      const b = c.body;
      Body.applyForce(b, b.position, { x: 0, y: -b.mass * gy });
      const bob = Math.sin(arenaTime * 1.1 + c.phase) * 0.22;
      const lo = 40 + c.rx, hi = canvasW - 40 - c.rx;
      if (b.position.x < lo) c.vx = Math.abs(c.vx);
      if (b.position.x > hi) c.vx = -Math.abs(c.vx);
      Body.setVelocity(b, {
        x: b.velocity.x + (c.vx - b.velocity.x) * 0.03,
        y: b.velocity.y * 0.97 + bob * 0.25,
      });
      Body.setAngularVelocity(b, b.angularVelocity * 0.92);
    }
  }

  function updateWind(dt) {
    if (!profile.wind || !bottle || !launched) { windForce = 0; return; }
    windTimer -= dt;
    if (windTimer <= 0) {
      windDir = rand() < 0.5 ? -1 : 1;
      windForce = (0.45 + rand() * 0.55) * (profile.windStrength || 0.01) * windDir;
      windTimer = 0.7 + rand() * 1.4;
    }
    Body.applyForce(bottle, bottle.position, { x: windForce * bottle.mass, y: 0 });
  }

  function updateLightning(dt) {
    if (!profile.lightning || !bolts.length) return;
    for (const b of bolts) {
      if (b.active) {
        b.life -= dt;
        if (b.life <= 0) { b.active = false; b.timer = 1.4 + rand() * 2.2; }
      } else {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.active = true;
          b.life = 0.28 + rand() * 0.18;
          // Drift bolt X a bit so it's not a fixed laser puzzle.
          b.x += (rand() - 0.5) * 80;
          b.x = Math.max(40, Math.min(canvasW - 40, b.x));
        }
      }
    }
    if (!launched || !wasAirborne || !bottle) return;
    for (const b of bolts) {
      if (!b.active) continue;
      if (bottle.bounds.min.x < b.x + 14 && bottle.bounds.max.x > b.x - 14 &&
          bottle.bounds.max.y < groundY - 10) {
        // Struck mid-flight — instant miss (divine judgment).
        recordLanding('MISS', null, 'lightning');
        Body.setVelocity(bottle, { x: bottle.velocity.x * 0.2, y: Math.max(bottle.velocity.y, 4) });
        break;
      }
    }
  }

  function updateMovingTarget(dt) {
    if (!profile.movingTarget || targetX == null) return;
    targetPhase += dt * 0.85;
    const margin = (sideWallsEnabled ? WALL_INSET : 8) + targetHW + 20;
    const mid = canvasW / 2;
    const amp = Math.max(30, (canvasW - margin * 2) * 0.38);
    targetX = mid + Math.sin(targetPhase) * amp;
  }

  function getObstacles() {
    return {
      deflectors: deflectors.map((d) => ({ vertices: d.vertices.map((v) => ({ x: v.x, y: v.y })) })),
      // Back-compat single deflector for older renderers
      deflector: deflectors[0]
        ? { vertices: deflectors[0].vertices.map((v) => ({ x: v.x, y: v.y })) }
        : null,
      saucers: saucers.map((s) => ({
        x: s.body.position.x, y: s.body.position.y,
        angle: s.body.angle, rx: s.rx, ry: s.ry,
      })),
      clouds: clouds.map((c) => ({
        x: c.body.position.x, y: c.body.position.y,
        angle: c.body.angle, rx: c.rx, ry: c.ry,
      })),
      bolts: bolts.map((b) => ({ x: b.x, active: b.active, life: b.life })),
      wind: profile.wind ? { force: windForce, dir: windDir } : null,
    };
  }

  // Randomize the pad's spot each turn so it isn't the same shot every time.
  // Uses the seeded RNG so a multiplayer replay places it identically.
  function placeTarget(explicitX) {
    if (!profile.landOnTarget || !canvasW) { targetX = null; return; }
    targetHW = currentTargetHalfWidth();
    const margin = (sideWallsEnabled ? WALL_INSET : 8) + targetHW + 16;
    if (explicitX != null && Number.isFinite(explicitX)) {
      targetX = Math.max(margin, Math.min(canvasW - margin, explicitX));
      return;
    }
    const span = Math.max(0, canvasW - margin * 2);
    targetX = margin + rand() * span;
    targetPhase = rand() * Math.PI * 2;
  }

  function getTarget() {
    return targetX == null ? null : {
      x: targetX,
      halfWidth: targetHW,
      style: profile.movingTarget ? 'altar' : 'pad',
    };
  }

  function overTarget() {
    if (!profile.landOnTarget || targetX == null || !bottle) return false;
    // Strict (alien): the body's CENTER must sit on the pad — grazing the edge
    // with a limb no longer counts. Generous (gods altar / legacy): any overlap.
    if (profile.strictTarget) {
      return Math.abs(bottle.position.x - targetX) <= targetHW;
    }
    return bottle.bounds.max.x >= targetX - targetHW &&
           bottle.bounds.min.x <= targetX + targetHW;
  }

  // ── Liquid oscillator ──────────────────────────────────────────────────────
  const liquid = {
    slosh: 0,
    vel: 0,
    settleTimer: 0,

    update(bottleAngVel, dt) {
      const spring  = -0.10 * this.slosh;
      const drive   =  0.40 * bottleAngVel;
      const damping = -0.08 * this.vel;
      this.vel   += (spring + drive + damping) * dt;
      this.slosh += this.vel * dt;
      this.slosh  = Math.max(-1, Math.min(1, this.slosh));

      this.settleTimer = Math.abs(this.vel) < 0.10
        ? this.settleTimer + dt
        : 0;
    },

    renderOffset() { return this.slosh * 13; },
    isSettled()    { return this.settleTimer > 0.25; },
    reset()        { this.slosh = 0; this.vel = 0; this.settleTimer = 0; },
  };

  function recordLanding(result, tilt, reason) {
    let padOffset = null;
    if (profile.landOnTarget && targetX != null && bottle) {
      padOffset = targetHW > 0 ? Math.abs(bottle.position.x - targetX) / targetHW : null;
    }
    lastLandingInfo = {
      result,
      tilt,
      perfect: result === 'MAKE' && tilt != null && tilt <= PERFECT_ANGLE,
      reason,
      maxTilt: profile.floorResolve ? 0 : maxGroundedTilt,
      padOffset,
    };
    return result;
  }

  function checkLanding() {
    if (!bottle) return null;
    if (lastLandingInfo && lastLandingInfo.reason === 'lightning') {
      return lastLandingInfo.result;
    }

    // Bounce mode: floor ends the flight. With allowSlideIn, an off-pad
    // touchdown can still coast onto the pad for a MAKE; with it off (alien),
    // first contact is the final verdict — land dead on the pad or miss.
    if (profile.floorResolve && launched && wasAirborne) {
      const grounded = bottle.bounds.max.y >= groundY - 6;

      if (!floorTouched) {
        if (bottle.bounds.max.y < groundY - 2) return null;
        floorTouched = true;
        slideFrames = 0;
        for (const part of [bottle, ...bottle.parts]) {
          part.restitution = 0.02;
          part.friction = 0.35;
        }
        if (overTarget()) return recordLanding('MAKE', 0, 'on-target');
        if (!profile.landOnTarget || targetX == null) return recordLanding('MISS', null, 'off-target');
        if (!profile.allowSlideIn) return recordLanding('MISS', null, 'off-target');
        return null;
      }

      slideFrames++;
      if (profile.allowSlideIn && grounded && overTarget()) return recordLanding('MAKE', 0, 'slid-on');
      const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
      if ((grounded && speed < 0.35 && slideFrames > 20) || slideFrames > 360) {
        return recordLanding('MISS', null, 'off-target');
      }
      return null;
    }

    const angVel   = Math.abs(bottle.angularVelocity);
    const linSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
    const grounded = bottle.position.y >= groundY - 80;

    if (!grounded) {
      groundedFrames = 0;
      angleWin = [];
      return null;
    }

    groundedFrames++;

    {
      let a = ((bottle.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (a > Math.PI) a -= 2 * Math.PI;
      const t = Math.abs(a);
      if (t > maxGroundedTilt) maxGroundedTilt = t;
    }

    if (groundedFrames > profile.missCapFrames) return recordLanding('MISS', null, 'timeout');

    if (angVel < 0.010 && linSpeed < 7) {
      angleWin.push(bottle.angle);
      if (angleWin.length > SETTLE_FRAMES) angleWin.shift();
      let lo = Infinity, hi = -Infinity;
      for (const a of angleWin) { if (a < lo) lo = a; if (a > hi) hi = a; }
      if (angleWin.length >= SETTLE_FRAMES && (hi - lo) < SETTLE_RANGE) {
        if (profile.requireFlip && !hasFlipped) return recordLanding('MISS', null, 'underrotated');
        let angle = ((bottle.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (angle > Math.PI) angle -= 2 * Math.PI;
        const tilt = Math.abs(angle);
        if (tilt < MAKE_ANGLE) {
          // Olympus / altar modes: upright only counts on the target.
          if (profile.landOnTarget && !overTarget()) {
            return recordLanding('MISS', tilt, 'off-altar');
          }
          return recordLanding('MAKE', tilt, profile.landOnTarget ? 'on-altar' : 'upright');
        }
        if (tilt >= FALLEN_ANGLE) return recordLanding('MISS', tilt, 'fallen');
      }
    } else {
      angleWin = [];
    }

    return null;
  }

  function createBottle() {
    const cx = canvasW / 2;
    const cy = groundY - 76;

    const liq  = Bodies.rectangle(cx, cy + 38, 74, 70, { density: 0.018 });
    const body = Bodies.rectangle(cx, cy - 18, 70, 50, { density: 0.0015 });
    const neck = Bodies.rectangle(cx, cy - 62, 44, 36, { density: 0.0004 });

    const b = Body.create({
      parts: [liq, body, neck],
      frictionAir: profile.frictionAir,
      friction:    profile.friction,
      restitution: profile.restitution,
      label: 'bottle',
    });

    return b;
  }

  function init(w, h, bottomInset = 0) {
    canvasW = w;
    arenaH  = h;
    groundY = h - 30 - bottomInset;
    acc = 0;

    engine = Engine.create({ gravity: { y: profile.gravity, scale: 0.001 } });
    world  = engine.world;

    // Extra-wide ground so open-arena mobile shots still have a floor off-screen.
    ground = Bodies.rectangle(w / 2, groundY + 25, Math.max(w * 6, 4000), 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.9,
      restitution: 0.01,
    });

    const wallOpts = { isStatic: true, label: 'wall', friction: 0, restitution: 0 };
    leftWall  = Bodies.rectangle(WALL_INSET - 20, h / 2, 40, h * 4, wallOpts);
    rightWall = Bodies.rectangle(w - WALL_INSET + 20, h / 2, 40, h * 4, wallOpts);

    ceilingBody = Bodies.rectangle(w / 2, -20, Math.max(w * 6, 4000), 40, {
      isStatic: true, label: 'ceiling', friction: 0, restitution: 0.85,
      collisionFilter: { mask: profile.ceiling ? 0xFFFFFFFF : 0 },
    });

    World.add(world, [ground, leftWall, rightWall, ceilingBody]);
    syncSideWalls();
    resetBottle();
  }

  function reflow(w, h, bottomInset = 0) {
    if (!engine) return;
    canvasW = w;
    arenaH  = h;
    groundY = h - 30 - bottomInset;
    Body.setPosition(ground,    { x: w / 2,                 y: groundY + 25 });
    Body.setPosition(leftWall,  { x: WALL_INSET - 20,       y: h / 2 });
    Body.setPosition(rightWall, { x: w - WALL_INSET + 20,   y: h / 2 });
    Body.setPosition(ceilingBody, { x: w / 2, y: -20 });
    syncSideWalls();
    buildObstacles(h);
    if (profile.landOnTarget) {
      targetHW = currentTargetHalfWidth();
      const margin = (sideWallsEnabled ? WALL_INSET : 8) + targetHW + 16;
      if (targetX != null) targetX = Math.max(margin, Math.min(w - margin, targetX));
    }
  }

  function resetBottle() {
    if (bottle) World.remove(world, bottle);
    groundedFrames = 0;
    angleWin       = [];
    totalRotation  = 0;
    hasFlipped     = false;
    launchAngle    = 0;
    hasLanded      = false;
    lastLandingInfo = null;
    lastFlickInfo  = null;
    launched       = false;
    wasAirborne    = false;
    floorTouched   = false;
    slideFrames    = 0;
    maxGroundedTilt = 0;
    windForce = 0;
    windTimer = 0.4;
    liquid.reset();
    acc = 0;

    bottle = createBottle();
    World.add(world, bottle);
    applyBodyMaterial();
    placeTarget();
  }

  // Pass an explicit `seed` to replay a flick's exact randomness (multiplayer);
  // otherwise a fresh seed is drawn and recorded in lastFlickInfo.
  function applyFlick(vx, vy, seed) {
    const s = (seed !== undefined && seed !== null
      ? seed
      : Math.floor(Math.random() * 0xffffffff)) >>> 0;
    seedRng(s);

    const upSpeed = Math.max(0, -vy);
    const power   = Math.min(upSpeed / POWER_SPEED, 1.0);

    const jSpin   = 1 + (rand() - 0.5) * 0.24;
    const jLaunch = 1 + (rand() - 0.5) * 0.12;
    const jDrift  = (rand() - 0.5) * 2.4;

    const launchY = -(16 + power * 5) * jLaunch * profile.launchScale;
    let launchX = Math.max(-profile.horizMax,
      Math.min(profile.horizMax, vx / profile.horizDivisor)) + jDrift;

    if (profile.minHorizRatio > 0) {
      const minX = Math.abs(launchY) * profile.minHorizRatio;
      if (Math.abs(launchX) < minX) launchX = (launchX >= 0 ? 1 : -1) * minX;
    }

    const dir  = vx >= 0 ? 1 : -1;
    const spin = dir * (SPIN_BASE + power * SPIN_RANGE) * jSpin * profile.spinScale;

    lastFlickInfo = {
      upSpeed: Math.round(upSpeed),
      power: +power.toFixed(2),
      spin: +spin.toFixed(3),
      seed: s,
      vx: Math.round(vx),
      vy: Math.round(vy),
    };
    launchAngle = bottle.angle;
    launched = true;
    wasAirborne = false;
    lastLandingInfo = null;
    Body.setVelocity(bottle, { x: launchX, y: launchY });
    Body.setAngularVelocity(bottle, spin);
  }

  function stepOnce() {
    Engine.update(engine, FIXED_DT * 1000);
    arenaTime += FIXED_DT;

    if (launched && !wasAirborne && bottle.bounds.max.y < groundY - 24) wasAirborne = true;
    if (!hasFlipped) {
      totalRotation = Math.abs(bottle.angle - launchAngle);
      if (totalRotation >= 5.6) hasFlipped = true;
    }

    if (hasFlipped && !hasLanded && bottle.velocity.y > 0 && bottle.position.y >= groundY - 55) {
      hasLanded = true;
      const kick = liquid.vel * 0.06 + (rand() - 0.5) * 0.16;
      Body.setAngularVelocity(bottle, bottle.angularVelocity + kick);
    }

    liquid.update(bottle.angularVelocity, FIXED_DT);
    updateSaucers(FIXED_DT);
    updateClouds(FIXED_DT);
    updateWind(FIXED_DT);
    updateLightning(FIXED_DT);
    updateMovingTarget(FIXED_DT);
  }

  function step(dt) {
    acc += dt;
    if (acc > 0.25) acc = 0.25;
    while (acc >= FIXED_DT) {
      stepOnce();
      acc -= FIXED_DT;
    }
  }

  // Camera helper: when the bottle leaves the frame (mobile open arena), the
  // renderer zooms out so the shot stays visible. Returns world bounds that
  // should remain on-screen.
  function getViewHint() {
    if (!bottle) {
      return { openArena, sideWalls: sideWallsEnabled, zoom: 1, camX: canvasW / 2, camY: groundY / 2 };
    }
    const pad = 70;
    const minX = Math.min(0, bottle.bounds.min.x - pad);
    const maxX = Math.max(canvasW, bottle.bounds.max.x + pad);
    const minY = Math.min(0, bottle.bounds.min.y - pad);
    const maxY = Math.max(groundY + 30, bottle.bounds.max.y + 20);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const zoom = Math.min(1, canvasW / spanX, (groundY + 30) / Math.max(spanY, 1));
    // Only zoom out (never in past 1). Soften so tiny excursions don't punch in/out.
    const z = Math.max(0.42, Math.min(1, zoom));
    return {
      openArena,
      sideWalls: sideWallsEnabled,
      zoom: z,
      camX: (minX + maxX) / 2,
      camY: (minY + maxY) / 2,
      worldW: canvasW,
      worldH: groundY + 30,
    };
  }

  function getBottle()  { return bottle; }
  function getLiquid()  { return liquid; }
  function getGroundY() { return groundY; }
  function getLastLandingInfo() { return lastLandingInfo; }
  function getLastFlickInfo() { return lastFlickInfo; }
  function isOpenArena() { return openArena; }

  // Force a verdict from the network authority (hybrid lockstep).
  function forceLanding(result, info) {
    lastLandingInfo = {
      result,
      tilt: info && info.tilt != null ? info.tilt : null,
      perfect: !!(info && info.perfect),
      reason: (info && info.reason) || 'net-authority',
      maxTilt: (info && info.maxTilt) || 0,
    };
    return result;
  }

  return {
    init, reflow, step, resetBottle, applyFlick, checkLanding, forceLanding,
    getBottle, getLiquid, getGroundY, getLastLandingInfo, getLastFlickInfo,
    setProfile, getTarget, getObstacles, getViewHint, isOpenArena, placeTarget,
  };
})();
