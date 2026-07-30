// cartoon-casts.js — flat cartoony SVG casts for Pets / Garden / Robots /
// Ocean / Snacks / Cryptids. Loaded before skins.js; exposes builders on
// window.FLIP_CARTOON_CASTS that skins.js wires into drawFns + the roster.
(function () {
  function shade(hex, t) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = t >= 0 ? 255 : 0, u = Math.abs(t);
    const rr = Math.round(r + (m - r) * u);
    const gg = Math.round(g + (m - g) * u);
    const bb = Math.round(b + (m - b) * u);
    return '#' + [rr, gg, bb].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  function eyes(cx1, cy1, cx2, cy2, r) {
    r = r || 8;
    return `<circle cx="${cx1}" cy="${cy1}" r="${r}" fill="#fff" stroke="#2a2430" stroke-width="2"/>`
      + `<circle cx="${cx2}" cy="${cy2}" r="${r}" fill="#fff" stroke="#2a2430" stroke-width="2"/>`
      + `<circle cx="${cx1 + 1}" cy="${cy1 + 1}" r="${r * 0.45}" fill="#2a2430"/>`
      + `<circle cx="${cx2 + 1}" cy="${cy2 + 1}" r="${r * 0.45}" fill="#2a2430"/>`
      + `<circle cx="${cx1 - 2}" cy="${cy1 - 2}" r="${r * 0.2}" fill="#fff"/>`
      + `<circle cx="${cx2 - 2}" cy="${cy2 - 2}" r="${r * 0.2}" fill="#fff"/>`;
  }
  function smile(x, y, w) {
    return `<path d="M ${x} ${y} Q ${x + w / 2} ${y + 12} ${x + w} ${y}" fill="none" stroke="#2a2430" stroke-width="3"/>`;
  }
  function wrap(p, art) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gC" x1="90" y1="40" x2="220" y2="360" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">${art}</g></svg>`;
  }

  // ── Pets ───────────────────────────────────────────────────────────────────
  const PET_CAST = {
    '#1f9bff': { label: 'cat', draw: (p) => `
<ellipse cx="150" cy="300" rx="70" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="180" r="62" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 140 L 88 78 L 128 118 Z M 200 140 L 212 78 L 172 118 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
${eyes(128, 172, 172, 172, 9)}
<path d="M 150 188 L 142 200 L 158 200 Z" fill="#ff9ecf"/>
${smile(132, 208, 36)}
<path d="M 80 250 Q 40 230 50 200 M 220 250 Q 260 230 250 200" fill="none" stroke="${p.lo}" stroke-width="8"/>
<path d="M 200 320 Q 250 280 260 220" fill="none" stroke="${p.base}" stroke-width="14"/>` },
    '#e3263c': { label: 'dog', draw: (p) => `
<ellipse cx="150" cy="300" rx="72" ry="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="178" r="64" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="88" cy="190" rx="22" ry="34" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="212" cy="190" rx="22" ry="34" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eyes(128, 170, 172, 170, 9)}
<ellipse cx="150" cy="198" rx="16" ry="12" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${smile(130, 212, 40)}
<path d="M 70 280 Q 40 300 55 340 M 230 280 Q 260 300 245 340" fill="none" stroke="${p.lo}" stroke-width="10"/>
<path d="M 210 310 Q 255 290 270 250" fill="none" stroke="${p.base}" stroke-width="12"/>` },
    '#8ed11a': { label: 'rabbit', draw: (p) => `
<ellipse cx="150" cy="310" rx="60" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="200" r="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="120" cy="100" rx="16" ry="55" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="180" cy="100" rx="16" ry="55" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="120" cy="105" rx="8" ry="35" fill="#ff9ecf" opacity="0.7"/>
<ellipse cx="180" cy="105" rx="8" ry="35" fill="#ff9ecf" opacity="0.7"/>
${eyes(130, 192, 170, 192, 8)}
${smile(134, 220, 32)}
<path d="M 200 300 Q 240 270 250 230" fill="none" stroke="${p.base}" stroke-width="10"/>` },
    '#ff7a00': { label: 'fish', draw: (p) => `
<ellipse cx="150" cy="220" rx="90" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 60 220 L 20 170 L 20 270 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 165 L 150 120 L 175 165 Z M 150 275 L 150 320 L 175 275 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eyes(175, 210, 175, 210, 0)}
<circle cx="185" cy="210" r="12" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="188" cy="212" r="5" fill="#2a2430"/>
<path d="M 200 230 Q 220 240 200 248" fill="none" stroke="#2a2430" stroke-width="3"/>
<path d="M 110 200 Q 150 185 190 200" fill="none" stroke="${p.hi}" stroke-width="4" opacity="0.5"/>` },
    '#8a3ffc': { label: 'hamster', draw: (p) => `
<ellipse cx="150" cy="280" rx="75" ry="65" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="190" r="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="100" cy="175" r="18" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<circle cx="200" cy="175" r="18" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${eyes(130, 185, 170, 185, 8)}
<ellipse cx="150" cy="210" rx="10" ry="8" fill="#ff9ecf"/>
${smile(132, 220, 36)}
<path d="M 90 300 L 70 340 M 210 300 L 230 340" fill="none" stroke="${p.lo}" stroke-width="10"/>` },
    '#5fcfe6': { label: 'bird', draw: (p) => `
<ellipse cx="150" cy="260" rx="55" ry="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="160" r="48" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 240 Q 40 200 70 160 Q 110 200 115 230 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 200 240 Q 260 200 230 160 Q 190 200 185 230 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
${eyes(135, 155, 165, 155, 7)}
<path d="M 150 175 L 135 195 L 165 195 Z" fill="#ffc233" stroke="#2a2430" stroke-width="2"/>
<path d="M 130 330 L 120 360 M 170 330 L 180 360" fill="none" stroke="${p.lo}" stroke-width="8"/>` },
    '#3fae1a': { label: 'turtle', draw: (p) => `
<ellipse cx="150" cy="250" rx="95" ry="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[0,1,2].map((r) => [0,1,2].map((c) =>
  `<ellipse cx="${110 + c * 40}" cy="${220 + r * 28}" rx="16" ry="12" fill="${p.hi}" stroke="${p.line}" stroke-width="1.5" opacity="0.85"/>`
).join('')).join('')}
<circle cx="150" cy="145" r="40" fill="${p.base}" stroke="${p.line}" stroke-width="3"/>
${eyes(135, 140, 165, 140, 7)}
${smile(136, 160, 28)}
<path d="M 70 250 L 40 240 M 230 250 L 260 240 M 90 310 L 70 340 M 210 310 L 230 340" fill="none" stroke="${p.lo}" stroke-width="10"/>` },
    '#ff5b86': { label: 'pig', draw: (p) => `
