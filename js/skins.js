/* skins.js — flippable "editions" for the Bottle Game.
 *
 * The base object you flip is the Bottle. Skins are alternate objects that draw
 * over the SAME physics body (same flick, spin, landing rules) — only the paint
 * changes. Parrot is the first; the registry is built so future silly editions
 * drop in with just a draw function + an unlock rule.
 *
 * A skin's draw(ctx, opts) is called by renderer.js AFTER it has already
 * translated to the object's on-screen center, rotated by the body angle, and
 * scaled by the scene's draw scale — so a skin just paints in local object
 * coords (origin = physics CG, ground-contact plane at y≈+39, like the bottle).
 *
 * window.Skins API:
 *   list()            -> [{id,name,emoji,unlock}]  (includes 'bottle')
 *   hasDraw(id)       -> is there a skin-specific draw fn (false for 'bottle')
 *   draw(ctx,id,opts) -> paint skin `id`; opts: {color, slosh}
 *   unlockRule(id)    -> null (always on) | <number> (total wins needed — see Records.totalWins())
 *   preload(colors)   -> warm any sprite caches for these player colors
 *
 * No external libraries; SVG skins bake to data: URIs, so it stays offline-safe.
 */
window.Skins = (function () {
  'use strict';

  // ── Color helpers ──────────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(
      Math.round(A[0] + (B[0] - A[0]) * t),
      Math.round(A[1] + (B[1] - A[1]) * t),
      Math.round(A[2] + (B[2] - A[2]) * t)
    );
  }
  const shadeHex = (hex, t) => (t >= 0 ? mixHex(hex, '#ffffff', t) : mixHex(hex, '#000000', -t));

  // ── Parrot skin (authored SVG macaw) ────────────────────────────────────────
  // Side-profile Caribbean macaw baked per player color into offscreen Images.
  // Two layers: BODY + WING (wing flaps a few degrees off the slosh signal).
  // Foot soles map to local y≈+39 (the physics contact plane), so it lands like
  // the bottle regardless of the scene's draw scale.
  const SPR = (() => {
    const VIEW_W = 300, GROUND_SVG = 376, GROUND_LOCAL = 39, SCALE = 0.62;
    const VIEW_H = 420;
    const destW = VIEW_W * SCALE, destH = VIEW_H * SCALE;
    return {
      destX: -destW / 2,
      destY: GROUND_LOCAL - GROUND_SVG * SCALE,
      destW, destH,
      pivX: (132 - VIEW_W / 2) * SCALE,
      pivY: (150 - GROUND_SVG) * SCALE + GROUND_LOCAL,
    };
  })();

  const ANAT = {
    beakHi: '#f7efdf', beakLo: '#d9c7a3', beakEdge: '#8f7d5c',
    mandible: '#3c3733', nostril: '#77664c',
    face: '#f4efe3', iris: '#e3c584', pupil: '#17110c', eyeRing: '#9c8a6a',
    legNear: '#8d8577', legFar: '#6e6759', claw: '#4a443c',
    patch: '#1b1b1b', strap: '#141414',
  };

  function parrotPalette(base) {
    return {
      base,
      crown:  shadeHex(base,  0.10),
      chest:  shadeHex(base,  0.18),
      deep:   shadeHex(base, -0.30),
      wing:   shadeHex(base, -0.10),
      wingLn: shadeHex(base, -0.26),
      covert: mixHex(base, '#e9c46a', 0.55),
      covertEdge: shadeHex(mixHex(base, '#e9c46a', 0.55), -0.25),
      prim:   mixHex(base, '#1f3a5f', 0.60),
      primHi: shadeHex(mixHex(base, '#1f3a5f', 0.60), 0.25),
      tail:   mixHex(base, '#1f3a5f', 0.38),
      line:   shadeHex(base, -0.52),
    };
  }

  function parrotBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gB" x1="0" y1="60" x2="0" y2="345" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.crown}"/><stop offset="0.45" stop-color="${p.base}"/><stop offset="1" stop-color="${p.deep}"/>
