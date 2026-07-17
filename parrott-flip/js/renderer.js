// renderer.js — canvas draw loop

// roundRect polyfill — older Android System WebViews (the bundled offline APK
// target) lack CanvasRenderingContext2D.roundRect; without this the draw loop
// throws and the canvas renders blank. Manual arc/line fallback.
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    let radii = typeof r === 'number' ? [r, r, r, r]
              : (Array.isArray(r) ? r : [0, 0, 0, 0]);
    if (radii.length === 1) radii = [radii[0], radii[0], radii[0], radii[0]];
    if (radii.length === 2) radii = [radii[0], radii[1], radii[0], radii[1]];
    let [tl, tr, br, bl] = radii;
    const max = Math.min(Math.abs(w), Math.abs(h)) / 2;     // clamp oversized radii
    tl = Math.min(tl, max); tr = Math.min(tr, max);
    br = Math.min(br, max); bl = Math.min(bl, max);
    this.moveTo(x + tl, y);
    this.arcTo(x + w, y,     x + w, y + h, tr);
    this.arcTo(x + w, y + h, x,     y + h, br);
    this.arcTo(x,     y + h, x,     y,     bl);
    this.arcTo(x,     y,     x + w, y,     tl);
    this.closePath();
    return this;
  };
}

const Renderer = (() => {
  let canvas, ctx, W, H;
  const particles = [];

  // Screen shake (decaying): amp in px, decays to 0 over shakeDecay px/s.
  let shakeAmp = 0, shakeDecay = 0;
  let reduceMotion = false;             // set via setReduceMotion()

  function setReduceMotion(v) { reduceMotion = !!v; }

  // Celebration burst (MAKE) / shake (MISS). Called once per result by main.js.
  function kick(type, opts = {}) {
    if (type === 'MAKE') {
      const { x, y, color } = opts;
      spawnSplash(x, y - 30, reduceMotion ? 8 : 26, color || '#69f0ae');
    } else if (type === 'MISS') {
      if (reduceMotion) return;
      shakeAmp = 12; shakeDecay = 12 / 0.22;   // ~220ms to zero
    }
  }

  function init(cvs) {
    canvas = cvs;
    ctx    = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
  }

  function resize(w, h) { W = w; H = h; }

  // ── Color helpers (per-player liquid flavor) ────────────────────────────────
  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function lighten(hex, amt, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + amt);
    const g = Math.min(255, ((n >> 8) & 255) + amt);
    const b = Math.min(255, (n & 255) + amt);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // ── Particle helpers ───────────────────────────────────────────────────────
  function spawnSplash(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 180,
        vy: -Math.random() * 160 - 30,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        r: 2.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  function spawnFire(x, y) {
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 28,
        y,
        vx: (Math.random() - 0.5) * 50,
        vy: -70 - Math.random() * 100,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        r: 5 + Math.random() * 5,
        color: Math.random() > 0.45 ? '#ff6600' : '#ffcc00',
        fire: true,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x   += p.vx * dt;
      p.y   += p.vy * dt;
      p.vy  += 300 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + 0.6 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Background & scene ─────────────────────────────────────────────────────
  function drawBackground(groundY, isOnFire) {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isOnFire) {
      sky.addColorStop(0, '#1a0a04');
      sky.addColorStop(0.55, '#3a1408');
      sky.addColorStop(1, '#5a220c');
    } else {
      sky.addColorStop(0, '#071018');
      sky.addColorStop(0.45, '#0f2438');
      sky.addColorStop(1, '#16324a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Horizon haze / distant sea
    const haze = ctx.createLinearGradient(0, groundY - 90, 0, groundY);
    haze.addColorStop(0, 'rgba(40, 90, 120, 0)');
    haze.addColorStop(1, isOnFire ? 'rgba(120, 50, 20, 0.35)' : 'rgba(50, 110, 140, 0.28)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, groundY - 90, W, 90);

    // Sparse stars (skip when on fire)
    if (!isOnFire) {
      ctx.fillStyle = 'rgba(244, 239, 227, 0.55)';
      for (let i = 0; i < 28; i++) {
        const sx = ((i * 97) % W);
        const sy = 18 + ((i * 53) % Math.max(40, groundY - 120));
        const r = (i % 3 === 0) ? 1.4 : 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ship deck planks
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    for (let y = groundY + 18; y < H; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // Nail dots / plank seams
    ctx.fillStyle = 'rgba(197,154,74,0.18)';
    for (let x = 24; x < W; x += 64) {
      for (let y = groundY + 10; y < H; y += 22) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Deck edge rail
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(0, groundY - 4, W, 5);
    ctx.fillStyle = 'rgba(197,154,74,0.35)';
    ctx.fillRect(0, groundY - 4, W, 1);
  }

  // ── Parrott ────────────────────────────────────────────────────────────────
  // Drawn in the SAME local footprint as the bottle physics body (CG at 0,0;
  // body ~y=-72..+43, head/hat up near y=-140). Looks like a pirate parrot;
  // still lands/tips with bottle physics.
  function drawBottle(bottle, liquid, isOnFire, liquidColor) {
    const { x, y } = bottle.position;
    const angle  = bottle.angle;
    const bodyCol = liquidColor || '#d62828';
    const bellyCol = lighten(bodyCol, 90, 1);
    const wingCol = lighten(bodyCol, -30, 1);
    const flap = Math.max(-0.45, Math.min(0.45, (liquid.slosh || 0) * 0.55));

    if (isOnFire) {
      const glow = ctx.createRadialGradient(x, y, 10, x, y, 95);
      glow.addColorStop(0, 'rgba(255,100,0,0.30)');
      glow.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 95, 0, Math.PI * 2);
      ctx.fill();
      spawnFire(x, y - 100);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Tail feathers (behind body)
    ctx.fillStyle = wingCol;
    ctx.beginPath();
    ctx.moveTo(-8, 20);
    ctx.quadraticCurveTo(-38, 55, -22, 78);
    ctx.quadraticCurveTo(-6, 52, 0, 40);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 20);
    ctx.quadraticCurveTo(38, 55, 22, 78);
    ctx.quadraticCurveTo(6, 52, 0, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.quadraticCurveTo(0, 70, 0, 82);
    ctx.quadraticCurveTo(14, 58, 10, 28);
    ctx.closePath();
    ctx.fill();

    // Feet (at visual base ≈ bottle bottom)
    ctx.strokeStyle = '#e9c46a';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, 40); ctx.lineTo(-22, 52); ctx.moveTo(-14, 40); ctx.lineTo(-8, 54); ctx.moveTo(-14, 40); ctx.lineTo(-16, 54);
    ctx.moveTo( 14, 40); ctx.lineTo( 22, 52); ctx.moveTo( 14, 40); ctx.lineTo( 8, 54); ctx.moveTo( 14, 40); ctx.lineTo( 16, 54);
    ctx.stroke();

    // Body
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.ellipse(0, -8, 34, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly
    ctx.fillStyle = bellyCol;
    ctx.beginPath();
    ctx.ellipse(0, 2, 20, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing (flaps a bit from the old liquid-slosh signal)
    ctx.save();
    ctx.translate(6, -6);
    ctx.rotate(flap);
    ctx.fillStyle = wingCol;
    ctx.beginPath();
    ctx.ellipse(18, 8, 16, 28, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(10, -8); ctx.quadraticCurveTo(28, 8, 14, 30);
    ctx.stroke();
    ctx.restore();

    // Head
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.arc(0, -78, 26, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#f4a261';
    ctx.beginPath();
    ctx.moveTo(10, -78);
    ctx.quadraticCurveTo(38, -72, 18, -62);
    ctx.quadraticCurveTo(12, -70, 10, -78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e76f51';
    ctx.beginPath();
    ctx.moveTo(10, -74);
    ctx.quadraticCurveTo(30, -68, 16, -64);
    ctx.closePath();
    ctx.fill();

    // Visible eye (right side) — left eye always covered by the patch
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(8, -82, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#142f4b';
    ctx.beginPath();
    ctx.arc(9.5, -82, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(11, -84, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // ── Eye patch (EVERY parrot) ──────────────────────────────────────────
    // Black patch over the left eye + thin strap around the head.
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-24, -90);
    ctx.quadraticCurveTo(0, -100, 24, -88);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, -70);
    ctx.quadraticCurveTo(0, -62, 20, -72);
    ctx.stroke();
    // Patch oval
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(-9, -82, 9.5, 8, -0.25, 0, Math.PI * 2);
    ctx.fill();
    // Tiny highlight so it reads as cloth, not a hole
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(-12, -85, 3, 2, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Tiny pirate bandana tuft on top
    ctx.fillStyle = '#9b4529';
    ctx.beginPath();
    ctx.arc(0, -100, 12, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, -100);
    ctx.quadraticCurveTo(28, -118, 8, -112);
    ctx.quadraticCurveTo(14, -104, 10, -100);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Feather puff when "sloshing" hard
    if (Math.abs(liquid.vel) > 1.6) {
      spawnSplash(x, y - 30, 2, hexToRgba(bodyCol, 0.85));
    }
  }

  // ── Landing ring ───────────────────────────────────────────────────────────
  function drawLandingGlow(bottle, groundY) {
    const cx = bottle.position.x;
    const glow = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, 55);
    glow.addColorStop(0, 'rgba(90, 255, 110, 0.50)');
    glow.addColorStop(1, 'rgba(90, 255, 110, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, groundY, 55, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Flick indicator ─────────────────────────────────────────────────────────
  // Points FROM the bottle in the direction you're flicking (the way it'll go),
  // length grows with flick strength. Reads as "throw this way", not "pull back".
  function drawFlickIndicator(drag, bottle) {
    if (!drag || !bottle) return;
    const dx  = drag.curX - drag.startX;   // flick direction = throw direction
    const dy  = drag.curY - drag.startY;
    const len = Math.hypot(dx, dy);
    if (len < 18) return;

    const strength = Math.min(len / 220, 1);
    const ux = dx / len, uy = dy / len;
    const reach = 28 + strength * 64;                 // 28..92px
    const ox = bottle.position.x, oy = bottle.position.y - 40;
    const ex = ox + ux * reach, ey = oy + uy * reach;
    const color = `hsl(${190 - strength * 150}, 95%, 62%)`; // cyan → hot orange

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const a = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 14 * Math.cos(a - 0.45), ey - 14 * Math.sin(a - 0.45));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 14 * Math.cos(a + 0.45), ey - 14 * Math.sin(a + 0.45));
    ctx.stroke();
    ctx.restore();
  }

  // ── Side walls ───────────────────────────────────────────────────────────────
  function drawWalls(groundY) {
    const WALL = 14; // matches physics WALL_INSET
    for (const x0 of [0, W - WALL]) {
      const g = ctx.createLinearGradient(x0, 0, x0 + WALL, 0);
      const flip = x0 === 0;
      g.addColorStop(0, flip ? 'rgba(42,28,18,0.95)' : 'rgba(90,60,36,0.75)');
      g.addColorStop(1, flip ? 'rgba(90,60,36,0.75)' : 'rgba(42,28,18,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, WALL, groundY);
    }
    // inner edge highlights
    ctx.fillStyle = 'rgba(197,154,74,0.28)';
    ctx.fillRect(WALL - 2, 0, 2, groundY);
    ctx.fillRect(W - WALL, 0, 2, groundY);
  }

  // ── Result text ────────────────────────────────────────────────────────────
  function drawResult(text, color, alpha) {
    // Pop: scale overshoots to ~1.18 as it appears, settles back to 1.0.
    const pop = reduceMotion ? 1 : 1 + 0.18 * Math.sin(Math.min(alpha, 1) * Math.PI);
    ctx.save();
    ctx.globalAlpha   = alpha;
    ctx.fillStyle     = color;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.shadowColor   = color;
    ctx.shadowBlur    = 36;
    ctx.translate(W / 2, H / 2 - 60);
    ctx.scale(pop, pop);
    ctx.font          = 'bold 76px Georgia, "Times New Roman", serif';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ── Main frame ─────────────────────────────────────────────────────────────
  function frame(dt, state) {
    const { bottle, liquid, drag, groundY, result, resultAlpha, showGlow, isOnFire, liquidColor } = state;
    updateParticles(dt);

    let sx = 0, sy = 0;
    if (shakeAmp > 0.2) {
      sx = (Math.random() - 0.5) * 2 * shakeAmp;
      sy = (Math.random() - 0.5) * 2 * shakeAmp;
      shakeAmp = Math.max(0, shakeAmp - shakeDecay * dt);
    }
    ctx.save();
    ctx.translate(sx, sy);

    drawBackground(groundY, isOnFire);
    drawWalls(groundY);
    drawFlickIndicator(drag, bottle);
    if (showGlow) drawLandingGlow(bottle, groundY);
    drawBottle(bottle, liquid, isOnFire, liquidColor);
    drawParticles();

    if (result) {
      const color = result === 'MAKE' ? '#7dcea0' : '#c23b22';
      drawResult(result === 'MAKE' ? 'MAKE!' : 'MISS', color, resultAlpha);
    }
    ctx.restore();
  }

  return { init, resize, frame, kick, setReduceMotion };
})();
