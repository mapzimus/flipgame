// physics.js — Matter.js world, bottle body, liquid sim

const Physics = (() => {
  const { Engine, Bodies, Body, World, Events } = Matter;

  let engine, world, bottle, ground;
  let stableFrames = 0, groundedFrames = 0;
  let canvasW, canvasH;
  let groundY;

  // ── Liquid oscillator ──────────────────────────────────────────────────────
  // Virtual pendulum — tracks the slosh of liquid inside the bottle.
  // It is NOT a physics body; it's a visual/stability modifier only.
  const liquid = {
    slosh: 0,      // -1..1 offset of liquid mass center (bottle frame)
    vel: 0,        // rate of change
    settleTimer: 0,

    update(bottleAngVel, dt) {
      // Liquid behaves like a damped pendulum driven by bottle rotation
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

    renderOffset() { return this.slosh * 13; }, // px horizontal shift for drawing
    isSettled()    { return this.settleTimer > 0.25; },
    reset()        { this.slosh = 0; this.vel = 0; this.settleTimer = 0; },
  };

  // ── Landing detection — wait for full settle ──────────────────────────────
  // Don't judge the angle mid-roll. Instead, wait until the bottle has truly
  // come to rest (both spin and drift near zero for 12 consecutive frames),
  // then check the final angle. This lets the "bowling pin wobble" play out
  // naturally: the bottle can teeter and rock before the verdict fires.
  function checkLanding() {
    if (!bottle) return null;

    const angVel   = Math.abs(bottle.angularVelocity);
    const linSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
    const grounded = bottle.position.y >= groundY - 80;

    if (!grounded) {
      stableFrames  = 0;
      groundedFrames = 0;
      return null;
    }

    groundedFrames++;

    if (angVel < 0.04 && linSpeed < 15) {
      stableFrames++;
      if (stableFrames >= 12) {
        // Bottle is fully at rest — now check the final angle
        let angle = ((bottle.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (angle > Math.PI) angle -= 2 * Math.PI;
        return Math.abs(angle) < 0.52 ? 'MAKE' : 'MISS';  // ±30° window
      }
    } else {
      stableFrames = 0;
      // Hard timeout: 6 seconds on ground and still thrashing → MISS
      if (groundedFrames > 360) return 'MISS';
    }

    return null; // still evaluating
  }

  // ── Bottle creation ────────────────────────────────────────────────────────
  // Three-part compound body that mimics a ~¼-full Gatorade bottle:
  //   • Heavy bottom (liquid region) → low CG → "bowling pin" stability
  //   • Medium upper body
  //   • Light neck
  //
  // With this mass distribution the CG sits ~30px above the base edge, giving
  // a tipping angle ≈ 40°. A landing within ~35° of vertical can right itself;
  // steeper than that and gravity wins — producing the "almost stuck" teeter.
  function createBottle() {
    const cx  = canvasW / 2;
    const cy  = groundY - 100;   // bottle center Y (centroid of compound)

    // Bottle geometry (in upright position):
    //   base bottom edge: cy + 65
    //   base top:         cy - 65  (body rect = 130px tall, 50px wide)
    //   neck top:         cy - 105 (neck rect = 40px tall, 18px wide)
    //
    //   liquid region:    cy+15 → cy+65  (bottom 50px, heavy)
    //   upper body:       cy-65 → cy+15  (top 80px, light)

    const liq  = Bodies.rectangle(cx, cy + 40, 60, 55, { density: 0.016 }); // thick Gatorade base — heavy, low CG
    const body = Bodies.rectangle(cx, cy - 25, 58, 75, { density: 0.0015 });
    const neck = Bodies.rectangle(cx, cy - 90, 22, 38, { density: 0.0004 });

    const b = Body.create({
      parts: [liq, body, neck],
      frictionAir: 0.025,  // moderate decay — spin nearly stops before landing
      friction:    0.85,   // high — grips the table on landing
      restitution: 0.02,   // near-zero — no bounce, just a thud
      label: 'bottle',
    });

    // Keep bottle colliding only with ground, not itself
    b.collisionFilter      = { category: 0x0001, mask: 0x0002 };
    ground.collisionFilter = { category: 0x0002, mask: 0x0001 };

    return b;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function init(w, h) {
    canvasW = w;
    canvasH = h;
    groundY = h - 30;          // top surface of the table

    engine = Engine.create({ gravity: { y: 1.5, scale: 0.001 } });
    world  = engine.world;

    ground = Bodies.rectangle(w / 2, groundY + 25, w * 6, 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.9,
      restitution: 0.01,
    });
    World.add(world, ground);

    resetBottle();
  }

  function resetBottle() {
    if (bottle) World.remove(world, bottle);
    stableFrames   = 0;
    groundedFrames = 0;
    liquid.reset();

    bottle = createBottle();
    World.add(world, bottle);
  }

  // Convert a screen-space flick vector (px/s) into a launch.
  // Design target:
  //   • vy  ≈ -1500 px/s → bottle rises ~250px (nice visible arc)
  //   • ratio vx/|vy| ≈ 0.15 → ~1 clean rotation
  // The player's skill is in finding that ~0.10-0.20 ratio sweet spot.
  function applyFlick(vx, vy) {
    const vy_abs = Math.max(50, Math.abs(vy));

    // Vertical launch: map screen speed to physics speed, clamped
    const power   = Math.min((vy_abs - 50) / 2200, 1.0); // 0..1
    const launchY = -(5 + power * 20);                    // -5 (gentle) to -25 (strong)

    // Horizontal drift (smaller than vertical, just affects landing zone)
    const launchX = (vx / vy_abs) * Math.abs(launchY) * 0.35;

    // Spin: ratio of horizontal to vertical determines rotation count
    // ratio ≈ 0.25 → ~1 rotation (sweet spot at frictionAir=0.025)
    // frictionAir = 0.025 → each frame angVel *= 0.975
    // Sum over 72 frames ≈ 33.6; so for 2π total: angVel_0 = 2π/33.6 ≈ 0.187
    // At ratio=0.25: 0.187 = 0.25 * k → k ≈ 0.75
    const ratio = Math.max(-1.5, Math.min(1.5, vx / vy_abs));
    const spin  = ratio * 0.75;

    Body.setVelocity(bottle, { x: launchX, y: launchY });
    Body.setAngularVelocity(bottle, spin);
  }

  function step(dt) {
    Engine.update(engine, dt * 1000);
    liquid.update(bottle.angularVelocity, dt);
  }

  function getBottle()  { return bottle; }
  function getLiquid()  { return liquid; }
  function getGroundY() { return groundY; }

  return { init, step, resetBottle, applyFlick, checkLanding, getBottle, getLiquid, getGroundY };
})();