</linearGradient>
<linearGradient id="gK" x1="222" y1="56" x2="266" y2="140" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${ANAT.beakHi}"/><stop offset="1" stop-color="${ANAT.beakLo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 118 312 C 92 350 66 378 50 404 C 62 407 78 396 91 372 C 103 350 113 331 121 317 Z" fill="${p.tail}"/>
<path d="M 118 312 C 95 346 72 374 56 398" fill="none" stroke="${p.primHi}" stroke-width="2" opacity="0.55"/>
<path d="M 127 316 C 109 348 93 372 82 391 C 94 391 107 374 117 352 C 123 340 127 328 129 318 Z" fill="${p.prim}"/>
<path d="M 134 318 C 124 340 113 357 106 367 C 117 365 127 350 135 331 Z" fill="${p.deep}"/>
<path d="M 148 336 L 146 365" fill="none" stroke="${ANAT.legFar}" stroke-width="9"/>
<path d="M 146 365 L 127 375 M 146 365 L 145 377 M 146 365 L 161 375" fill="none" stroke="${ANAT.legFar}" stroke-width="6"/>
<path d="M 168 106 C 136 118 116 140 112 168 C 106 208 96 252 100 292 C 102 318 118 334 142 340 C 168 346 190 338 202 318 C 218 292 228 250 230 210 C 232 178 224 148 208 128 C 196 114 182 106 168 106 Z" fill="url(#gB)" stroke="${p.line}" stroke-width="1.5" opacity="0.98"/>
<ellipse cx="214" cy="212" rx="24" ry="66" fill="${p.chest}" opacity="0.32" transform="rotate(-7 214 212)"/>
<circle cx="195" cy="88" r="44" fill="${p.crown}"/>
<path d="M 153 66 A 44 44 0 0 1 233 72" fill="none" stroke="${p.line}" stroke-width="1.5"/>
<path d="M 224 58 C 200 52 178 58 170 74 C 164 88 166 104 176 114 C 188 124 206 126 218 120 L 220 118 C 214 98 216 76 224 58 Z" fill="${ANAT.face}" stroke="${p.line}" stroke-width="1" opacity="0.96"/>
<path d="M 176 72 C 190 66 204 64 216 64 M 172 86 C 188 82 204 82 218 84 M 174 100 C 188 100 202 102 214 106" fill="none" stroke="${p.base}" stroke-width="1.6" opacity="0.8"/>
<path d="M 222 54 C 244 52 262 62 268 80 C 274 100 268 126 252 146 C 248 130 240 122 228 116 L 224 112 C 230 94 228 72 222 54 Z" fill="url(#gK)" stroke="${ANAT.beakEdge}" stroke-width="1.2"/>
<path d="M 226 58 C 244 58 258 68 263 82" fill="none" stroke="#fbf6ea" stroke-width="2" opacity="0.7"/>
<path d="M 224 112 C 236 116 246 128 252 144" fill="none" stroke="${ANAT.beakEdge}" stroke-width="1.5" opacity="0.8"/>
<path d="M 220 116 C 228 120 238 128 244 138 C 236 142 224 142 214 136 C 210 130 212 122 220 116 Z" fill="${ANAT.mandible}"/>
<ellipse cx="233" cy="64" rx="3" ry="2.4" fill="${ANAT.nostril}" transform="rotate(15 233 64)"/>
<circle cx="190" cy="84" r="8" fill="${ANAT.iris}" stroke="${ANAT.eyeRing}" stroke-width="1"/>
<circle cx="190" cy="84" r="4.4" fill="${ANAT.pupil}"/>
<circle cx="192" cy="81" r="1.8" fill="#ffffff"/>
<path d="M 214 56 C 196 60 178 64 162 72 C 152 78 146 86 142 96" fill="none" stroke="${ANAT.strap}" stroke-width="3.5"/>
<g transform="rotate(-16 173 67)">
<rect x="159" y="57" width="28" height="20" rx="6" fill="${ANAT.patch}"/>
<path d="M 164 62 C 169 59 177 58 182 60" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
</g>
<path d="M 176 332 L 174 363" fill="none" stroke="${ANAT.legNear}" stroke-width="10"/>
<path d="M 174 363 L 152 375 M 174 363 L 172 377 M 174 363 L 192 373" fill="none" stroke="${ANAT.legNear}" stroke-width="7"/>
<path d="M 152 375 L 147 378 M 172 377 L 171 381 M 192 373 L 196 377" fill="none" stroke="${ANAT.claw}" stroke-width="3"/>
</g>
</svg>`;
  }

  function parrotWingSVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gW" x1="0" y1="150" x2="0" y2="350" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.wing}"/><stop offset="1" stop-color="${p.deep}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 130 148 C 104 162 90 192 92 226 C 94 262 104 300 126 330 C 138 344 154 350 166 340 C 176 330 178 310 172 280 C 165 242 158 200 148 172 C 144 158 138 150 130 148 Z" fill="url(#gW)" stroke="${p.line}" stroke-width="1.5" opacity="0.98"/>
<path d="M 106 192 C 116 200 128 204 138 202 M 116 172 C 126 180 138 184 148 182 M 100 216 C 112 226 128 230 142 228" fill="none" stroke="${p.wingLn}" stroke-width="1.8" opacity="0.7"/>
<path d="M 100 242 C 116 256 138 262 158 256" fill="none" stroke="${p.covert}" stroke-width="12" opacity="0.95"/>
<path d="M 101 248 C 117 262 139 268 157 262" fill="none" stroke="${p.covertEdge}" stroke-width="2.5" opacity="0.8"/>
<path d="M 104 260 C 114 292 130 318 152 338 L 162 341 C 142 318 126 288 116 258 Z" fill="${p.prim}"/>
<path d="M 118 258 C 128 288 144 314 164 332 L 169 326 C 152 306 138 280 130 254 Z" fill="${p.prim}" opacity="0.85"/>
<path d="M 104 260 C 116 294 134 322 158 340 M 118 256 C 130 288 146 314 166 330" fill="none" stroke="${p.primHi}" stroke-width="1.6" opacity="0.6"/>
</g>
</svg>`;
  }

  // Sprites are SVG data URIs, so they decode a frame or two after they're
  // asked for. The game loop repaints constantly and doesn't care, but the
  // static setup-screen previews need a nudge once one lands.
  const loadListeners = [];
  function onSpriteLoad(cb) { if (typeof cb === 'function') loadListeners.push(cb); }
  function spriteLoaded() { for (const cb of loadListeners) { try { cb(); } catch (_) {} } }

  const spriteCache = new Map();
  function getParrotSprite(color) {
    let entry = spriteCache.get(color);
    if (entry) return entry;
    const p = parrotPalette(color);
    entry = { body: new Image(), wing: new Image(), loaded: 0, ready: false };
    const arm = (img, svg) => {
      img.onload = () => { if (++entry.loaded === 2) { entry.ready = true; spriteLoaded(); } };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };
    arm(entry.body, parrotBodySVG(p));
    arm(entry.wing, parrotWingSVG(p));
    spriteCache.set(color, entry);
    return entry;
  }

  // draw(ctx, opts) — ctx already at object center, rotated + scaled by renderer.
  function drawParrot(ctx, opts) {
    const color = opts.color || '#d62828';
    const flap = Math.max(-0.45, Math.min(0.45, (opts.slosh || 0) * 0.55));
    const spr = getParrotSprite(color);
    if (spr.ready) {
      ctx.drawImage(spr.body, SPR.destX, SPR.destY, SPR.destW, SPR.destH);
      ctx.save();
      ctx.translate(SPR.pivX, SPR.pivY);
      ctx.rotate(flap * 0.5);
      ctx.translate(-SPR.pivX, -SPR.pivY);
      ctx.drawImage(spr.wing, SPR.destX, SPR.destY, SPR.destW, SPR.destH);
      ctx.restore();
    } else {
      // brief placeholder while the SVG Images decode
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, -12, 30, 52, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(14, -72, 22, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Generic single-layer sprite cache ─────────────────────────────────────
  // Most skins (everything except the parrot's flapping wing) are one static
  // image per color. Keyed by "skinId|color"; built lazily from an SVG builder
  // fn(palette) -> string. Shares the parrot's SPR geometry (same 300×420
  // viewBox, ground at svg y=376), so every skin lands on the same contact
  // plane regardless of the scene's draw scale.
  const singleCache = new Map();
  function getSingleSprite(skinId, color, palette, buildSvg) {
    const key = skinId + '|' + color;
    let entry = singleCache.get(key);
    if (entry) return entry;
    entry = { img: new Image(), ready: false };
    entry.img.onload = () => { entry.ready = true; spriteLoaded(); };
    entry.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildSvg(palette));
    singleCache.set(key, entry);
    return entry;
  }
  // Draws a ready single-layer sprite, or a plain silhouette placeholder (same
  // fallback shape the parrot uses) while its Image is still decoding.
  function drawSingleSprite(ctx, skinId, color, palette, buildSvg) {
    const spr = getSingleSprite(skinId, color, palette, buildSvg);
    if (spr.ready) {
      ctx.drawImage(spr.img, SPR.destX, SPR.destY, SPR.destW, SPR.destH);
    } else {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, -12, 30, 52, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Plunger skin ───────────────────────────────────────────────────────────
  // Rubber cup at the base (player-tinted, doubles as the physics contact
  // point) on a fixed wood handle, with a googly-eyed face for personality.
  const PLUNGER = {
    wood: '#a9754a', woodDk: '#8a5c37', ferrule: '#c3c9cf', ferruleDk: '#8b9299',
    eyeWhite: '#ffffff', pupil: '#1a1a1a', mouth: '#3a2418',
  };
  function plungerPalette(base) {
    return { base, hi: shadeHex(base, 0.16), lo: shadeHex(base, -0.28), line: shadeHex(base, -0.5) };
  }
  function plungerBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gP" x1="0" y1="270" x2="0" y2="378" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 70 366 C 70 322 90 282 150 276 C 210 282 230 322 230 366 Z" fill="url(#gP)" stroke="${p.line}" stroke-width="2"/>
<path d="M 82 352 C 88 318 112 292 150 286" fill="none" stroke="${p.hi}" stroke-width="3.5" opacity="0.55"/>
<path d="M 76 354 C 72 364 64 372 56 376 L 244 376 C 236 372 228 364 224 354 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 80 358 C 78 364 74 369 68 372" fill="none" stroke="${p.hi}" stroke-width="2.5" opacity="0.4"/>
<rect x="118" y="266" width="64" height="20" rx="8" fill="${PLUNGER.ferrule}" stroke="${PLUNGER.ferruleDk}" stroke-width="1.5"/>
<path d="M 122 271 L 178 271" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.55"/>
<path d="M 132 270 L 132 76 Q 132 54 150 54 Q 168 54 168 76 L 168 270 Z" fill="${PLUNGER.wood}" stroke="${PLUNGER.woodDk}" stroke-width="2"/>
<path d="M 138 90 L 138 260 M 150 80 L 150 260 M 162 90 L 162 260" fill="none" stroke="${PLUNGER.woodDk}" stroke-width="1" opacity="0.45"/>
<path d="M 137 84 L 137 262" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.18"/>
<path d="M 104 300 L 122 306 M 196 300 L 178 306" fill="none" stroke="${p.line}" stroke-width="3.5"/>
<circle cx="124" cy="322" r="15" fill="${PLUNGER.eyeWhite}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="128" cy="324" r="6.5" fill="${PLUNGER.pupil}"/>
<circle cx="120" cy="317" r="3.2" fill="#ffffff"/>
<circle cx="176" cy="322" r="15" fill="${PLUNGER.eyeWhite}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="180" cy="324" r="6.5" fill="${PLUNGER.pupil}"/>
<circle cx="172" cy="317" r="3.2" fill="#ffffff"/>
<ellipse cx="150" cy="345" rx="12" ry="9" fill="${PLUNGER.mouth}"/>
<ellipse cx="150" cy="349" rx="7" ry="4" fill="#c2506a"/>
</g>
</svg>`;
  }
  function drawPlunger(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'plunger', color, plungerPalette(color), plungerBodySVG);
  }

  // ── T-Rex skin ─────────────────────────────────────────────────────────────
  // Side-profile, facing right (same convention as the parrot).
  const TREX = {
    belly: 'rgba(255,255,255,0.30)',
    spike: '#e8dfc8', spikeLine: '#a89972', tooth: '#fbf6ea',
    eyeWhite: '#ffffff', pupil: '#171008',
  };
  function trexPalette(base) {
    return { base, hi: shadeHex(base, 0.14), lo: shadeHex(base, -0.22), deep: shadeHex(base, -0.42), line: shadeHex(base, -0.55) };
  }
  // Upright "toy figurine" stance — torso stands roughly vertical with the
  // head held up and forward, NOT leaning/diving forward — a forward-diving
  // neck reads as a bird pecking the ground no matter how the head itself is
  // detailed. Tail and legs are separate overlapping shapes (generous overlap
  // at every join so there's no thin seam), and legs are single tapering
  // curves (no hard-cornered boxes) so they read as limbs, not stovepipes.
  function trexBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gT" x1="90" y1="70" x2="260" y2="290" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 100 366 L 88 375 L 100 377 L 106 368 Z M 106 366 L 108 378 L 116 378 L 112 368 Z M 112 366 L 124 374 L 115 377 L 110 368 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="1"/>
<path d="M 108 296 C 100 315 98 340 102 362 C 103 368 108 370 114 368 C 120 366 122 358 120 340 C 122 320 126 305 128 296 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 108 250 C 70 245 35 255 8 285 C 4 295 8 302 18 300 C 45 292 78 278 105 268 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 110 175 C 100 200 96 230 100 258 C 102 275 108 288 122 296 L 178 296 C 190 288 194 275 194 258 C 196 230 188 200 172 178 C 160 165 140 162 126 165 C 118 167 113 170 110 175 Z" fill="url(#gT)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 118 190 C 122 165 130 145 145 128 C 158 113 172 98 190 85 C 205 74 222 65 242 60 C 258 56 272 56 285 64 C 296 71 302 82 300 95 C 298 104 294 110 288 114 L 228 138 L 284 162 C 270 168 254 170 238 170 C 220 170 206 166 195 178 C 185 188 178 200 172 212 L 145 205 C 135 198 125 194 118 190 Z" fill="url(#gT)" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="148" cy="197" rx="35" ry="21" fill="url(#gT)"/>
<ellipse cx="148" cy="238" rx="19" ry="44" fill="${TREX.belly}" transform="rotate(-8 148 238)"/>
<path d="M 163 112 L 156 96 L 175 104 Z M 193 92 L 187 75 L 206 84 Z M 220 74 L 215 57 L 233 66 Z" fill="${TREX.spike}" stroke="${TREX.spikeLine}" stroke-width="1.2"/>
<path d="M 261 71 L 280 66" fill="none" stroke="${p.line}" stroke-width="3.5"/>
<circle cx="270" cy="80" r="8.5" fill="${TREX.eyeWhite}" stroke="${p.line}" stroke-width="1.2"/>
<circle cx="273" cy="81" r="4.4" fill="${TREX.pupil}"/>
<circle cx="296" cy="88" r="2" fill="${p.line}"/>
<path d="M 282 116 L 272 120 L 279 131 Z M 272 120 L 263 124 L 269 135 Z M 263 124 L 253 128 L 259 139 Z M 253 128 L 244 132 L 250 143 Z" fill="${TREX.tooth}" stroke="${TREX.spikeLine}" stroke-width="1"/>
<path d="M 240 143 L 250 148 L 246 134 Z M 250 148 L 261 152 L 256 138 Z M 261 152 L 271 156 L 266 143 Z" fill="${TREX.tooth}" stroke="${TREX.spikeLine}" stroke-width="1"/>
<path d="M 158 212 C 168 216 174 224 176 234 M 174 228 L 168 238" fill="none" stroke="${p.deep}" stroke-width="6"/>
<path d="M 142 370 L 128 379 L 141 381 L 148 372 Z M 149 370 L 151 382 L 159 382 L 155 372 Z M 156 370 L 169 378 L 159 381 L 154 372 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="1"/>
<path d="M 148 296 C 140 317 138 344 142 366 C 143 372 149 374 156 372 C 163 370 165 361 163 342 C 165 321 170 305 172 296 Z" fill="url(#gT)" stroke="${p.line}" stroke-width="2"/>
</g>
</svg>`;
  }
  function drawTrex(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'trex', color, trexPalette(color), trexBodySVG);
  }

  // ── Vending machine skin ───────────────────────────────────────────────────
  // Player-tinted cabinet; the glass front, snack rows and control panel stay
  // fixed so it always reads as a vending machine rather than a colored box.
  const VEND = {
    glass: '#0e2438', glassLine: '#7f96ad', shelf: '#43596e',
    sign: '#f4f8fb', panel: '#2b333b', panelLine: '#151a1f',
    slot: '#11161b', button: '#9fb0c0', flap: '#1b2430',
    // Snack rows stay multi-colored — that's what sells "vending machine".
    snack: ['#ff5b1f', '#ffd23f', '#4fd1a5', '#ff7ab8', '#7cc4ff', '#c88cff'],
  };
  function vendPalette(base) {
    return { base, hi: shadeHex(base, 0.18), lo: shadeHex(base, -0.26), line: shadeHex(base, -0.52) };
  }
  function vendBodySVG(p) {
    // Four shelves of six snacks each, behind the glass.
    let snacks = '';
    for (let row = 0; row < 4; row++) {
      const y = 156 + row * 40;
      snacks += `<path d="M 84 ${y + 26} L 170 ${y + 26}" fill="none" stroke="${VEND.shelf}" stroke-width="2.5"/>`;
      for (let col = 0; col < 3; col++) {
        const x = 90 + col * 28;
        const c = VEND.snack[(row * 3 + col) % VEND.snack.length];
        snacks += `<rect x="${x}" y="${y}" width="19" height="24" rx="3" fill="${c}" opacity="0.95"/>`;
      }
    }
    // 2x3 keypad.
    let keys = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        keys += `<circle cx="${196 + c * 18}" cy="${158 + r * 20}" r="6" fill="${VEND.button}"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gV" x1="64" y1="0" x2="236" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<rect x="64" y="96" width="172" height="280" rx="14" fill="url(#gV)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 64 130 L 236 130" fill="none" stroke="${p.line}" stroke-width="2"/>
<rect x="82" y="106" width="136" height="17" rx="5" fill="${VEND.sign}" opacity="0.92"/>
<path d="M 94 114 L 128 114 M 136 114 L 164 114 M 172 114 L 206 114" fill="none" stroke="${p.lo}" stroke-width="4"/>
<rect x="78" y="142" width="98" height="174" rx="6" fill="${VEND.glass}" stroke="${VEND.glassLine}" stroke-width="2"/>
${snacks}
<path d="M 92 148 L 116 148 L 96 310 L 82 310 Z" fill="#ffffff" opacity="0.12"/>
<rect x="184" y="142" width="44" height="96" rx="6" fill="${VEND.panel}" stroke="${VEND.panelLine}" stroke-width="1.5"/>
${keys}
<rect x="190" y="250" width="32" height="7" rx="3.5" fill="${VEND.slot}"/>
<rect x="192" y="268" width="28" height="20" rx="3" fill="${VEND.panel}" stroke="${VEND.panelLine}" stroke-width="1.5"/>
<rect x="78" y="322" width="146" height="32" rx="5" fill="${VEND.flap}" stroke="${p.line}" stroke-width="2"/>
<path d="M 90 338 L 212 338" fill="none" stroke="${VEND.glassLine}" stroke-width="2" opacity="0.5"/>
<rect x="64" y="358" width="172" height="18" rx="6" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
</g>
</svg>`;
  }
  function drawVend(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'vending', color, vendPalette(color), vendBodySVG);
  }

  // ── People skin ────────────────────────────────────────────────────────────
  // The only edition whose SHAPE varies per player, not just its color: every
  // flavor color maps to a different little person (see PERSONS). One shared
  // chibi body carries the player's color as the outfit, and each variant adds
  // a costume layer on top, so the twelve read as one cast rather than twelve
  // unrelated sprites. Color is a safe key here because every FLAVORS entry in
  // main.js has a distinct hex.
  const PEOPLE = {
    skin: '#f4c9a2', skinLine: '#c1946b',
    eye: '#20160e', mouth: '#93413f',
    boot: '#39404a', bootLine: '#20252c',
  };
  // Costume layers. Each optional field is a function of the palette so a
  // costume can pick up the player's tint (capes, plastic army men, wizard
  // hats) or stay a fixed prop color (chef's toque, clown nose).
  const PERSONS = {
    '#1f9bff': {                                          // Astronaut
      label: 'astronaut',
      behind: () => `<rect x="90" y="210" width="26" height="64" rx="10" fill="#dfe6ec" stroke="#98a4ae" stroke-width="2"/>`,
      torso: () => `<rect x="130" y="222" width="40" height="28" rx="5" fill="#dfe6ec" stroke="#98a4ae" stroke-width="1.5"/>`
        + `<circle cx="140" cy="236" r="4" fill="#4fd1a5"/><circle cx="152" cy="236" r="4" fill="#ffd23f"/><circle cx="163" cy="236" r="4" fill="#ff5b1f"/>`,
      head: () => `<circle cx="150" cy="138" r="57" fill="none" stroke="#eef3f7" stroke-width="7" opacity="0.9"/>`
        + `<circle cx="150" cy="138" r="57" fill="#cfe0ee" opacity="0.16"/>`
        + `<path d="M 110 124 C 122 104 178 104 190 124 C 190 146 176 158 150 158 C 124 158 110 146 110 124 Z" fill="#123a55" opacity="0.72" stroke="#e6eef5" stroke-width="2.5"/>`
        + `<path d="M 122 118 C 133 108 151 106 164 109" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.55"/>`,
    },
    '#e3263c': {                                          // Pirate
      label: 'pirate',
      torso: () => `<path d="M 112 212 L 190 258 L 190 274 L 112 228 Z" fill="#f4d35e" stroke="#b9982c" stroke-width="1.5"/>`,
      head: () => `<path d="M 94 114 C 102 84 128 68 150 68 C 172 68 198 84 206 114 C 186 104 168 100 150 100 C 132 100 114 104 94 114 Z" fill="#241c16" stroke="#0f0b08" stroke-width="2"/>`
        + `<circle cx="150" cy="88" r="7" fill="#f0ece2"/>`,
      front: () => `<path d="M 108 124 L 192 132" fill="none" stroke="#1a1a1a" stroke-width="3"/>`
        + `<circle cx="166" cy="136" r="12" fill="#1a1a1a"/>`,
    },
    '#8ed11a': {                                          // Plastic army man
      label: 'army man', plastic: true,
      behind: (p) => `<ellipse cx="150" cy="368" rx="62" ry="11" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`,
      head: (p) => `<path d="M 104 130 C 104 100 124 84 150 84 C 176 84 196 100 196 130 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<rect x="96" y="126" width="108" height="11" rx="5.5" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`,
      front: (p) => `<rect x="126" y="224" width="48" height="20" rx="5" fill="${p.lo}" stroke="${p.line}" stroke-width="1.5"/>`
        + `<circle cx="138" cy="234" r="7" fill="${p.line}"/><circle cx="162" cy="234" r="7" fill="${p.line}"/>`,
    },
    '#ff7a00': {                                          // Construction worker
      label: 'builder',
      torso: () => `<path d="M 110 238 L 192 238 M 110 256 L 192 256" fill="none" stroke="#f7f36a" stroke-width="7"/>`,
      head: () => `<path d="M 106 126 C 106 96 126 80 150 80 C 174 80 194 96 194 126 Z" fill="#ffb020" stroke="#c07d0a" stroke-width="2"/>`
        + `<rect x="96" y="122" width="108" height="12" rx="6" fill="#ffb020" stroke="#c07d0a" stroke-width="2"/>`
        + `<path d="M 150 82 L 150 122" fill="none" stroke="#c07d0a" stroke-width="2.5" opacity="0.6"/>`,
    },
    '#8a3ffc': {                                          // Wizard
      label: 'wizard',
      head: (p) => `<path d="M 150 22 C 166 60 182 96 196 124 L 104 124 C 118 96 134 60 150 22 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<ellipse cx="150" cy="124" rx="58" ry="12" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<path d="M 150 54 L 154 64 L 164 64 L 156 71 L 159 82 L 150 75 L 141 82 L 144 71 L 136 64 L 146 64 Z" fill="#ffe27a"/>`,
      front: () => `<path d="M 126 158 C 128 202 140 228 150 238 C 160 228 172 202 174 158 C 166 172 134 172 126 158 Z" fill="#f2f2ee" stroke="#c9c9c4" stroke-width="1.5"/>`
        + `<rect x="206" y="176" width="9" height="200" rx="4" fill="#8a5c37" stroke="#5f3d21" stroke-width="1.5"/>`
        + `<circle cx="210" cy="166" r="15" fill="#8fe3ff" stroke="#4aa8cc" stroke-width="2"/>`,
    },
    '#5fcfe6': {                                          // Scuba diver
      label: 'diver',
      behind: () => `<rect x="92" y="208" width="26" height="66" rx="11" fill="#c9d2d9" stroke="#8b9299" stroke-width="2"/>`,
      head: () => `<rect x="114" y="118" width="72" height="36" rx="13" fill="#9fe8ff" opacity="0.72" stroke="#3f8fae" stroke-width="3"/>`
        + `<path d="M 186 122 C 202 126 204 144 202 162" fill="none" stroke="#ff8a2b" stroke-width="8"/>`,
      // No flippers: on a standing figure they read as a puddle at the feet.
      // The mask, snorkel and tank already make the diver unmistakable.
      front: () => `<rect x="106" y="266" width="88" height="16" rx="4" fill="#2f7f95" stroke="#1d5568" stroke-width="2"/>`
        + `<rect x="140" y="262" width="20" height="24" rx="4" fill="#c9d2d9" stroke="#8b9299" stroke-width="1.5"/>`,
    },
    '#3fae1a': {                                          // Chef
      label: 'chef',
      torso: () => `<path d="M 124 212 L 176 212 L 182 292 L 118 292 Z" fill="#fbfbfa" opacity="0.93" stroke="#cfcfc9" stroke-width="1.5"/>`,
      head: () => `<path d="M 112 122 C 98 122 94 104 106 96 C 100 82 112 70 126 74 C 132 62 168 62 174 74 C 188 70 200 82 194 96 C 206 104 202 122 188 122 Z" fill="#fbfbfa" stroke="#cfcfc9" stroke-width="2"/>`
        + `<rect x="112" y="118" width="76" height="15" rx="5" fill="#f2f2ee" stroke="#cfcfc9" stroke-width="1.5"/>`,
      front: () => `<path d="M 132 156 C 141 149 146 151 150 156 C 154 151 159 149 168 156 C 158 166 142 166 132 156 Z" fill="#3a2a1e"/>`,
    },
    '#ff5b86': {                                          // Ballerina
      label: 'dancer',
      head: () => `<circle cx="150" cy="88" r="19" fill="#5b3a22" stroke="#3a2414" stroke-width="2"/>`
        + `<path d="M 106 138 C 106 106 126 90 150 90 C 174 90 194 106 194 138 C 180 120 120 120 106 138 Z" fill="#5b3a22" stroke="#3a2414" stroke-width="2"/>`,
      front: () => `<path d="M 94 284 C 112 266 188 266 206 284 C 188 302 112 302 94 284 Z" fill="#ffd9ea" opacity="0.95" stroke="#e79ec0" stroke-width="2"/>`,
    },
    '#4f63e0': {                                          // Superhero
      label: 'hero',
      behind: (p) => `<path d="M 114 202 C 78 240 72 312 86 358 C 106 342 118 300 120 260 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<path d="M 186 202 C 222 240 228 312 214 358 C 194 342 182 300 180 260 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`,
      torso: (p) => `<path d="M 150 218 L 166 240 L 150 264 L 134 240 Z" fill="#ffd23f" stroke="${p.line}" stroke-width="1.5"/>`,
      front: (p) => `<path d="M 110 124 L 190 124 L 186 148 L 160 152 L 150 143 L 140 152 L 114 148 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="1.5"/>`
        + `<circle cx="134" cy="136" r="6" fill="#ffffff"/><circle cx="166" cy="136" r="6" fill="#ffffff"/>`,
    },
    '#ffc233': {                                          // Cowboy
      label: 'cowpoke',
      head: () => `<path d="M 118 120 C 118 94 132 82 150 82 C 168 82 182 94 182 120 Z" fill="#a9754a" stroke="#6f4526" stroke-width="2"/>`
        + `<ellipse cx="150" cy="122" rx="68" ry="14" fill="#a9754a" stroke="#6f4526" stroke-width="2"/>`,
      front: () => `<path d="M 126 182 L 174 182 L 168 208 L 132 208 Z" fill="#d94141" stroke="#96282b" stroke-width="1.5"/>`
        + `<circle cx="104" cy="366" r="8" fill="none" stroke="#d8bb61" stroke-width="3"/>`
        + `<circle cx="196" cy="366" r="8" fill="none" stroke="#d8bb61" stroke-width="3"/>`,
    },
    '#c8203a': {                                          // Firefighter
      label: 'firefighter',
      torso: () => `<path d="M 110 240 L 192 240 M 110 258 L 192 258" fill="none" stroke="#ffe9a8" stroke-width="7"/>`,
      head: () => `<path d="M 92 126 C 106 116 194 116 208 126 C 200 138 100 138 92 126 Z" fill="#d3232b" stroke="#8d1216" stroke-width="2"/>`
        + `<path d="M 106 126 C 106 96 126 80 150 80 C 174 80 194 96 194 126 Z" fill="#d3232b" stroke="#8d1216" stroke-width="2"/>`
        + `<path d="M 138 90 L 162 90 L 158 114 L 142 114 Z" fill="#f4d35e" stroke="#a8862a" stroke-width="1.5"/>`,
      front: () => `<rect x="208" y="176" width="9" height="200" rx="4" fill="#8a5c37" stroke="#5f3d21" stroke-width="1.5"/>`
        + `<path d="M 199 146 L 231 148 L 234 174 L 212 176 Z" fill="#c9d2d9" stroke="#8b9299" stroke-width="1.5"/>`,
    },
    '#ff9ecf': {                                          // Clown
      label: 'clown',
      head: () => `<circle cx="108" cy="128" r="25" fill="#ff5b1f"/><circle cx="192" cy="128" r="25" fill="#4fd1a5"/>`
        + `<circle cx="124" cy="100" r="23" fill="#ffd23f"/><circle cx="176" cy="100" r="23" fill="#7cc4ff"/>`
        + `<circle cx="150" cy="90" r="23" fill="#c88cff"/>`,
      front: () => `<circle cx="150" cy="150" r="12" fill="#ff3b30" stroke="#b8231c" stroke-width="1.5"/>`
        + `<ellipse cx="100" cy="366" rx="36" ry="13" fill="#ff3b30" stroke="#b8231c" stroke-width="2"/>`
        + `<ellipse cx="200" cy="366" rx="36" ry="13" fill="#ff3b30" stroke="#b8231c" stroke-width="2"/>`,
    },
  };
  const PERSON_FALLBACK = PERSONS['#1f9bff'];
  function peoplePalette(base) {
    return {
      base,
      hi: shadeHex(base, 0.18), lo: shadeHex(base, -0.26), line: shadeHex(base, -0.52),
      v: PERSONS[String(base).toLowerCase()] || PERSON_FALLBACK,
    };
  }
  function peopleBodySVG(p) {
    const v = p.v;
    const part = (f) => (typeof f === 'function' ? f(p) : '');
    // A plastic figure is molded in one color — no separate skin tone.
    const skin = v.plastic ? p.base : PEOPLE.skin;
    const skinLine = v.plastic ? p.line : PEOPLE.skinLine;
    const ink = v.plastic ? p.line : PEOPLE.eye;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gPe" x1="106" y1="0" x2="194" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
${part(v.behind)}
<rect x="110" y="352" width="40" height="24" rx="9" fill="${v.plastic ? p.lo : PEOPLE.boot}" stroke="${v.plastic ? p.line : PEOPLE.bootLine}" stroke-width="2"/>
<rect x="150" y="352" width="40" height="24" rx="9" fill="${v.plastic ? p.lo : PEOPLE.boot}" stroke="${v.plastic ? p.line : PEOPLE.bootLine}" stroke-width="2"/>
<rect x="120" y="286" width="26" height="72" rx="9" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<rect x="154" y="286" width="26" height="72" rx="9" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<rect x="136" y="172" width="28" height="28" fill="${skin}" stroke="${skinLine}" stroke-width="2"/>
<path d="M 110 210 C 110 197 123 190 150 190 C 177 190 190 197 190 210 L 194 292 L 106 292 Z" fill="url(#gPe)" stroke="${p.line}" stroke-width="2.5"/>
${part(v.torso)}
<rect x="86" y="204" width="24" height="76" rx="12" fill="url(#gPe)" stroke="${p.line}" stroke-width="2" transform="rotate(14 98 204)"/>
<rect x="190" y="204" width="24" height="76" rx="12" fill="url(#gPe)" stroke="${p.line}" stroke-width="2" transform="rotate(-14 202 204)"/>
<circle cx="80" cy="282" r="13" fill="${skin}" stroke="${skinLine}" stroke-width="2"/>
<circle cx="220" cy="282" r="13" fill="${skin}" stroke="${skinLine}" stroke-width="2"/>
<circle cx="150" cy="140" r="46" fill="${skin}" stroke="${skinLine}" stroke-width="2.5"/>
<circle cx="134" cy="136" r="6.5" fill="${ink}"/>
<circle cx="166" cy="136" r="6.5" fill="${ink}"/>
<path d="M 136 158 C 143 168 157 168 164 158" fill="none" stroke="${v.plastic ? p.line : PEOPLE.mouth}" stroke-width="3.5"/>
${part(v.head)}
${part(v.front)}
</g>
</svg>`;
  }
  function drawPeople(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'people', color, peoplePalette(color), peopleBodySVG);
  }

  // ── Trophy skins (bronze / silver / gold tiers) ────────────────────────────
  // All three tiers share ONE metal look on purpose — they are not told apart
  // by color. What differs is the statuette standing on top (a gold miniature
  // of another edition) and the word on the plaque. The player's color shows up
  // only on the plaque band, same as before.
  const TROPHY = {
    goldHi: '#ffe27a', goldMid: '#e8b93f', goldLo: '#9c6a12', goldLine: '#5e3d09',
    baseWood: '#5b3a22', baseWoodLine: '#3a2414', sparkle: '#fff6c8',
    plaqueInk: '#2a1c06',
  };
  // Statuette toppers, each a simplified silhouette of another edition, cast in
  // the same gold as the cup. Authored to sit in y≈18..134, above the cup rim.
  const TROPHY_TOPS = {
    bottle: `<rect x="140" y="18" width="20" height="12" rx="3" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.5"/>`
      + `<path d="M 142 30 L 158 30 L 158 46 C 168 54 172 68 172 84 L 172 126 C 172 131 169 134 163 134 L 137 134 C 131 134 128 131 128 126 L 128 84 C 128 68 132 54 142 46 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.8"/>`
      + `<path d="M 137 92 L 163 92" fill="none" stroke="${TROPHY.goldLine}" stroke-width="1.5" opacity="0.7"/>`,
    parrot: `<path d="M 148 66 C 134 66 124 78 124 94 C 124 108 130 120 140 126 L 136 134 L 168 134 L 162 124 C 172 116 176 102 174 90 C 172 74 160 66 148 66 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.8"/>`
      + `<path d="M 130 118 L 104 134 L 134 130 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.5"/>`
      + `<circle cx="158" cy="58" r="17" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.8"/>`
      + `<path d="M 172 50 L 188 58 L 172 68 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.5"/>`
      + `<circle cx="163" cy="54" r="2.6" fill="${TROPHY.goldLine}"/>`,
    trex: `<path d="M 122 130 C 112 112 116 94 130 86 C 139 80 149 81 155 86 C 161 74 176 66 190 71 C 200 75 203 87 197 95 L 176 101 L 196 110 C 187 114 176 114 168 111 C 160 114 156 122 154 130 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.8"/>`
      + `<path d="M 122 110 L 98 120 L 124 126 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.5"/>`
      + `<path d="M 128 126 L 126 134 L 138 134 L 137 126 Z M 146 127 L 145 134 L 157 134 L 155 127 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="1.3"/>`
      + `<circle cx="186" cy="84" r="2.8" fill="${TROPHY.goldLine}"/>`,
  };
  function trophyPalette(base, figure, plaque) {
    return {
      base, figure, plaque,
      ribbonHi: shadeHex(base, 0.24), ribbonLo: shadeHex(base, -0.24),
    };
  }
  function trophyBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gGold" x1="0" y1="20" x2="0" y2="280" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${TROPHY.goldHi}"/><stop offset="0.55" stop-color="${TROPHY.goldMid}"/><stop offset="1" stop-color="${TROPHY.goldLo}"/>
</linearGradient>
<linearGradient id="gRibbon" x1="110" y1="0" x2="190" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.ribbonHi}"/><stop offset="1" stop-color="${p.ribbonLo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<g transform="translate(150 136) scale(0.78) translate(-150 -136)">${TROPHY_TOPS[p.figure] || TROPHY_TOPS.bottle}</g>
<path d="M 114 148 C 96 154 86 168 90 184 C 94 202 110 212 128 214 L 128 200 C 116 196 106 188 104 176 C 102 166 108 158 118 154 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2"/>
<path d="M 186 148 C 204 154 214 168 210 184 C 206 202 190 212 172 214 L 172 200 C 184 196 194 188 196 176 C 198 166 192 158 182 154 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2"/>
<path d="M 108 138 L 192 138 C 192 184 180 214 150 226 C 120 214 108 184 108 138 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2.5"/>
<path d="M 120 148 L 180 148" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.4"/>
<path d="M 138 226 L 138 258 L 162 258 L 162 226 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2"/>
<path d="M 112 258 L 188 258 L 198 282 L 102 282 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2.5"/>
<rect x="88" y="282" width="124" height="94" rx="6" fill="${TROPHY.baseWood}" stroke="${TROPHY.baseWoodLine}" stroke-width="2.5"/>
<rect x="88" y="282" width="124" height="12" fill="${TROPHY.baseWoodLine}" opacity="0.35"/>
<rect x="102" y="306" width="96" height="34" rx="5" fill="url(#gRibbon)" stroke="${TROPHY.goldLine}" stroke-width="1.5"/>
<text x="150" y="329" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="17" font-weight="bold" fill="${TROPHY.plaqueInk}" opacity="0.85">${p.plaque}</text>
<path d="M 74 158 L 80 170 L 68 166 L 78 178 L 64 174 Z" fill="${TROPHY.sparkle}"/>
<path d="M 224 190 L 230 200 L 220 198 L 228 208 L 216 204 Z" fill="${TROPHY.sparkle}"/>
</g>
</svg>`;
  }
  // Each tier is its own skin id so the sprite cache keeps them separate.
  function drawTrophyTier(ctx, opts, id, figure, plaque) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, id, color, trophyPalette(color, figure, plaque), trophyBodySVG);
  }
  function drawTrophyBronze(ctx, opts) { drawTrophyTier(ctx, opts, 'trophy', 'bottle', 'BRONZE'); }
  function drawTrophySilver(ctx, opts) { drawTrophyTier(ctx, opts, 'trophy_silver', 'parrot', 'SILVER'); }
  function drawTrophyGold(ctx, opts) { drawTrophyTier(ctx, opts, 'trophy_gold', 'trex', 'GOLD'); }

  // ── Registry ────────────────────────────────────────────────────────────────
  // Add a new edition by pushing META + a drawFns entry. `unlock`: null = always
  // available; a number = unlocked once Records.totalWins() reaches it.
  const META = [
    { id: 'bottle', name: 'Bottle', emoji: '🍾', unlock: null },
    {
      id: 'parrot', name: 'Parrot', emoji: '🦜', unlock: 1,
      // Default player names for this skin, aligned BY INDEX to the base
      // engine's FLAVORS array (js/main.js) — so switching skins swaps the
      // auto-filled name without touching which color/flavor is selected.
      // A skin with no `names` just falls back to the flavor name.
      names: [
        'Stormy Beak', 'Captain Squawk', 'Limey Lorikeet', 'Cannonball Cal',
        'Sir Chirpsalot', 'Whisper Wing', 'Barnacle Bill', 'Pegleg Polly',
        'Riptide Rover', 'Doubloon Dave', 'Cherry Corsair', 'Berry Bandit',
      ],
    },
    // Superhero plumber squad — the plunger saves the day, one clog at a time.
    { id: 'plunger', name: 'Plunger', emoji: '🪠', unlock: 3, names: [
      'Captain Plunge', 'Scarlet Sucker', 'Lime Justice', 'Sarge Suction',
      'Grape Avenger', 'Frosty Flush', 'Apple Unclog', 'Kiwi Kaboom',
      'Riptide Ranger', 'Citrus Sarge', 'Cherry Bomb', 'Berry Sidekick',
    ] },
    // B-movie monster cast — kaiju-sized roars, not a science lecture.
    { id: 'trex', name: 'T-Rex', emoji: '🦖', unlock: 5, names: [
      'Rex Rumble', 'Scarlet Chomp', 'Lime Fang', 'Orange Roarke',
      'Grape Gnasher', 'Frosty Claws', 'Apple Stomper', 'Kiwi Rex',
      'Riptide Fang', 'Citrus Chomper', 'Cherry Crusher', 'Berry Bite',
    ] },
    // Snack-machine gremlins — coin slots, stuck springs, vending mishaps.
    { id: 'vending', name: 'Vending Machine', emoji: '🥤', unlock: 7, names: [
      'Chill Vendor', 'Snack Attack', 'Lime Jammer', 'Coin Muncher',
      'Grape Gulper', 'Frosty Fridge', 'Apple Vendo', 'Kiwi Kiosk',
      'Riptide Vend', 'Citrus Coiler', 'Cherry Stuck', 'Berry Buttons',
    ] },
    // One name per figure — this edition's sprite changes with the color, so
    // the names are matched to the PERSONS costume at the same index.
    { id: 'people', name: 'People', emoji: '🧑‍🚀', unlock: 9, names: [
      'Major Blue', 'Captain Scar', 'Sarge Plastic', 'Hard Hat Hank',
      'Wizard Grape', 'Frosty Fins', 'Chef Apple', 'Tutu Kiwi',
      'Captain Tide', 'Citrus Kid', 'Cherry Hose', 'Berry Bozo',
    ] },
    // Three trophy tiers. Kept as id 'trophy' so anyone who already unlocked
    // it at 11 wins keeps it when the silver/gold tiers land above.
    { id: 'trophy', name: 'Bronze Trophy', emoji: '🥉', unlock: 11, names: [
      'Blue Bronze', 'Punch Plaque', 'Lime Laurel', 'Orange Third',
      'Grape Bronze', 'Frosty Finish', 'Apple Podium', 'Kiwi Bronze',
      'Riptide Third', 'Citrus Medal', 'Cherry Bronze', 'Berry Badge',
    ] },
    { id: 'trophy_silver', name: 'Silver Trophy', emoji: '🥈', unlock: 13, names: [
      'Blue Silver', 'Punch Runner', 'Lime Silver', 'Orange Second',
      'Grape Silver', 'Frosty Second', 'Apple Silver', 'Kiwi Runner',
      'Riptide Silver', 'Citrus Second', 'Cherry Silver', 'Berry Runner',
    ] },
    { id: 'trophy_gold', name: 'Gold Trophy', emoji: '🥇', unlock: 15, names: [
      'Blue Champion', 'Punch Podium', 'Lime Legend', 'Orange Ace',
      'Grape Gold', 'Frosty First', 'Apple All-Star', 'Kiwi Kingpin',
      'Riptide Champ', 'Citrus Crown', 'Cherry Champ', 'Berry Best',
    ] },
  ];
  const drawFns = {
    parrot: drawParrot, plunger: drawPlunger, trex: drawTrex,
    vending: drawVend, people: drawPeople,
    trophy: drawTrophyBronze, trophy_silver: drawTrophySilver, trophy_gold: drawTrophyGold,
  };   // 'bottle' is drawn by renderer.js

  return {
    list: () => META.slice(),
    metaFor: (id) => META.find((m) => m.id === id) || null,
    unlockRule: (id) => (META.find((m) => m.id === id) || {}).unlock ?? null,
    namesFor: (id) => (META.find((m) => m.id === id) || {}).names || null,
    hasDraw: (id) => !!drawFns[id],
    draw: (ctx, id, opts) => { const f = drawFns[id]; if (f) f(ctx, opts || {}); },
    onSpriteLoad,
    preload: (colors) => {
      for (const c of colors || []) {
        getParrotSprite(c);
        getSingleSprite('plunger', c, plungerPalette(c), plungerBodySVG);
        getSingleSprite('trex', c, trexPalette(c), trexBodySVG);
        getSingleSprite('vending', c, vendPalette(c), vendBodySVG);
        getSingleSprite('people', c, peoplePalette(c), peopleBodySVG);
        getSingleSprite('trophy', c, trophyPalette(c, 'bottle', 'BRONZE'), trophyBodySVG);
        getSingleSprite('trophy_silver', c, trophyPalette(c, 'parrot', 'SILVER'), trophyBodySVG);
        getSingleSprite('trophy_gold', c, trophyPalette(c, 'trex', 'GOLD'), trophyBodySVG);
      }
    },
  };
})();
