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

  function resize(w, h) { W = w; H = h; }

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
  // Wide squat Gatorade bottle: 74px body, short neck, wide orange cap, blue fill.
  // Local coords centered at bottle.position (physics CG, ~40px above visual base).
  function drawBottle(bottle, liquid, isOnFire) {
    const { x, y } = bottle.position;
    const angle  = bottle.angle;
    const offset = liquid.renderOffset();

    // ON FIRE glow
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

    // Reusable body outline (wide, flat-bottomed Gatorade shape, y=-72..+43)
    const traceBody = () => { ctx.beginPath(); ctx.roundRect(-37, -72, 74, 115, 10); };

    // Clear-plastic glass tint — translucent so the blue liquid shows through
    const glass = ctx.createLinearGradient(-37, 0, 37, 0);
    glass.addColorStop(0,    'rgba(198, 224, 245, 0.30)');
    glass.addColorStop(0.20, 'rgba(244, 251, 255, 0.46)');
    glass.addColorStop(0.55, 'rgba(208, 234, 250, 0.32)');
    glass.addColorStop(1,    'rgba(186, 218, 240, 0.26)');

    // ── Shoulder + neck (drawn first, body covers the junction) ────────────
    ctx.fillStyle   = glass;
    ctx.strokeStyle = 'rgba(90, 150, 205, 0.55)';
    ctx.lineWidth   = 1.6;
    ctx.beginPath();
    ctx.moveTo(-37, -68);
    ctx.lineTo(-22, -86);
    ctx.lineTo( 22, -86);
    ctx.lineTo( 37, -68);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-22, -122, 44, 40, 7);
    ctx.fill();
    ctx.stroke();

    // ── Body: clear glass fill ─────────────────────────────────────────────
    traceBody();
    ctx.fillStyle = glass;
    ctx.fill();

    // ── Vivid blue liquid, clipped to body, bottom ~40% ───────────────────
    ctx.save();
    traceBody();
    ctx.clip();
    // Fill ~30%: body interior is y=-72..+43 (115px); surface at y=15 → bottom ~24%
    ctx.fillStyle = 'rgba(0, 128, 255, 0.92)';
    ctx.beginPath();
    ctx.rect(offset - 38, 15, 76, 32);
    ctx.fill();
    // brighter meniscus surface
    ctx.fillStyle = 'rgba(45, 175, 255, 0.95)';
    ctx.beginPath();
    ctx.ellipse(offset, 15, 37, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 235, 255, 0.90)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(offset, 15, 35, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── Specular highlights (clipped to body) ──────────────────────────────
    ctx.save();
    traceBody();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(-30, -72, 6, 115);   // left bright strip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(23, -72, 4, 115);    // right faint reflection
    ctx.restore();

    // ── Crisp body outline ─────────────────────────────────────────────────
    traceBody();
    ctx.strokeStyle = 'rgba(85, 145, 200, 0.80)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // ── Label band (upper body, above the waterline) ──────────────────────
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    ctx.beginPath();
    ctx.roundRect(-35, -58, 70, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#ff6d00';        // brand stripe
    ctx.fillRect(-35, -47, 70, 5);

    // ── Wide orange Gatorade cap ───────────────────────────────────────────
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.roundRect(-24, -146, 48, 26, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.roundRect(-21, -144, 12, 7, 2);
    ctx.fill();

    ctx.restore();

    // Blue splash on hard slosh
    if (Math.abs(liquid.vel) > 1.6) {
      spawnSplash(x, y - 30, 2, 'rgba(0, 170, 255, 0.85)');
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
