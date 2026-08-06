// cast25.js — bare-bones 25-character unlock ladder for Bottle Game.
// Loaded before skins.js. Exposes window.FLIP_CAST25 { ROSTER, drawFns, liquidFor }.
(function () {
  'use strict';

  const INK = '#2a2430';
  const FLAVORS = [
    '#1f9bff', '#e3263c', '#8ed11a', '#ff7a00', '#8a3ffc', '#5fcfe6',
    '#3fae1a', '#ff5b86', '#4f63e0', '#ffc233', '#c8203a', '#ff9ecf',
  ];
  function shade(hex, t) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = t >= 0 ? 255 : 0, u = Math.abs(t);
    return '#' + [r, g, b].map((c) => Math.round(c + (m - c) * u).toString(16).padStart(2, '0')).join('');
  }
  function eyes(x1, y1, x2, y2, r) {
    r = r || 7;
    return function (ctx) {
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.beginPath(); ctx.arc(x + 1, y + 1, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(x - 2, y - 2, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
    };
  }

  // World-level liquid inside a vessel clip. opts.angle is the body angle.
  // Open vessels pour when past ~70° from upright — fill drops + drip stream.
  function paintLiquid(ctx, opts, clipFn, surfaceY) {
    const liq = opts.liquid;
    if (!liq) return;
    const angle = opts.angle || 0;
    const color = opts.color || '#1f9bff';
    const fillCol = liq.sand ? '#c2a46b' : (liq.lava ? shade(color, 0.15) : color);
    let fill = liq.fill == null ? 0.35 : liq.fill;
    const abs = Math.abs(((angle + Math.PI) % (2 * Math.PI)) - Math.PI);
    const inverted = abs > 1.2;
    let pouring = false;
    if (liq.mode === 'open' && inverted) {
      fill = Math.max(0.02, fill * (1 - (abs - 1.2) * 0.9));
      pouring = fill < 0.18 || abs > 1.8;
    }
    const sy = surfaceY + (0.45 - fill) * 90;
    ctx.save();
    clipFn();
    ctx.clip();
    ctx.rotate(-angle);
    const tilt = Math.max(-0.28, Math.min(0.28, opts.slosh || 0));
    const slope = Math.tan(tilt);
    const yL = sy - 120 * slope, yR = sy + 120 * slope;
    ctx.fillStyle = fillCol;
    ctx.globalAlpha = liq.lava ? 0.85 : 0.92;
    ctx.beginPath();
    ctx.moveTo(-120, yL); ctx.lineTo(120, yR); ctx.lineTo(120, 240); ctx.lineTo(-120, 240);
    ctx.closePath(); ctx.fill();
    if (liq.lava) {
      ctx.fillStyle = shade(color, -0.25);
      for (const [bx, by, br] of [[-10, sy + 30, 14], [16, sy + 55, 18], [-18, sy + 70, 11]]) {
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-120, yL); ctx.lineTo(120, yR); ctx.stroke();
    ctx.restore();

    if (pouring && liq.mode === 'open') {
      ctx.save();
      ctx.strokeStyle = fillCol;
      ctx.fillStyle = fillCol;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      // Mouth is toward local -Y (top of vessel)
      ctx.beginPath();
      ctx.moveTo(0, -118);
      ctx.quadraticCurveTo(18 * Math.sin(angle * 2), -150, 8, -190);
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(6 + i * 4, -155 - i * 14, 3.5 - i * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function strokeFill(ctx, color, line) {
    ctx.fillStyle = color;
    ctx.strokeStyle = line || INK;
    ctx.lineWidth = 2.2;
    ctx.fill(); ctx.stroke();
  }

  // ── Individual draws ───────────────────────────────────────────────────────
  function drawKetchup(ctx, opts) {
    const c = opts.color || '#e3263c';
    const body = shade(c, -0.05);
    ctx.beginPath(); ctx.roundRect(-28, -100, 56, 130, 14);
    strokeFill(ctx, body);
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.45 } }), () => {
      ctx.beginPath(); ctx.roundRect(-24, -90, 48, 110, 12);
    }, 10);
    ctx.beginPath(); ctx.moveTo(-18, -100); ctx.lineTo(-8, -130); ctx.lineTo(8, -130); ctx.lineTo(18, -100);
    strokeFill(ctx, shade(c, 0.2));
    ctx.beginPath(); ctx.roundRect(-10, -142, 20, 16, 4);
    strokeFill(ctx, shade(c, -0.25));
    ctx.fillStyle = '#fff'; ctx.fillRect(-18, -50, 36, 22);
    ctx.fillStyle = c; ctx.fillRect(-18, -42, 36, 6);
  }

  function drawMaple(ctx, opts) {
    const c = opts.color || '#ff7a00';
    const glass = shade(c, 0.35);
    ctx.beginPath(); ctx.roundRect(-26, -95, 52, 120, 10);
    strokeFill(ctx, glass, shade(c, -0.4));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.4 } }), () => {
      ctx.beginPath(); ctx.roundRect(-22, -88, 44, 105, 8);
    }, 12);
    ctx.beginPath(); ctx.moveTo(20, -40); ctx.quadraticCurveTo(42, -50, 38, -20); ctx.quadraticCurveTo(28, -15, 20, -25);
    strokeFill(ctx, shade(c, 0.1));
    ctx.beginPath(); ctx.roundRect(-12, -118, 24, 28, 5);
    strokeFill(ctx, shade(c, -0.2));
    // maple leaf mark
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, -55); ctx.lineTo(8, -42); ctx.lineTo(0, -46); ctx.lineTo(-8, -42);
    ctx.closePath(); ctx.fill();
  }

  function drawHoneybear(ctx, opts) {
    const c = opts.color || '#ffc233';
    const fur = shade(c, 0.05);
    // body
    ctx.beginPath(); ctx.ellipse(0, -20, 36, 48, 0, 0, Math.PI * 2);
    strokeFill(ctx, fur);
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.42 } }), () => {
      ctx.beginPath(); ctx.ellipse(0, -20, 30, 42, 0, 0, Math.PI * 2);
    }, 8);
    // head
    ctx.beginPath(); ctx.arc(0, -78, 28, 0, Math.PI * 2);
    strokeFill(ctx, fur);
    // ears
    ctx.beginPath(); ctx.arc(-22, -98, 10, 0, Math.PI * 2); strokeFill(ctx, shade(c, -0.1));
    ctx.beginPath(); ctx.arc(22, -98, 10, 0, Math.PI * 2); strokeFill(ctx, shade(c, -0.1));
    eyes(-10, -82, 10, -82, 6)(ctx);
    ctx.beginPath(); ctx.ellipse(0, -70, 8, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(c, -0.35); ctx.fill();
    // cap spout
    ctx.beginPath(); ctx.roundRect(-8, -118, 16, 14, 3);
    strokeFill(ctx, '#c8203a');
  }

  function drawBabybottle(ctx, opts) {
    const c = opts.color || '#5fcfe6';
    ctx.beginPath(); ctx.roundRect(-24, -85, 48, 110, 12);
    strokeFill(ctx, 'rgba(220,240,255,0.55)', shade(c, -0.3));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.35 }, color: '#f5f0e1' }), () => {
      ctx.beginPath(); ctx.roundRect(-20, -78, 40, 95, 10);
    }, 14);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-18, -50 + i * 18); ctx.lineTo(-8, -50 + i * 18); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, -95, 22, 10, 0, 0, Math.PI * 2);
    strokeFill(ctx, c);
    ctx.beginPath(); ctx.ellipse(0, -118, 12, 16, 0, 0, Math.PI * 2);
    strokeFill(ctx, '#ff9ecf');
  }

  function drawExtinguisher(ctx, opts) {
    const c = opts.color || '#e3263c';
    ctx.beginPath(); ctx.roundRect(-30, -100, 60, 130, 10);
    strokeFill(ctx, c);
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.3 }, color: shade(c, 0.4) }), () => {
      ctx.beginPath(); ctx.roundRect(-26, -92, 52, 115, 8);
    }, 16);
    ctx.beginPath(); ctx.roundRect(-18, -118, 36, 22, 4);
    strokeFill(ctx, '#2a2430');
    ctx.beginPath(); ctx.moveTo(18, -105); ctx.quadraticCurveTo(48, -90, 40, -50); ctx.lineTo(34, -50); ctx.quadraticCurveTo(42, -88, 14, -100);
    strokeFill(ctx, '#1a1a1a');
    ctx.beginPath(); ctx.roundRect(30, -58, 16, 20, 4);
    strokeFill(ctx, '#444');
    ctx.fillStyle = '#ffc233'; ctx.fillRect(-22, -40, 44, 10);
  }

  function drawSoap(ctx, opts) {
    const c = opts.color || '#1f9bff';
    ctx.beginPath(); ctx.roundRect(-28, -80, 56, 105, 16);
    strokeFill(ctx, shade(c, 0.25));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.38 } }), () => {
      ctx.beginPath(); ctx.roundRect(-24, -72, 48, 90, 14);
    }, 10);
    // pump
    ctx.beginPath(); ctx.roundRect(-8, -118, 16, 40, 6);
    strokeFill(ctx, shade(c, -0.2));
    ctx.beginPath(); ctx.roundRect(-22, -128, 36, 14, 6);
    strokeFill(ctx, shade(c, -0.35));
    eyes(-10, -40, 10, -40, 6)(ctx);
  }

  function drawHourglass(ctx, opts) {
    const frame = opts.color || '#8a3ffc';
    // Sand stays sandy — frame tint is the wood/plastic, not the grains.
    const sand = '#d4b06a';
    const sandLo = '#a8843e';
    const sandHi = '#e8d49a';
    // Fraction of sand in the local-bottom bulb (physics-driven). Rest sits up top.
    const bottom = Math.max(0, Math.min(1, opts.sandBottom == null ? 0.18 : opts.sandBottom));
    const top = 1 - bottom;
    const flow = opts.sandFlow || 0;
    const angle = opts.angle || 0;
    // cos>0 upright (local +Y is world-down); cos<0 inverted (local −Y is world-down).
    const upright = Math.cos(angle) >= 0;
    // Avalanche tilt — sand piles steeper than water.
    const tilt = Math.max(-0.55, Math.min(0.55, (opts.slosh || 0) * 1.4));

    // Frame + glass
    ctx.beginPath(); ctx.roundRect(-34, -120, 68, 14, 4); strokeFill(ctx, shade(frame, -0.2));
    ctx.beginPath(); ctx.roundRect(-34, 20, 68, 14, 4); strokeFill(ctx, shade(frame, -0.2));
    ctx.beginPath();
    ctx.moveTo(-28, -106); ctx.lineTo(-8, -20); ctx.lineTo(-28, 20);
    ctx.lineTo(28, 20); ctx.lineTo(8, -20); ctx.lineTo(28, -106);
    ctx.closePath();
    strokeFill(ctx, 'rgba(200,230,255,0.35)', shade(frame, -0.4));

    // Clip to glass interior
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-24, -100); ctx.lineTo(-6, -20); ctx.lineTo(-24, 16);
    ctx.lineTo(24, 16); ctx.lineTo(6, -20); ctx.lineTo(24, -100);
    ctx.closePath();
    ctx.clip();

    // Draw a mound in a bulb. `floorY` is where grains rest; `towardY` is the
    // free surface direction (toward the neck or outer tip).
    function mound(amt, floorY, towardY, widthAtFloor) {
      if (amt < 0.01) return;
      const h = 6 + amt * 40;
      const dir = towardY < floorY ? -1 : 1;
      const surface = floorY + dir * h;
      const clamped = dir < 0
        ? Math.max(towardY, surface)
        : Math.min(towardY, surface);
      const half = widthAtFloor;
      const halfTop = Math.max(6, half * (0.35 + amt * 0.35));
      ctx.fillStyle = sand;
      ctx.beginPath();
      ctx.moveTo(-half, floorY);
      ctx.lineTo(-halfTop + tilt * 10, clamped);
      ctx.lineTo(halfTop + tilt * 10, clamped + tilt * 5);
      ctx.lineTo(half, floorY);
      ctx.closePath();
      ctx.fill();
      // Highlight ridge
      ctx.strokeStyle = sandHi;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(-halfTop + tilt * 10, clamped);
      ctx.lineTo(halfTop + tilt * 10, clamped + tilt * 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Grain speckles
      ctx.fillStyle = sandLo;
      const span = Math.abs(clamped - floorY);
      for (let i = 0; i < 6; i++) {
        const t = 0.15 + (i % 5) * 0.16;
        const gx = (-half + half * 2 * ((i * 0.37) % 1)) * 0.7 + tilt * 4;
        const gy = floorY + dir * span * t;
        ctx.beginPath(); ctx.arc(gx, gy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Bottom bulb (local +Y): rests on outer floor when upright, against neck when inverted.
    if (upright) mound(bottom, 16, -18, 24);
    else mound(bottom, -22, 16, 10);

    // Top bulb (local −Y): rests on neck when upright, on outer tip when inverted.
    if (upright) mound(top, -24, -100, 10);
    else mound(top, -100, -24, 24);

    // ── Neck stream while sand is flowing ────────────────────────────────────
    if (Math.abs(flow) > 0.05) {
      ctx.strokeStyle = sand;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = Math.min(1, Math.abs(flow) * 1.2);
      ctx.beginPath();
      // Stream runs along local Y through the waist; direction follows flow.
      if (flow > 0) {
        ctx.moveTo(tilt * 3, -28);
        ctx.lineTo(tilt * 2, 8);
      } else {
        ctx.moveTo(tilt * 3, 8);
        ctx.lineTo(tilt * 2, -28);
      }
      ctx.stroke();
      // Falling grains
      ctx.fillStyle = sandLo;
      const t = Math.abs(angle) * 7 + bottom * 20;
      for (let i = 0; i < 4; i++) {
        const gy = flow > 0 ? (-22 + ((t * 30 + i * 9) % 28)) : (6 - ((t * 30 + i * 9) % 28));
        ctx.beginPath();
        ctx.arc(tilt * 3 + (i % 2 ? 2 : -2), gy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawBowlingpin(ctx, opts) {
    const c = opts.color || '#f5f0e8';
    ctx.beginPath();
    ctx.moveTo(-18, 35); ctx.quadraticCurveTo(-32, -20, -16, -90);
    ctx.quadraticCurveTo(0, -115, 16, -90); ctx.quadraticCurveTo(32, -20, 18, 35);
    ctx.closePath();
    strokeFill(ctx, c);
    ctx.fillStyle = opts.color && opts.color !== '#f5f0e8' ? opts.color : '#e3263c';
    ctx.fillRect(-20, -70, 40, 8);
    ctx.fillRect(-22, -55, 44, 8);
  }

  function drawCone(ctx, opts) {
    const c = opts.color || '#ff7a00';
    ctx.beginPath();
    ctx.moveTo(0, -120); ctx.lineTo(36, 35); ctx.lineTo(-36, 35); ctx.closePath();
    strokeFill(ctx, c);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-14, -40); ctx.lineTo(14, -40); ctx.lineTo(18, -20); ctx.lineTo(-18, -20); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.lineTo(28, 20); ctx.lineTo(-28, 20); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 35, 40, 8, 0, 0, Math.PI * 2);
    strokeFill(ctx, shade(c, -0.25));
  }

  function drawFlask(ctx, opts) {
    const c = opts.color || '#8ed11a';
    ctx.beginPath();
    ctx.moveTo(-12, -120); ctx.lineTo(-12, -50); ctx.lineTo(-34, 30); ctx.lineTo(34, 30); ctx.lineTo(12, -50); ctx.lineTo(12, -120);
    ctx.closePath();
    strokeFill(ctx, 'rgba(210,240,220,0.45)', shade(c, -0.4));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'open', fill: 0.4 } }), () => {
      ctx.beginPath();
      ctx.moveTo(-10, -100); ctx.lineTo(-10, -50); ctx.lineTo(-30, 26); ctx.lineTo(30, 26); ctx.lineTo(10, -50); ctx.lineTo(10, -100);
      ctx.closePath();
    }, 8);
    ctx.beginPath(); ctx.roundRect(-16, -128, 32, 12, 3);
    strokeFill(ctx, shade(c, 0.2));
  }

  function drawShell(ctx, opts) {
    const c = opts.color || '#c8203a';
    ctx.beginPath(); ctx.roundRect(-18, -70, 36, 100, 6);
    strokeFill(ctx, shade('#c4a574', 0.1));
    ctx.beginPath();
    ctx.moveTo(-18, -70); ctx.lineTo(0, -130); ctx.lineTo(18, -70); ctx.closePath();
    strokeFill(ctx, shade(c, -0.1));
    ctx.fillStyle = shade('#c4a574', -0.2);
    for (let i = 0; i < 4; i++) ctx.fillRect(-18, -50 + i * 18, 36, 3);
  }

  function drawPawn(ctx, opts) {
    const c = opts.color || '#4f63e0';
    ctx.beginPath(); ctx.ellipse(0, 28, 32, 10, 0, 0, Math.PI * 2);
    strokeFill(ctx, shade(c, -0.25));
    ctx.beginPath(); ctx.moveTo(-22, 28); ctx.quadraticCurveTo(-18, -20, -10, -50); ctx.lineTo(10, -50); ctx.quadraticCurveTo(18, -20, 22, 28);
    ctx.closePath(); strokeFill(ctx, c);
    ctx.beginPath(); ctx.arc(0, -70, 18, 0, Math.PI * 2);
    strokeFill(ctx, shade(c, 0.1));
    ctx.beginPath(); ctx.arc(0, -95, 10, 0, Math.PI * 2);
    strokeFill(ctx, shade(c, 0.2));
  }

  function drawBuoy(ctx, opts) {
    const c = opts.color || '#ff7a00';
    ctx.beginPath(); ctx.arc(0, -30, 48, 0, Math.PI * 2);
    strokeFill(ctx, c);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -30, 48, -0.4, 0.4); ctx.arc(0, -30, 30, 0.4, -0.4, true); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -30, 48, Math.PI - 0.4, Math.PI + 0.4); ctx.arc(0, -30, 30, Math.PI + 0.4, Math.PI - 0.4, true); ctx.fill();
    eyes(-14, -36, 14, -36, 7)(ctx);
    ctx.beginPath(); ctx.ellipse(0, 30, 22, 8, 0, 0, Math.PI * 2);
    strokeFill(ctx, shade(c, -0.3));
  }

  function drawWineglass(ctx, opts) {
    const c = opts.color || '#c8203a';
    ctx.beginPath();
    ctx.moveTo(-28, -110); ctx.lineTo(-32, -40); ctx.quadraticCurveTo(0, -10, 32, -40); ctx.lineTo(28, -110);
    ctx.closePath();
    strokeFill(ctx, 'rgba(230,245,255,0.4)', '#6a8aaa');
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'open', fill: 0.35 } }), () => {
      ctx.beginPath();
      ctx.moveTo(-24, -100); ctx.lineTo(-28, -42); ctx.quadraticCurveTo(0, -16, 28, -42); ctx.lineTo(24, -100);
      ctx.closePath();
    }, -55);
    ctx.beginPath(); ctx.rect(-4, -12, 8, 40); strokeFill(ctx, '#d8e6f0', '#6a8aaa');
    ctx.beginPath(); ctx.ellipse(0, 32, 22, 7, 0, 0, Math.PI * 2);
    strokeFill(ctx, '#d8e6f0', '#6a8aaa');
  }

  function drawToucan(ctx, opts) {
    // Side-profile toucan — same stance language as the macaw, bigger bill.
    const c = opts.color || '#e3263c';
    const body = shade(c, -0.15);
    const belly = shade(c, 0.35);
    // tail
    ctx.beginPath();
    ctx.moveTo(-10, 10); ctx.quadraticCurveTo(-40, 40, -48, 55); ctx.quadraticCurveTo(-20, 35, -5, 20);
    strokeFill(ctx, shade(c, -0.35));
    // body
    ctx.beginPath(); ctx.ellipse(5, -10, 32, 48, -0.2, 0, Math.PI * 2);
    strokeFill(ctx, body);
    ctx.beginPath(); ctx.ellipse(14, 0, 16, 30, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = belly; ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(18, -70, 26, 0, Math.PI * 2);
    strokeFill(ctx, body);
    // huge bill
    const bill = shade(c, 0.2);
    ctx.beginPath();
    ctx.moveTo(30, -78); ctx.quadraticCurveTo(90, -90, 100, -60); ctx.quadraticCurveTo(90, -40, 32, -55);
    ctx.closePath(); strokeFill(ctx, bill);
    ctx.beginPath();
    ctx.moveTo(32, -55); ctx.quadraticCurveTo(70, -40, 88, -52); ctx.quadraticCurveTo(60, -48, 32, -58);
    strokeFill(ctx, shade('#ffc233', 0.1));
    // eye
    ctx.beginPath(); ctx.arc(22, -75, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(23, -74, 3, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    // feet
    ctx.strokeStyle = '#c8901a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5, 30); ctx.lineTo(-5, 39); ctx.moveTo(12, 30); ctx.lineTo(12, 39); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-5, 39); ctx.lineTo(-14, 42); ctx.moveTo(-5, 39); ctx.lineTo(2, 43);
    ctx.moveTo(12, 39); ctx.lineTo(4, 43); ctx.moveTo(12, 39); ctx.lineTo(20, 42);
    ctx.stroke();
  }

  function drawWhippedcream(ctx, opts) {
    const c = opts.color || '#e3263c';
    ctx.beginPath(); ctx.roundRect(-26, -90, 52, 115, 10);
    strokeFill(ctx, shade('#f4f4f4', 0));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.35 }, color: '#fff8f0' }), () => {
      ctx.beginPath(); ctx.roundRect(-22, -82, 44, 100, 8);
    }, 12);
    ctx.fillStyle = c; ctx.fillRect(-26, -50, 52, 28);
    ctx.beginPath(); ctx.roundRect(-10, -115, 20, 28, 4);
    strokeFill(ctx, '#bbb');
    ctx.beginPath(); ctx.moveTo(-4, -115); ctx.lineTo(0, -135); ctx.lineTo(4, -115);
    strokeFill(ctx, '#888');
  }

  function drawPotion(ctx, opts) {
    const c = opts.color || '#8a3ffc';
    ctx.beginPath();
    ctx.moveTo(-16, -90); ctx.quadraticCurveTo(-40, -20, -32, 30); ctx.lineTo(32, 30);
    ctx.quadraticCurveTo(40, -20, 16, -90); ctx.closePath();
    strokeFill(ctx, 'rgba(180,160,255,0.4)', shade(c, -0.3));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.4 } }), () => {
      ctx.beginPath();
      ctx.moveTo(-12, -80); ctx.quadraticCurveTo(-34, -16, -28, 24); ctx.lineTo(28, 24);
      ctx.quadraticCurveTo(34, -16, 12, -80); ctx.closePath();
    }, 5);
    ctx.beginPath(); ctx.roundRect(-12, -115, 24, 28, 4);
    strokeFill(ctx, shade(c, 0.15));
    // star cork
    ctx.fillStyle = '#ffc233';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const r = i === 0 ? 12 : 12;
      const x = Math.cos(a) * r, y = -128 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a2) * 5, -128 + Math.sin(a2) * 5);
    }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function drawTabasco(ctx, opts) {
    const c = opts.color || '#e3263c';
    ctx.beginPath(); ctx.roundRect(-14, -100, 28, 125, 6);
    strokeFill(ctx, shade(c, 0.05));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.38 } }), () => {
      ctx.beginPath(); ctx.roundRect(-11, -92, 22, 110, 5);
    }, 10);
    ctx.fillStyle = '#ffc233';
    ctx.beginPath();
    ctx.moveTo(0, -70); ctx.lineTo(12, -50); ctx.lineTo(0, -30); ctx.lineTo(-12, -50);
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-10, -118, 20, 20, 3);
    strokeFill(ctx, shade(c, -0.3));
  }

  function drawCoke(ctx, opts) {
    const c = opts.color || '#c8203a';
    // contour bottle
    ctx.beginPath();
    ctx.moveTo(-16, -115); ctx.lineTo(-16, -95);
    ctx.quadraticCurveTo(-28, -70, -22, -40); ctx.quadraticCurveTo(-30, -10, -20, 30);
    ctx.lineTo(20, 30); ctx.quadraticCurveTo(30, -10, 22, -40); ctx.quadraticCurveTo(28, -70, 16, -95);
    ctx.lineTo(16, -115); ctx.closePath();
    strokeFill(ctx, 'rgba(200,230,255,0.35)', shade(c, -0.4));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.4 }, color: shade(c, -0.45) }), () => {
      ctx.beginPath();
      ctx.moveTo(-13, -100); ctx.lineTo(-13, -90);
      ctx.quadraticCurveTo(-24, -68, -18, -40); ctx.quadraticCurveTo(-26, -8, -17, 26);
      ctx.lineTo(17, 26); ctx.quadraticCurveTo(26, -8, 18, -40); ctx.quadraticCurveTo(24, -68, 13, -90);
      ctx.lineTo(13, -100); ctx.closePath();
    }, 8);
    ctx.beginPath(); ctx.roundRect(-12, -138, 24, 26, 5);
    strokeFill(ctx, c);
    // ribbon label (no trademark text)
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, -55, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffc233'; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawStanley(ctx, opts) {
    const c = opts.color || '#1f9bff';
    ctx.beginPath(); ctx.roundRect(-28, -100, 56, 125, 14);
    strokeFill(ctx, shade(c, 0.05));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.45 } }), () => {
      ctx.beginPath(); ctx.roundRect(-24, -92, 48, 110, 12);
    }, 8);
    // handle
    ctx.beginPath(); ctx.roundRect(28, -70, 14, 50, 6);
    strokeFill(ctx, shade(c, -0.15));
    // lid + straw
    ctx.beginPath(); ctx.roundRect(-30, -118, 60, 22, 8);
    strokeFill(ctx, shade(c, -0.25));
    ctx.beginPath(); ctx.roundRect(6, -150, 8, 40, 3);
    strokeFill(ctx, '#fff');
  }

  function drawLavalamp(ctx, opts) {
    const c = opts.color || '#ff5b86';
    ctx.beginPath(); ctx.ellipse(0, 28, 28, 12, 0, 0, Math.PI * 2);
    strokeFill(ctx, shade(c, -0.35));
    ctx.beginPath();
    ctx.moveTo(-22, 20); ctx.quadraticCurveTo(-36, -40, -18, -110); ctx.lineTo(18, -110);
    ctx.quadraticCurveTo(36, -40, 22, 20); ctx.closePath();
    strokeFill(ctx, 'rgba(220,240,255,0.35)', shade(c, -0.3));
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.55, lava: true } }), () => {
      ctx.beginPath();
      ctx.moveTo(-18, 14); ctx.quadraticCurveTo(-30, -40, -14, -100); ctx.lineTo(14, -100);
      ctx.quadraticCurveTo(30, -40, 18, 14); ctx.closePath();
    }, -20);
    ctx.beginPath(); ctx.roundRect(-16, -122, 32, 14, 4);
    strokeFill(ctx, shade(c, -0.2));
  }

  function drawLawnchair(ctx, opts) {
    const c = opts.color || '#3fae1a';
    // side view folding chair
    ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-30, 35); ctx.lineTo(-10, -90); ctx.lineTo(35, -70); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(25, 35); ctx.lineTo(-5, -40); ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-12, -85); ctx.lineTo(32, -66); ctx.lineTo(28, -40); ctx.lineTo(-16, -55); ctx.closePath();
    ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18, -50); ctx.lineTo(30, -35); ctx.lineTo(28, -10); ctx.lineTo(-20, -22); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  function drawOctopus(ctx, opts) {
    const c = opts.color || '#ff5b86';
    // tentacles to contact plane
    for (const [sx, mx, ex] of [[-20, -35, -30], [-8, -18, -12], [8, 18, 12], [20, 35, 30], [-28, -40, -38], [28, 40, 38]]) {
      ctx.beginPath();
      ctx.moveTo(sx, -20); ctx.quadraticCurveTo(mx, 10, ex, 38);
      ctx.strokeStyle = shade(c, -0.15); ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, 38, 6, 0, Math.PI * 2);
      ctx.fillStyle = shade(c, 0.2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, -50, 40, 0, Math.PI * 2);
    strokeFill(ctx, c);
    eyes(-14, -55, 14, -55, 9)(ctx);
    ctx.beginPath(); ctx.arc(0, -35, 8, 0, Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  }

  const drawFns = {
    ketchup: drawKetchup,
    maple: drawMaple,
    honeybear: drawHoneybear,
    babybottle: drawBabybottle,
    extinguisher: drawExtinguisher,
    soap: drawSoap,
    hourglass: drawHourglass,
    bowlingpin: drawBowlingpin,
    cone: drawCone,
    flask: drawFlask,
    shell: drawShell,
    pawn: drawPawn,
    buoy: drawBuoy,
    wineglass: drawWineglass,
    toucan: drawToucan,
    whippedcream: drawWhippedcream,
    potion: drawPotion,
    tabasco: drawTabasco,
    coke: drawCoke,
    stanley: drawStanley,
    lavalamp: drawLavalamp,
    lawnchair: drawLawnchair,
    octopus: drawOctopus,
  };

  const ROSTER = [
    { id: 'bottle', name: 'Bottle', emoji: '🍾', drawAs: 'bottle', unlock: null, tint: '#1f9bff', liquid: { mode: 'closed', fill: 0.32 } },
    { id: 'ketchup', name: 'Ketchup', emoji: '🍅', drawAs: 'ketchup', unlock: 4, tint: '#e3263c', liquid: { mode: 'closed', fill: 0.45 } },
    { id: 'maple', name: 'Maple Syrup', emoji: '🍁', drawAs: 'maple', unlock: 8, tint: '#ff7a00', liquid: { mode: 'closed', fill: 0.4 } },
    { id: 'honeybear', name: 'Honey Bear', emoji: '🐻', drawAs: 'honeybear', unlock: 12, tint: '#ffc233', liquid: { mode: 'closed', fill: 0.42 } },
    { id: 'babybottle', name: 'Baby Bottle', emoji: '🍼', drawAs: 'babybottle', unlock: 16, tint: '#5fcfe6', liquid: { mode: 'closed', fill: 0.35 } },
    { id: 'extinguisher', name: 'Extinguisher', emoji: '🧯', drawAs: 'extinguisher', unlock: 20, tint: '#e3263c', liquid: { mode: 'closed', fill: 0.3 } },
    { id: 'soap', name: 'Soap Pump', emoji: '🧼', drawAs: 'soap', unlock: 24, tint: '#1f9bff', liquid: { mode: 'closed', fill: 0.38 } },
    { id: 'hourglass', name: 'Hourglass', emoji: '⌛', drawAs: 'hourglass', unlock: 28, tint: '#8a3ffc', liquid: { mode: 'sand', fill: 0.5, sand: true } },
    { id: 'bowlingpin', name: 'Bowling Pin', emoji: '🎳', drawAs: 'bowlingpin', unlock: 32, tint: '#f5f0e8', liquid: null },
    { id: 'cone', name: 'Traffic Cone', emoji: '🚧', drawAs: 'cone', unlock: 36, tint: '#ff7a00', liquid: null },
    { id: 'flask', name: 'Lab Flask', emoji: '🧪', drawAs: 'flask', unlock: 40, tint: '#8ed11a', liquid: { mode: 'open', fill: 0.4 } },
    { id: 'shell', name: 'Artillery Shell', emoji: '💥', drawAs: 'shell', unlock: 44, tint: '#c8203a', liquid: null },
    { id: 'pawn', name: 'Chess Pawn', emoji: '♟️', drawAs: 'pawn', unlock: 48, tint: '#4f63e0', liquid: null },
    { id: 'buoy', name: 'Buoy', emoji: '🟠', drawAs: 'buoy', unlock: 52, tint: '#ff7a00', liquid: null },
    { id: 'wineglass', name: 'Wine Glass', emoji: '🍷', drawAs: 'wineglass', unlock: 56, tint: '#c8203a', liquid: { mode: 'open', fill: 0.35 } },
    { id: 'toucan', name: 'Toucan', emoji: '🦜', drawAs: 'toucan', unlock: 60, tint: '#e3263c', liquid: null },
    { id: 'trex', name: 'T-Rex', emoji: '🦖', drawAs: 'trex', unlock: 64, tint: '#ff7a00', liquid: null },
    { id: 'whippedcream', name: 'Whipped Cream', emoji: '🍦', drawAs: 'whippedcream', unlock: 68, tint: '#ff5b86', liquid: { mode: 'closed', fill: 0.35 } },
    { id: 'potion', name: 'Potion', emoji: '✨', drawAs: 'potion', unlock: 72, tint: '#8a3ffc', liquid: { mode: 'closed', fill: 0.4 } },
    { id: 'tabasco', name: 'Hot Sauce', emoji: '🌶️', drawAs: 'tabasco', unlock: 76, tint: '#e3263c', liquid: { mode: 'closed', fill: 0.38 } },
    { id: 'coke', name: 'Cola Bottle', emoji: '🥤', drawAs: 'coke', unlock: 80, tint: '#c8203a', liquid: { mode: 'closed', fill: 0.4 } },
    { id: 'stanley', name: 'Tumbler', emoji: '🧊', drawAs: 'stanley', unlock: 84, tint: '#1f9bff', liquid: { mode: 'closed', fill: 0.45 } },
    { id: 'lavalamp', name: 'Lava Lamp', emoji: 'lava', drawAs: 'lavalamp', unlock: 88, tint: '#ff5b86', liquid: { mode: 'closed', fill: 0.55, lava: true } },
    { id: 'lawnchair', name: 'Lawn Chair', emoji: '🪑', drawAs: 'lawnchair', unlock: 92, tint: '#3fae1a', liquid: null },
    { id: 'octopus', name: 'Octopus', emoji: '🐙', drawAs: 'octopus', unlock: 96, tint: '#ff5b86', liquid: null },
    { id: 'alien', name: 'Alien', emoji: '👽', drawAs: 'alien', unlock: 100, tint: '#8ed11a', liquid: null },
  ];

  // Fix lava emoji (no single-codepoint in all fonts) — use lamp
  ROSTER.find((r) => r.id === 'lavalamp').emoji = '💡';

  const BY_ID = Object.create(null);
  for (const r of ROSTER) BY_ID[r.id] = r;

  window.FLIP_CAST25 = {
    ROSTER,
    drawFns,
    flavors: FLAVORS,
    liquidFor: (id) => (BY_ID[id] && BY_ID[id].liquid) || null,
    entry: (id) => BY_ID[id] || null,
  };
})();
