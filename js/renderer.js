// renderer.js — canvas draw loop

const Renderer = (() => {
  let canvas, ctx, W, H;
  const particles = [];

  function init(cvs) {
    canvas = cvs;
    ctx    = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
  }

  function resize(w, h) { W = w; H = h; canvas.width = w; canvas.height = h; }

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
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (isOnFire) {
      sky.addColorStop(0, '#140400');
      sky.addColorStop(1, '#2e0800');
    } else {
      sky.addColorStop(0, '#0a1628');
      sky.addColorStop(1, '#112240');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Table surface
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(0, groundY, W, H - groundY);

    // Subtle wood grain lines
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x + 20, H);
      ctx.stroke();
    }

    // Table edge highlight
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(0, groundY - 3, W, 4);
  }

  // ── Bottle ─────────────────────────────────────────────────────────────────
  // Gatorade bottle: clear frosted plastic, wide flat base, blue liquid, orange cap.
  function drawBottle(bottle, liquid, isOnFire) {
    const { x, y } = bottle.position;
    const angle    = bottle.angle;
    const offset   = liquid.renderOffset();

    // ON FIRE ambient glow
    if (isOnFire) {
      const glow = ctx.createRadialGradient(x, y, 10, x, y, 90);
      glow.addColorStop(0, 'rgba(255,100,0,0.30)');
      glow.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 90, 0, Math.PI * 2);
      ctx.fill();
      spawnFire(x, y - 95);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // ── Blue Gatorade liquid (clipped to bottle body) ──────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(-30, -65, 60, 130);
    ctx.clip();

    // Liquid fill — bright electric blue, ~1/3 of body from bottom
    ctx.fillStyle = 'rgba(0, 150, 255, 0.80)';
    ctx.beginPath();
    ctx.rect(offset - 29, 22, 58, 46);
    ctx.fill();

    // Surface meniscus
    ctx.fillStyle = 'rgba(40, 180, 255, 0.90)';
    ctx.beginPath();
    ctx.ellipse(offset, 22, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Surface sheen
    ctx.strokeStyle = 'rgba(160, 230, 255, 0.80)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.ellipse(offset, 22, 26, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── Bottle body (clear frosted plastic) ───────────────────────────────
    // Gatorade: wide cylindrical body, slight inward shoulder, short neck
    const bodyGrad = ctx.createLinearGradient(-30, 0, 30, 0);
    bodyGrad.addColorStop(0,    'rgba(180,215,245,0.75)');
    bodyGrad.addColorStop(0.25, 'rgba(235,248,255,0.92)');
    bodyGrad.addColorStop(0.65, 'rgba(200,232,252,0.80)');
    bodyGrad.addColorStop(1,    'rgba(165,205,238,0.70)');

    ctx.strokeStyle = 'rgba(100,160,215,0.70)';
    ctx.lineWidth   = 1.5;

    // Main body — wide, flat base feel (single radius, not array — broad compat)
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-30, -65, 60, 130, 6);
    ctx.fill();
    ctx.stroke();

    // Shoulder — inward taper from body to neck
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-30, -58);
    ctx.lineTo(-11, -76);
    ctx.lineTo( 11, -76);
    ctx.lineTo( 30, -58);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,160,215,0.45)';
    ctx.stroke();

    // Neck
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = 'rgba(100,160,215,0.70)';
    ctx.beginPath();
    ctx.roundRect(-11, -112, 22, 40, 4);
    ctx.fill();
    ctx.stroke();

    // Label band (white strip — Gatorade style)
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.roundRect(-27, -28, 54, 40, 3);
    ctx.fill();

    // Left-edge specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.roundRect(-24, -62, 6, 118, 3);
    ctx.fill();

    // Subtle right reflection
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.roundRect(16, -50, 4, 90, 2);
    ctx.fill();

    // ── Orange Gatorade cap ────────────────────────────────────────────────
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.roundRect(-12, -124, 24, 16, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cap highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.roundRect(-10, -123, 9, 5, 2);
    ctx.fill();

    ctx.restore();

    // Splash particles when liquid is sloshing hard — blue Gatorade color
    if (Math.abs(liquid.vel) > 1.6) {
      spawnSplash(x, y - 48, 2, 'rgba(0,180,255,0.85)');
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

  // ── Flick arrow ────────────────────────────────────────────────────────────
  function drawFlickArrow(drag) {
    if (!drag) return;
    const { startX, startY, curX, curY } = drag;
    const dx  = startX - curX;
    const dy  = startY - curY;
    const len = Math.hypot(dx, dy);
    if (len < 20) return;

    // Strength indicator — grows with drag distance
    const strength = Math.min(len / 250, 1);
    const color    = `hsl(${200 - strength * 120}, 90%, 65%)`;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.lineCap     = 'round';
    ctx.globalAlpha = 0.75;

    const endX = startX + dx * 1.4;
    const endY = startY + dy * 1.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    ctx.setLineDash([]);
    const a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 14 * Math.cos(a - 0.4), endY - 14 * Math.sin(a - 0.4));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 14 * Math.cos(a + 0.4), endY - 14 * Math.sin(a + 0.4));
    ctx.stroke();
    ctx.restore();
  }

  // ── Result text ────────────────────────────────────────────────────────────
  function drawResult(text, color, alpha) {
    ctx.save();
    ctx.globalAlpha   = alpha;
    ctx.fillStyle     = color;
    ctx.font          = 'bold 76px system-ui, sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.shadowColor   = color;
    ctx.shadowBlur    = 36;
    ctx.fillText(text, W / 2, H / 2 - 60);
    ctx.restore();
  }

  // ── Main frame ─────────────────────────────────────────────────────────────
  function frame(dt, state) {
    const { bottle, liquid, drag, groundY, result, resultAlpha, showGlow, isOnFire } = state;
    updateParticles(dt);

    drawBackground(groundY, isOnFire);
    drawFlickArrow(drag);
    if (showGlow) drawLandingGlow(bottle, groundY);
    drawBottle(bottle, liquid, isOnFire);
    drawParticles();

    if (result) {
      const color = result === 'MAKE' ? '#69f0ae' : '#ff5252';
      drawResult(result === 'MAKE' ? 'MAKE!' : 'MISS', color, resultAlpha);
    }
  }

  return { init, resize, frame };
})();