<ellipse cx="150" cy="290" rx="78" ry="62" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="180" r="68" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="100" cy="130" rx="14" ry="22" fill="#ff9ecf" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="200" cy="130" rx="14" ry="22" fill="#ff9ecf" stroke="${p.line}" stroke-width="2"/>
${eyes(128, 170, 172, 170, 9)}
<ellipse cx="150" cy="205" rx="28" ry="20" fill="#ff9ecf" stroke="${p.line}" stroke-width="2"/>
<circle cx="138" cy="205" r="5" fill="${p.line}"/><circle cx="162" cy="205" r="5" fill="${p.line}"/>
<path d="M 90 310 L 75 350 M 210 310 L 225 350" fill="none" stroke="${p.lo}" stroke-width="12"/>
<path d="M 210 300 Q 250 280 255 240" fill="none" stroke="${p.base}" stroke-width="10"/>` },
    '#4f63e0': { label: 'ferret', draw: (p) => `
<ellipse cx="150" cy="300" rx="45" ry="40" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 300 Q 90 240 100 170 Q 150 120 200 170 Q 210 240 150 300 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="155" rx="42" ry="38" fill="${p.base}" stroke="${p.line}" stroke-width="2.5"/>
${eyes(135, 150, 165, 150, 7)}
${smile(136, 172, 28)}
<path d="M 200 280 Q 260 260 270 200 Q 250 180 230 220" fill="none" stroke="${p.hi}" stroke-width="16"/>` },
    '#ffc233': { label: 'corgi', draw: (p) => `
<ellipse cx="150" cy="300" rx="80" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="200" r="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 170 L 70 110 L 120 150 Z M 200 170 L 230 110 L 180 150 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
${eyes(130, 195, 170, 195, 8)}
<ellipse cx="150" cy="220" rx="14" ry="10" fill="${p.lo}"/>
${smile(132, 230, 36)}
<path d="M 95 330 L 90 360 M 130 335 L 128 360 M 170 335 L 172 360 M 205 330 L 210 360" fill="none" stroke="${p.lo}" stroke-width="10"/>
<path d="M 220 290 Q 255 270 250 230" fill="none" stroke="${p.base}" stroke-width="10"/>` },
    '#c8203a': { label: 'bowtie-cat', draw: (p) => `
<ellipse cx="150" cy="300" rx="68" ry="52" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="185" r="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 105 145 L 95 85 L 130 125 Z M 195 145 L 205 85 L 170 125 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
${eyes(130, 178, 170, 178, 8)}
${smile(134, 205, 32)}
<path d="M 150 240 L 120 255 L 150 248 L 180 255 Z" fill="#ffc233" stroke="#2a2430" stroke-width="2"/>
<circle cx="150" cy="248" r="6" fill="#fff"/>
<path d="M 210 300 Q 250 250 245 200" fill="none" stroke="${p.base}" stroke-width="12"/>` },
    '#ff9ecf': { label: 'goldfish', draw: (p) => `
<ellipse cx="150" cy="220" rx="85" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 65 220 L 25 175 L 30 265 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 170 Q 130 130 160 140 Q 170 170 150 170 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<circle cx="185" cy="210" r="14" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="188" cy="212" r="6" fill="#2a2430"/>
<path d="M 200 228 Q 218 236 200 244" fill="none" stroke="#2a2430" stroke-width="3"/>
<path d="M 120 200 Q 150 188 180 200" fill="none" stroke="#fff" stroke-width="3" opacity="0.45"/>` },
  };

  // ── Garden ─────────────────────────────────────────────────────────────────
  const GARDEN_CAST = {
    '#1f9bff': { label: 'sunflower', draw: (p) => `
<rect x="140" y="220" width="20" height="140" rx="8" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
${[0,1,2,3,4,5,6,7].map((i) => {
  const a = (i / 8) * Math.PI * 2;
  const x = 150 + Math.cos(a) * 70, y = 170 + Math.sin(a) * 70;
  return `<ellipse cx="${x}" cy="${y}" rx="22" ry="14" transform="rotate(${(a * 180) / Math.PI} ${x} ${y})" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>`;
}).join('')}
<circle cx="150" cy="170" r="40" fill="#5b3a22" stroke="#2a2430" stroke-width="3"/>
${eyes(138, 165, 162, 165, 7)}
${smile(138, 185, 24)}` },
    '#e3263c': { label: 'tomato', draw: (p) => `
<ellipse cx="150" cy="240" rx="85" ry="80" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 120 170 Q 150 140 180 170" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
<path d="M 150 155 L 150 120" fill="none" stroke="#3fae1a" stroke-width="8"/>
${eyes(125, 230, 175, 230, 10)}
${smile(130, 265, 40)}` },
    '#8ed11a': { label: 'mushroom', draw: (p) => `
<path d="M 70 200 Q 70 110 150 100 Q 230 110 230 200 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="110" cy="160" rx="14" ry="10" fill="#fff" opacity="0.85"/>
<ellipse cx="170" cy="145" rx="18" ry="12" fill="#fff" opacity="0.75"/>
<ellipse cx="190" cy="175" rx="10" ry="8" fill="#fff" opacity="0.7"/>
<rect x="115" y="200" width="70" height="130" rx="20" fill="#f5e6c8" stroke="#2a2430" stroke-width="3"/>
${eyes(132, 250, 168, 250, 8)}
${smile(136, 280, 28)}` },
    '#ff7a00': { label: 'cactus', draw: (p) => `
