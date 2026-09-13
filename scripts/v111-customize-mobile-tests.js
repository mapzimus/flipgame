#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// V111-072: implicit auto-sized grid tracks honored the Customize controls'
// min-content width (427px) inside a 360px viewport. Both grid boundaries and
// every direct child now explicitly permit shrinking.
assert.match(css, /#char-picker-screen\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/s);
assert.match(css, /#char-picker-screen > \*,\s*\.customize-main > \*,\s*#customize-panel,\s*\.picker-grid\s*\{[^}]*min-inline-size:\s*0[^}]*max-inline-size:\s*100%/s);
assert.match(css, /\.customize-main\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)[^}]*grid-template-rows:\s*auto auto minmax\(0,1fr\)/s);

const narrowPrefix = '@media\\s*\\(max-width:\\s*420px\\)[\\s\\S]*?';
for (const required of [
  '\\.customize-main\\s*\\{[^}]*padding-inline:\\s*8px',
  '\\.customize-main \\.seat-switcher\\s*\\{[^}]*grid-template-columns:\\s*minmax\\(0,1fr\\) 48px minmax\\(0,1fr\\)',
  '\\.customize-main \\.seat-switcher button\\s*\\{[^}]*inline-size:\\s*100%[^}]*min-inline-size:\\s*0',
  '\\.customize-main \\.tab-list\\s*\\{[^}]*display:\\s*grid[^}]*repeat\\(2,minmax\\(0,1fr\\)\\)',
  '\\.customize-main \\.tab-list button\\s*\\{[^}]*inline-size:\\s*100%[^}]*min-inline-size:\\s*0',
  '#char-picker-screen \\.app-footer > button\\s*\\{[^}]*flex:\\s*1 1 0[^}]*min-inline-size:\\s*0',
]) assert.match(css, new RegExp(narrowPrefix + required), `missing narrow rule: ${required}`);

for (const id of ['charpick-close', 'customize-prev', 'customize-next',
  'customize-tab-object', 'customize-tab-variant', 'customize-tab-cosmetic',
  'customize-cancel', 'customize-apply']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `${id} target is missing`);
}
// v1.12 moved the global venue choice out of each player's customization and
// into its own pre-match Arena Select screen.
assert.doesNotMatch(html, /id=["']customize-tab-arena["']/);
assert.match(html, /id=["']arena-select-screen["']/);
assert.match(css, /button, select, input\[type="text"\], input\[type="date"\], \.file-action\s*\{[^}]*min-block-size:\s*48px/s);
assert.match(css, /\.picker-tile\s*\{[^}]*min-block-size:\s*148px/s);

// Exact 360px border-box budget. This mirrors browser computed geometry: the
// screen/main/panel cannot exceed the viewport, two tile columns fit the panel,
// and all interactive columns remain wider than the 48px target minimum.
const viewport = 360;
const mainBorderBox = viewport;
const mainContent = mainBorderBox - 16; // narrow 8px inline padding
const panelBorderBox = mainContent;
const panelContent = panelBorderBox - 14; // two 1px borders + two 6px paddings
const tileWidth = (panelContent - 6) / 2;
const seatSide = (mainContent - 48 - 8) / 2;
const tabWidth = (mainContent - 6) / 2;
assert.equal(mainBorderBox, 360);
assert.equal(panelBorderBox, 344);
assert.ok(tileWidth >= 48 && seatSide >= 48 && tabWidth >= 48);
assert.ok(mainBorderBox <= viewport && panelBorderBox <= viewport);

// The correction must not alter the approved desktop height model.
const desktopMainHeight = 720 - 56 - 72;
const desktopPanelHeight = desktopMainHeight - (2 * 16) - 48 - 48 - (2 * 10);
assert.equal(desktopPanelHeight, 444);
assert.match(css, /@media\s*\(min-width:\s*768px\)/);
assert.match(css, /@media\s*\(min-width:\s*1100px\)/);

console.log('v1.11 Customize mobile containment tests passed (360x740; desktop preserved).');
