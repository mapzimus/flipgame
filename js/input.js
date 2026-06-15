// input.js — pointer flick detection (mouse + touch unified)

const Input = (() => {
  const MIN_DRAG = 22;   // px — small dead zone so a quick flick registers
  const HISTORY_MS = 70; // rolling velocity window (captures the snap at release)

  let canvas, onFlick;
  let dragging = false;
  let startX = 0, startY = 0;
  let curX = 0, curY = 0;
  let history = [];
  let enabled = false;

  function attach(cvs, flickCallback) {
    canvas  = cvs;
    onFlick = flickCallback;

    canvas.addEventListener('pointerdown',  onDown);
    canvas.addEventListener('pointermove',  onMove);
    canvas.addEventListener('pointerup',    onUp);
    canvas.addEventListener('pointercancel', onUp);
  }

  function enable()  { enabled = true;  }
  function disable() { enabled = false; dragging = false; history = []; }

  function onDown(e) {
    if (!enabled) return;
    e.preventDefault();
    dragging = true;
    startX = curX = e.clientX - canvas.getBoundingClientRect().left;
    startY = curY = e.clientY - canvas.getBoundingClientRect().top;
    history = [{ x: startX, y: startY, t: performance.now() }];
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    curX = e.clientX - rect.left;
    curY = e.clientY - rect.top;
    const now = performance.now();
    history.push({ x: curX, y: curY, t: now });
    history = history.filter(p => now - p.t < HISTORY_MS * 1.5);
  }

  function onUp(e) {
    if (!dragging || !enabled) return;
    dragging = false;

    const dx = curX - startX;
    const dy = curY - startY;
    const dist = Math.hypot(dx, dy);

    if (dist < MIN_DRAG) { history = []; return; }

    // Velocity from last HISTORY_MS of points
    const now = performance.now();
    const recent = history.filter(p => now - p.t < HISTORY_MS);
    if (recent.length >= 2) {
      const p1 = recent[0];
      const p2 = recent[recent.length - 1];
      const dt = Math.max((p2.t - p1.t) / 1000, 0.01);
      const vx = (p2.x - p1.x) / dt;
      const vy = (p2.y - p1.y) / dt;
      onFlick(vx, vy);
    } else {
      // Fallback: total displacement
      onFlick(dx * 12, dy * 12);
    }
    history = [];
  }

  // Returns drag vector for drawing the preview arrow
  function getDragState() {
    if (!dragging) return null;
    return { startX, startY, curX, curY };
  }

  return { attach, enable, disable, getDragState };
})();