<rect x="125" y="160" width="50" height="190" rx="25" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 125 230 Q 70 220 70 270 Q 70 300 110 295" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 175 210 Q 230 200 230 250 Q 230 280 190 275" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[180,220,260,300].map((y) => `<path d="M 135 ${y} L 145 ${y - 8} M 165 ${y} L 155 ${y - 8}" fill="none" stroke="${p.hi}" stroke-width="2"/>`).join('')}
${eyes(138, 200, 162, 200, 7)}
${smile(140, 225, 20)}` },
    '#8a3ffc': { label: 'carrot', draw: (p) => `
<path d="M 150 120 L 95 340 L 205 340 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 120 340 L 110 360 M 150 340 L 150 365 M 180 340 L 190 360" fill="none" stroke="#3fae1a" stroke-width="8"/>
${eyes(135, 220, 165, 220, 8)}
${smile(138, 250, 24)}
<path d="M 120 180 L 180 200 M 115 250 L 185 270" fill="none" stroke="${p.hi}" stroke-width="3" opacity="0.5"/>` },
    '#5fcfe6': { label: 'strawberry', draw: (p) => `
<path d="M 150 140 Q 230 180 220 280 Q 150 360 80 280 Q 70 180 150 140 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 120 150 L 100 110 L 130 130 M 150 145 L 150 100 L 165 130 M 180 150 L 200 110 L 170 130" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
${[0,1,2,3,4].map((i) => `<ellipse cx="${110 + (i % 3) * 40}" cy="${200 + Math.floor(i / 3) * 45}" rx="5" ry="7" fill="#ffc233"/>`).join('')}
${eyes(130, 230, 170, 230, 9)}
${smile(135, 265, 30)}` },
    '#3fae1a': { label: 'broccoli', draw: (p) => `
<rect x="130" y="240" width="40" height="110" rx="12" fill="#c4a574" stroke="#2a2430" stroke-width="2"/>
<circle cx="110" cy="200" r="45" fill="url(#gC)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="190" cy="200" r="45" fill="url(#gC)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="150" cy="160" r="50" fill="url(#gC)" stroke="${p.line}" stroke-width="2.5"/>
${eyes(135, 165, 165, 165, 8)}
${smile(138, 190, 24)}` },
    '#ff5b86': { label: 'pumpkin', draw: (p) => `
<ellipse cx="150" cy="250" rx="100" ry="85" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 90 250 Q 150 180 210 250 M 90 250 Q 150 320 210 250" fill="none" stroke="${p.lo}" stroke-width="3"/>
<path d="M 150 165 L 150 120" fill="none" stroke="#3fae1a" stroke-width="10"/>
<path d="M 150 130 Q 180 110 175 145" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
${eyes(120, 240, 180, 240, 11)}
${smile(125, 280, 50)}` },
    '#4f63e0': { label: 'rose', draw: (p) => `
<rect x="142" y="230" width="16" height="130" rx="6" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
<path d="M 142 280 Q 100 260 110 230 Q 140 250 142 260 M 158 300 Q 200 280 195 250 Q 160 270 158 285" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
<circle cx="150" cy="170" r="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 170 Q 120 140 150 120 Q 180 140 150 170 Q 120 200 150 220 Q 180 200 150 170" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${eyes(135, 165, 165, 165, 7)}
${smile(138, 188, 24)}` },
    '#ffc233': { label: 'corn', draw: (p) => `
<ellipse cx="150" cy="240" rx="50" ry="110" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[0,1,2,3,4,5].map((r) => [0,1].map((c) =>
  `<ellipse cx="${130 + c * 40}" cy="${160 + r * 30}" rx="14" ry="12" fill="${p.hi}" stroke="${p.line}" stroke-width="1.2"/>`
).join('')).join('')}
<path d="M 100 180 Q 60 220 90 300 M 200 180 Q 240 220 210 300" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
${eyes(135, 200, 165, 200, 8)}
${smile(138, 230, 24)}` },
    '#c8203a': { label: 'avocado', draw: (p) => `
<path d="M 150 120 Q 230 160 220 280 Q 150 370 80 280 Q 70 160 150 120 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="250" r="40" fill="#5b3a22" stroke="#2a2430" stroke-width="3"/>
<circle cx="150" cy="250" r="18" fill="#c4a574"/>
${eyes(125, 180, 175, 180, 9)}
${smile(130, 210, 40)}` },
    '#ff9ecf': { label: 'chili', draw: (p) => `
<path d="M 160 140 Q 230 200 200 320 Q 150 370 100 300 Q 90 200 140 150 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 155 140 Q 150 100 170 90 Q 185 120 160 145" fill="#3fae1a" stroke="#2a6b12" stroke-width="2"/>
${eyes(140, 220, 175, 230, 8)}
${smile(145, 260, 30)}` },
  };

  // ── Robots ─────────────────────────────────────────────────────────────────
  const ROBOT_CAST = {
    '#1f9bff': { label: 'toaster', draw: (p) => `
<rect x="70" y="180" width="160" height="140" rx="18" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="95" y="150" width="40" height="40" rx="6" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<rect x="165" y="150" width="40" height="40" rx="6" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eyes(115, 230, 185, 230, 12)}
${smile(125, 270, 50)}
<path d="M 220 200 L 250 180 L 250 220 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<circle cx="100" cy="330" r="12" fill="${p.lo}"/><circle cx="200" cy="330" r="12" fill="${p.lo}"/>` },
    '#e3263c': { label: 'vacuum', draw: (p) => `
<ellipse cx="150" cy="300" rx="90" ry="45" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="110" y="160" width="80" height="140" rx="20" fill="${p.base}" stroke="${p.line}" stroke-width="3"/>
${eyes(130, 210, 170, 210, 10)}
${smile(135, 245, 30)}
<path d="M 190 200 Q 250 160 260 100" fill="none" stroke="${p.lo}" stroke-width="14"/>
<circle cx="260" cy="90" r="18" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>` },
    '#8ed11a': { label: 'boombox', draw: (p) => `
<rect x="55" y="180" width="190" height="120" rx="16" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="100" cy="240" r="32" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<circle cx="200" cy="240" r="32" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<circle cx="100" cy="240" r="12" fill="${p.hi}"/><circle cx="200" cy="240" r="12" fill="${p.hi}"/>
${eyes(140, 210, 160, 210, 6)}
${smile(138, 250, 24)}
<path d="M 90 180 L 90 150 L 210 150 L 210 180" fill="none" stroke="${p.line}" stroke-width="6"/>` },
    '#ff7a00': { label: 'tin-can', draw: (p) => `
<rect x="95" y="140" width="110" height="200" rx="20" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="140" rx="55" ry="18" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="150" cy="340" rx="55" ry="18" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eyes(130, 220, 170, 220, 10)}
${smile(135, 260, 30)}
<path d="M 110 180 L 190 180" fill="none" stroke="${p.hi}" stroke-width="4" opacity="0.5"/>` },
    '#8a3ffc': { label: 'washer', draw: (p) => `
<rect x="75" y="120" width="150" height="220" rx="18" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="230" r="55" fill="#9ad7ef" stroke="${p.line}" stroke-width="4"/>
<circle cx="150" cy="230" r="35" fill="#fff" opacity="0.35"/>
${eyes(125, 160, 175, 160, 8)}
${smile(130, 300, 40)}
<circle cx="200" cy="145" r="8" fill="#ffc233"/>` },
    '#5fcfe6': { label: 'blender', draw: (p) => `
<rect x="100" y="250" width="100" height="90" rx="12" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 110 250 L 120 130 L 180 130 L 190 250 Z" fill="#9ad7ef" stroke="${p.line}" stroke-width="3" opacity="0.85"/>
<ellipse cx="150" cy="130" rx="35" ry="12" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
${eyes(135, 180, 165, 180, 8)}
${smile(138, 210, 24)}
<path d="M 130 200 L 170 200 M 140 220 L 160 220" fill="none" stroke="${p.base}" stroke-width="3"/>` },
    '#3fae1a': { label: 'tv', draw: (p) => `
<rect x="60" y="140" width="180" height="140" rx="14" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="80" y="160" width="140" height="90" rx="8" fill="#9ad7ef" stroke="${p.line}" stroke-width="2"/>
${eyes(120, 195, 180, 195, 12)}
${smile(125, 230, 50)}
<path d="M 100 280 L 80 330 M 200 280 L 220 330" fill="none" stroke="${p.lo}" stroke-width="8"/>
<path d="M 120 140 L 110 100 M 180 140 L 190 100" fill="none" stroke="${p.line}" stroke-width="4"/>
<circle cx="110" cy="95" r="8" fill="${p.hi}"/><circle cx="190" cy="95" r="8" fill="${p.hi}"/>` },
    '#ff5b86': { label: 'calculator', draw: (p) => `
<rect x="90" y="110" width="120" height="220" rx="16" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="105" y="130" width="90" height="40" rx="8" fill="#9ad7ef" stroke="${p.line}" stroke-width="2"/>
${[0,1,2,3].map((r) => [0,1,2].map((c) =>
  `<rect x="${110 + c * 28}" y="${190 + r * 30}" width="22" height="22" rx="4" fill="${p.hi}" stroke="${p.line}" stroke-width="1.5"/>`
).join('')).join('')}
${eyes(125, 145, 175, 145, 7)}` },
    '#4f63e0': { label: 'drone', draw: (p) => `
<ellipse cx="150" cy="230" rx="55" ry="35" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(135, 225, 165, 225, 8)}
${[[70,170],[230,170],[70,290],[230,290]].map(([x,y]) =>
  `<line x1="150" y1="230" x2="${x}" y2="${y}" stroke="${p.lo}" stroke-width="6"/>`
  + `<circle cx="${x}" cy="${y}" r="22" fill="none" stroke="${p.hi}" stroke-width="5"/>`
).join('')}
<path d="M 150 265 L 140 300 L 160 300 Z" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>` },
    '#ffc233': { label: 'alarm', draw: (p) => `
<circle cx="150" cy="230" r="85" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="230" r="60" fill="#fff" opacity="0.2"/>
${eyes(125, 215, 175, 215, 10)}
${smile(130, 255, 40)}
<path d="M 150 170 L 150 230 L 185 250" fill="none" stroke="#2a2430" stroke-width="5"/>
<path d="M 90 160 L 70 120 M 210 160 L 230 120" fill="none" stroke="${p.lo}" stroke-width="8"/>
<circle cx="70" cy="115" r="14" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<circle cx="230" cy="115" r="14" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<path d="M 130 315 L 120 350 M 170 315 L 180 350" fill="none" stroke="${p.lo}" stroke-width="8"/>` },
    '#c8203a': { label: 'microwave', draw: (p) => `
<rect x="55" y="150" width="190" height="150" rx="14" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="75" y="170" width="110" height="110" rx="8" fill="#1a2430" stroke="${p.line}" stroke-width="2"/>
${eyes(100, 210, 150, 210, 10)}
${smile(105, 245, 40)}
<rect x="200" y="175" width="30" height="100" rx="6" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${[0,1,2].map((i) => `<circle cx="215" cy="${195 + i * 28}" r="8" fill="${p.hi}"/>`).join('')}
<path d="M 90 310 L 80 340 M 210 310 L 220 340" fill="none" stroke="${p.lo}" stroke-width="8"/>` },
    '#ff9ecf': { label: 'lamp', draw: (p) => `
<path d="M 90 200 L 150 80 L 210 200 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="140" y="200" width="20" height="110" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="150" cy="320" rx="55" ry="16" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>
${eyes(130, 160, 170, 160, 8)}
${smile(135, 185, 30)}
<path d="M 150 100 L 150 70" fill="none" stroke="#ffc233" stroke-width="4"/>
<circle cx="150" cy="60" r="12" fill="#ffc233"/>` },
  };

  // ── Ocean ──────────────────────────────────────────────────────────────────
  const OCEAN_CAST = {
    '#1f9bff': { label: 'whale', draw: (p) => `
<ellipse cx="150" cy="230" rx="110" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 40 230 L 10 190 L 15 270 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 170 L 140 130 L 170 160 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eyes(190, 215, 190, 215, 0)}
<circle cx="195" cy="215" r="12" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="198" cy="217" r="5" fill="#2a2430"/>
<path d="M 210 240 Q 230 250 210 258" fill="none" stroke="#2a2430" stroke-width="3"/>
<path d="M 100 250 Q 150 270 200 250" fill="none" stroke="${p.hi}" stroke-width="4" opacity="0.4"/>` },
    '#e3263c': { label: 'dolphin', draw: (p) => `
<ellipse cx="160" cy="230" rx="95" ry="45" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 70 230 L 30 195 L 35 265 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 185 L 145 145 L 175 175 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<circle cx="210" cy="220" r="11" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="213" cy="222" r="5" fill="#2a2430"/>
<path d="M 220 238 Q 245 245 225 255" fill="none" stroke="#2a2430" stroke-width="3"/>
<path d="M 180 270 Q 200 310 170 300" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>` },
    '#8ed11a': { label: 'shark', draw: (p) => `
<ellipse cx="155" cy="230" rx="100" ry="48" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 55 230 L 15 200 L 20 260 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 182 L 150 130 L 175 182 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<circle cx="210" cy="220" r="10" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="213" cy="222" r="4" fill="#2a2430"/>
<path d="M 220 240 L 255 250 L 220 255 Z" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<path d="M 120 255 L 200 255" fill="none" stroke="${p.hi}" stroke-width="3" opacity="0.4"/>` },
    '#ff7a00': { label: 'octopus', draw: (p) => `
<circle cx="150" cy="180" r="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(125, 170, 175, 170, 12)}
${smile(130, 205, 40)}
${[[90,250],[120,270],[150,280],[180,270],[210,250],[75,220],[225,220],[150,300]].map(([x,y],i) =>
  `<path d="M ${140 + (i % 3) * 10} 230 Q ${x} ${y - 20} ${x} ${y}" fill="none" stroke="${p.base}" stroke-width="12"/>`
  + `<circle cx="${x}" cy="${y}" r="10" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>`
).join('')}` },
    '#8a3ffc': { label: 'crab', draw: (p) => `
<ellipse cx="150" cy="240" rx="80" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(125, 220, 175, 220, 10)}
${smile(130, 255, 40)}
<path d="M 80 220 Q 30 180 40 140 Q 70 160 90 200 M 220 220 Q 270 180 260 140 Q 230 160 210 200" fill="none" stroke="${p.hi}" stroke-width="10"/>
<path d="M 40 140 L 20 120 M 40 140 L 25 145 M 260 140 L 280 120 M 260 140 L 275 145" fill="none" stroke="${p.lo}" stroke-width="6"/>
${[100,130,170,200].map((x) => `<path d="M ${x} 290 L ${x - 5} 340" fill="none" stroke="${p.lo}" stroke-width="8"/>`).join('')}` },
    '#5fcfe6': { label: 'seahorse', draw: (p) => `
<path d="M 160 120 Q 220 160 200 220 Q 160 260 170 320 Q 140 360 120 330 Q 150 300 140 250 Q 120 200 150 160 Q 130 130 160 120 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(175, 155, 175, 155, 0)}
<circle cx="180" cy="155" r="9" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="182" cy="157" r="4" fill="#2a2430"/>
<path d="M 195 175 Q 210 185 195 195" fill="none" stroke="#2a2430" stroke-width="2.5"/>
<path d="M 155 200 L 130 190 M 160 230 L 135 225 M 165 260 L 140 260" fill="none" stroke="${p.hi}" stroke-width="4"/>` },
    '#3fae1a': { label: 'fishy', draw: (p) => `
<ellipse cx="150" cy="230" rx="90" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 60 230 L 20 185 L 25 275 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 180 L 135 145 L 170 175 Z M 150 280 L 135 315 L 170 275 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<circle cx="190" cy="220" r="12" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="193" cy="222" r="5" fill="#2a2430"/>
${smile(195, 240, 20)}` },
    '#ff5b86': { label: 'clam', draw: (p) => `
<path d="M 60 240 Q 150 120 240 240 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 60 240 Q 150 340 240 240 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="3"/>
${eyes(120, 210, 180, 210, 10)}
${smile(130, 245, 40)}
<path d="M 90 240 L 210 240" fill="none" stroke="${p.lo}" stroke-width="3"/>` },
    '#4f63e0': { label: 'lobster', draw: (p) => `
<ellipse cx="150" cy="240" rx="45" ry="90" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(135, 180, 165, 180, 8)}
${smile(138, 205, 24)}
<path d="M 110 200 Q 40 160 50 120 Q 80 140 115 185 M 190 200 Q 260 160 250 120 Q 220 140 185 185" fill="none" stroke="${p.hi}" stroke-width="12"/>
<path d="M 50 120 L 30 100 M 50 120 L 35 125 M 250 120 L 270 100 M 250 120 L 265 125" fill="none" stroke="${p.lo}" stroke-width="6"/>
${[0,1,2,3].map((i) => `<path d="M 120 ${260 + i * 20} L 90 ${280 + i * 22} M 180 ${260 + i * 20} L 210 ${280 + i * 22}" fill="none" stroke="${p.lo}" stroke-width="6"/>`).join('')}
<path d="M 150 330 Q 130 360 150 370 Q 170 360 150 330" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>` },
    '#ffc233': { label: 'starfish', draw: (p) => `
<path d="M 150 100 L 170 180 L 250 180 L 185 230 L 210 320 L 150 270 L 90 320 L 115 230 L 50 180 L 130 180 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(130, 200, 170, 200, 9)}
${smile(135, 230, 30)}` },
    '#c8203a': { label: 'jellyfish', draw: (p) => `
<path d="M 80 160 Q 80 100 150 95 Q 220 100 220 160 Q 220 200 150 210 Q 80 200 80 160 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(125, 150, 175, 150, 9)}
${smile(130, 175, 40)}
${[100,125,150,175,200].map((x,i) =>
  `<path d="M ${x} 210 Q ${x + (i % 2 ? 15 : -15)} ${260 + i * 10} ${x} ${320 + i * 8}" fill="none" stroke="${p.hi}" stroke-width="6" opacity="0.85"/>`
).join('')}` },
    '#ff9ecf': { label: 'narwhal', draw: (p) => `
<ellipse cx="150" cy="240" rx="95" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 55 240 L 20 205 L 25 275 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 220 200 L 270 120" fill="none" stroke="#e8eef5" stroke-width="10"/>
<path d="M 220 200 L 270 120" fill="none" stroke="${p.line}" stroke-width="2"/>
<circle cx="195" cy="225" r="11" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<circle cx="198" cy="227" r="5" fill="#2a2430"/>
${smile(200, 245, 25)}` },
  };

  // ── Snacks ─────────────────────────────────────────────────────────────────
  const SNACK_CAST = {
    '#1f9bff': { label: 'donut', draw: (p) => `
<circle cx="150" cy="220" r="95" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="220" r="40" fill="#0b1a2b" stroke="${p.line}" stroke-width="3"/>
<path d="M 70 180 Q 150 140 230 180 Q 200 160 150 155 Q 100 160 70 180" fill="#ff9ecf" opacity="0.9"/>
${[0,1,2,3,4,5,6,7].map((i) => {
  const a = (i / 8) * Math.PI * 2;
  return `<circle cx="${150 + Math.cos(a) * 70}" cy="${220 + Math.sin(a) * 70}" r="6" fill="${['#ffc233','#8ed11a','#e3263c','#1f9bff'][i % 4]}"/>`;
}).join('')}
${eyes(120, 200, 180, 200, 10)}
${smile(125, 245, 50)}` },
    '#e3263c': { label: 'taco', draw: (p) => `
<path d="M 60 280 Q 60 140 150 130 Q 240 140 240 280 Z" fill="#ffc233" stroke="#2a2430" stroke-width="3"/>
<path d="M 75 270 Q 150 200 225 270" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
<path d="M 100 240 L 120 200 L 140 240 M 160 235 L 180 195 L 200 235" fill="#3fae1a" stroke="#2a6b12" stroke-width="1.5"/>
${eyes(120, 210, 180, 210, 9)}
${smile(130, 245, 40)}` },
    '#8ed11a': { label: 'pretzel', draw: (p) => `
<path d="M 90 280 Q 60 180 120 140 Q 150 120 180 140 Q 240 180 210 280 Q 190 320 150 300 Q 110 320 90 280 M 120 200 Q 150 240 180 200" fill="none" stroke="url(#gC)" stroke-width="28"/>
<path d="M 90 280 Q 60 180 120 140 Q 150 120 180 140 Q 240 180 210 280 Q 190 320 150 300 Q 110 320 90 280 M 120 200 Q 150 240 180 200" fill="none" stroke="${p.line}" stroke-width="3"/>
${[110,150,190,130,170].map((x,i) => `<circle cx="${x}" cy="${180 + (i % 3) * 40}" r="4" fill="#fff" opacity="0.7"/>`).join('')}
${eyes(125, 200, 175, 200, 8)}
${smile(135, 240, 30)}` },
    '#ff7a00': { label: 'juice', draw: (p) => `
<path d="M 100 160 L 110 340 L 190 340 L 200 160 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 160 L 200 160 L 190 130 L 110 130 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<rect x="140" y="100" width="20" height="35" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eyes(130, 220, 170, 220, 9)}
${smile(135, 260, 30)}
<path d="M 120 180 L 180 180" fill="none" stroke="#fff" stroke-width="4" opacity="0.35"/>` },
    '#8a3ffc': { label: 'pizza', draw: (p) => `
<path d="M 150 120 L 250 320 L 50 320 Z" fill="#ffc233" stroke="#2a2430" stroke-width="3"/>
<path d="M 150 145 L 230 305 L 70 305 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
${[[130,200],[170,220],[120,260],[160,270],[150,240]].map(([x,y]) =>
  `<circle cx="${x}" cy="${y}" r="12" fill="#e3263c" stroke="#2a2430" stroke-width="1.5"/>`
).join('')}
${eyes(130, 230, 170, 245, 8)}
${smile(135, 275, 30)}` },
    '#5fcfe6': { label: 'cookie', draw: (p) => `
<circle cx="150" cy="220" r="95" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[[110,180],[180,170],[150,220],[120,260],[190,250],[160,280],[100,220]].map(([x,y]) =>
  `<circle cx="${x}" cy="${y}" r="10" fill="#5b3a22"/>`
).join('')}
${eyes(120, 200, 180, 200, 11)}
${smile(125, 245, 50)}` },
    '#3fae1a': { label: 'icecream', draw: (p) => `
<path d="M 100 240 L 150 360 L 200 240 Z" fill="#e8b892" stroke="#2a2430" stroke-width="3"/>
<circle cx="150" cy="190" r="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="120" cy="150" r="35" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<circle cx="180" cy="155" r="32" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eyes(130, 185, 170, 185, 9)}
${smile(135, 215, 30)}
<path d="M 150 120 L 150 90" fill="none" stroke="#ff9ecf" stroke-width="6"/>
<circle cx="150" cy="85" r="8" fill="#ff9ecf"/>` },
    '#ff5b86': { label: 'popcorn', draw: (p) => `
<path d="M 90 200 L 80 340 L 220 340 L 210 200 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[0,1,2,3].map((i) => `<path d="M 90 ${220 + i * 30} L 210 ${220 + i * 30}" fill="none" stroke="#fff" stroke-width="8" opacity="${i % 2 ? 0.35 : 0}"/>`).join('')}
${[[110,160],[150,140],[190,165],[130,180],[170,175]].map(([x,y]) =>
  `<circle cx="${x}" cy="${y}" r="22" fill="#ffc233" stroke="#2a2430" stroke-width="2"/>`
).join('')}
${eyes(125, 250, 175, 250, 9)}
${smile(130, 285, 40)}` },
    '#4f63e0': { label: 'hotdog', draw: (p) => `
<path d="M 60 200 Q 60 160 150 155 Q 240 160 240 200 Q 240 280 150 290 Q 60 280 60 200 Z" fill="#e8b892" stroke="#2a2430" stroke-width="3"/>
<path d="M 80 200 Q 80 175 150 170 Q 220 175 220 200 Q 220 255 150 260 Q 80 255 80 200 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
${eyes(120, 200, 180, 200, 9)}
${smile(130, 230, 40)}
<path d="M 100 185 Q 150 175 200 185" fill="none" stroke="#e3263c" stroke-width="4"/>` },
    '#ffc233': { label: 'cupcake', draw: (p) => `
<path d="M 95 230 L 105 340 L 195 340 L 205 230 Z" fill="#ff9ecf" stroke="#2a2430" stroke-width="3"/>
${[0,1,2,3].map((i) => `<path d="M 100 ${245 + i * 22} L 200 ${245 + i * 22}" fill="none" stroke="#fff" stroke-width="4" opacity="0.35"/>`).join('')}
<ellipse cx="150" cy="220" rx="70" ry="40" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="180" r="45" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${eyes(130, 195, 170, 195, 8)}
${smile(135, 220, 30)}
<path d="M 150 140 L 150 110" fill="none" stroke="#e3263c" stroke-width="5"/>
<circle cx="150" cy="105" r="10" fill="#e3263c"/>` },
    '#c8203a': { label: 'chips', draw: (p) => `
<path d="M 100 140 L 90 340 L 210 340 L 200 140 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 140 Q 150 110 200 140" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${eyes(125, 200, 175, 200, 10)}
${smile(130, 245, 40)}
<path d="M 120 160 L 180 160" fill="none" stroke="#fff" stroke-width="3" opacity="0.4"/>
<text x="150" y="300" text-anchor="middle" font-size="28" fill="#fff" font-family="sans-serif" font-weight="700" opacity="0.5">CHIP</text>` },
    '#ff9ecf': { label: 'candy', draw: (p) => `
<ellipse cx="150" cy="220" rx="55" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 95 200 L 40 160 L 45 240 Z M 205 200 L 260 160 L 255 240 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<path d="M 100 220 L 200 220" fill="none" stroke="#fff" stroke-width="8" opacity="0.35"/>
${eyes(130, 210, 170, 210, 9)}
${smile(135, 240, 30)}` },
  };

  // ── Cryptids ───────────────────────────────────────────────────────────────
  const CRYPTID_CAST = {
    '#1f9bff': { label: 'bigfoot', draw: (p) => `
<ellipse cx="150" cy="300" rx="55" ry="45" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="210" rx="50" ry="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="130" r="45" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(135, 125, 165, 125, 8)}
${smile(138, 150, 24)}
<path d="M 100 200 Q 50 240 60 300 M 200 200 Q 250 240 240 300" fill="none" stroke="${p.lo}" stroke-width="16"/>
<path d="M 110 340 L 90 370 M 190 340 L 210 370" fill="none" stroke="${p.lo}" stroke-width="14"/>` },
    '#e3263c': { label: 'nessie', draw: (p) => `
<path d="M 40 300 Q 80 260 120 280 Q 160 310 200 270 Q 240 230 270 260" fill="none" stroke="url(#gC)" stroke-width="36"/>
<path d="M 40 300 Q 80 260 120 280 Q 160 310 200 270 Q 240 230 270 260" fill="none" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="230" cy="200" rx="40" ry="45" fill="${p.base}" stroke="${p.line}" stroke-width="3"/>
${eyes(220, 190, 245, 190, 7)}
${smile(220, 215, 28)}
<path d="M 250 165 L 270 130" fill="none" stroke="${p.hi}" stroke-width="8"/>` },
    '#8ed11a': { label: 'mothman', draw: (p) => `
<ellipse cx="150" cy="250" rx="40" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="170" r="40" fill="${p.base}" stroke="${p.line}" stroke-width="3"/>
${eyes(132, 165, 168, 165, 10)}
<path d="M 110 220 Q 30 160 50 100 Q 100 150 120 200 M 190 220 Q 270 160 250 100 Q 200 150 180 200" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5" opacity="0.9"/>
<path d="M 130 300 L 120 350 M 170 300 L 180 350" fill="none" stroke="${p.lo}" stroke-width="8"/>
<path d="M 140 195 L 160 195" fill="none" stroke="#2a2430" stroke-width="3"/>` },
    '#ff7a00': { label: 'chupacabra', draw: (p) => `
<ellipse cx="150" cy="280" rx="60" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="190" rx="50" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[110,130,150,170,190].map((x,i) => `<path d="M ${x} 145 L ${x} ${110 - i * 2}" fill="none" stroke="${p.hi}" stroke-width="5"/>`).join('')}
${eyes(130, 185, 170, 185, 9)}
<path d="M 135 210 L 150 225 L 165 210" fill="#fff" stroke="#2a2430" stroke-width="2"/>
<path d="M 90 240 Q 50 260 55 300 M 210 240 Q 250 260 245 300" fill="none" stroke="${p.lo}" stroke-width="10"/>
<path d="M 120 325 L 100 360 M 180 325 L 200 360" fill="none" stroke="${p.lo}" stroke-width="10"/>` },
    '#8a3ffc': { label: 'jersey', draw: (p) => `
<ellipse cx="150" cy="270" rx="45" ry="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="160" r="48" fill="${p.base}" stroke="${p.line}" stroke-width="3"/>
<path d="M 120 130 L 100 80 L 140 115 M 180 130 L 200 80 L 160 115" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${eyes(132, 155, 168, 155, 9)}
${smile(136, 180, 28)}
<path d="M 105 220 Q 60 200 55 250 Q 80 260 110 240 M 195 220 Q 240 200 245 250 Q 220 260 190 240" fill="none" stroke="${p.lo}" stroke-width="8"/>
<path d="M 130 340 L 110 380 M 170 340 L 190 380" fill="none" stroke="${p.lo}" stroke-width="12"/>
<path d="M 200 300 Q 250 280 260 230" fill="none" stroke="${p.base}" stroke-width="10"/>` },
    '#5fcfe6': { label: 'yeti', draw: (p) => `
<ellipse cx="150" cy="290" rx="70" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="200" rx="65" ry="75" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="120" r="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(130, 115, 170, 115, 9)}
${smile(134, 145, 32)}
<path d="M 90 190 Q 40 220 50 280 M 210 190 Q 260 220 250 280" fill="none" stroke="${p.hi}" stroke-width="18"/>
<path d="M 110 340 L 95 375 M 190 340 L 205 375" fill="none" stroke="${p.lo}" stroke-width="14"/>` },
    '#3fae1a': { label: 'jackalope', draw: (p) => `
<ellipse cx="150" cy="300" rx="65" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="200" r="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 120 160 L 100 60 L 95 100 L 80 50 L 110 120 M 180 160 L 200 60 L 205 100 L 220 50 L 190 120" fill="none" stroke="${p.hi}" stroke-width="6"/>
${eyes(130, 195, 170, 195, 8)}
${smile(134, 220, 32)}
<path d="M 210 290 Q 250 250 245 200" fill="none" stroke="${p.base}" stroke-width="12"/>` },
    '#ff5b86': { label: 'thunderbird', draw: (p) => `
<ellipse cx="150" cy="240" rx="40" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="160" r="38" fill="${p.base}" stroke="${p.line}" stroke-width="3"/>
${eyes(135, 155, 165, 155, 7)}
<path d="M 150 175 L 140 195 L 160 195 Z" fill="#ffc233" stroke="#2a2430" stroke-width="2"/>
<path d="M 110 220 Q 20 180 30 100 Q 90 140 115 200 M 190 220 Q 280 180 270 100 Q 210 140 185 200" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 130 295 L 120 340 M 170 295 L 180 340" fill="none" stroke="${p.lo}" stroke-width="8"/>
<path d="M 40 120 L 20 90 M 260 120 L 280 90" fill="none" stroke="#ffc233" stroke-width="4"/>` },
    '#4f63e0': { label: 'flatwoods', draw: (p) => `
<path d="M 100 140 L 200 140 L 220 200 L 80 200 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="260" rx="55" ry="75" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(130, 180, 170, 180, 12)}
${smile(135, 210, 30)}
<path d="M 100 240 Q 50 280 60 340 M 200 240 Q 250 280 240 340" fill="none" stroke="${p.lo}" stroke-width="12"/>
<path d="M 120 330 L 110 370 M 180 330 L 190 370" fill="none" stroke="${p.lo}" stroke-width="10"/>` },
    '#ffc233': { label: 'kraken', draw: (p) => `
<ellipse cx="150" cy="180" rx="75" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(120, 170, 180, 170, 14)}
<path d="M 130 200 L 150 220 L 170 200" fill="#fff" stroke="#2a2430" stroke-width="2"/>
${[[70,250],[100,280],[130,300],[170,300],[200,280],[230,250],[60,200],[240,200]].map(([x,y],i) =>
  `<path d="M ${140 + (i % 4) * 5} 220 Q ${x} ${y - 30} ${x} ${y}" fill="none" stroke="${p.base}" stroke-width="11"/>`
  + `<circle cx="${x}" cy="${y}" r="9" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>`
).join('')}` },
    '#c8203a': { label: 'bunyip', draw: (p) => `
<ellipse cx="150" cy="280" rx="70" ry="55" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="190" rx="60" ry="65" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 110 150 L 95 100 L 130 135 M 190 150 L 205 100 L 170 135" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${eyes(128, 180, 172, 180, 10)}
${smile(132, 215, 36)}
<path d="M 90 230 Q 40 250 50 310 M 210 230 Q 260 250 250 310" fill="none" stroke="${p.lo}" stroke-width="12"/>
<path d="M 200 300 Q 250 320 270 280" fill="none" stroke="${p.base}" stroke-width="14"/>` },
    '#ff9ecf': { label: 'nightcrawler', draw: (p) => `
<path d="M 150 100 Q 200 160 180 240 Q 160 320 150 360 Q 140 320 120 240 Q 100 160 150 100 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(135, 160, 165, 160, 8)}
${smile(138, 190, 24)}
<path d="M 130 140 L 115 110 M 170 140 L 185 110" fill="none" stroke="${p.hi}" stroke-width="5"/>
<path d="M 120 250 Q 80 260 85 300 M 180 250 Q 220 260 215 300" fill="none" stroke="${p.lo}" stroke-width="8"/>` },
  };

  function makeEdition(name, CAST) {
    const fallback = CAST['#1f9bff'];
    function palette(base) {
      return {
        base,
        hi: shade(base, 0.2),
        lo: shade(base, -0.28),
        line: shade(base, -0.55),
        v: CAST[String(base).toLowerCase()] || fallback,
      };
    }
    function bodySVG(p) {
      const art = typeof p.v.draw === 'function' ? p.v.draw(p) : '';
      return wrap(p, art);
    }
    return { CAST, palette, bodySVG, name };
  }

  window.FLIP_CARTOON_CASTS = {
    pets: makeEdition('pets', PET_CAST),
    garden: makeEdition('garden', GARDEN_CAST),
    robots: makeEdition('robots', ROBOT_CAST),
    ocean: makeEdition('ocean', OCEAN_CAST),
    snacks: makeEdition('snacks', SNACK_CAST),
    cryptids: makeEdition('cryptids', CRYPTID_CAST),
  };
})();
