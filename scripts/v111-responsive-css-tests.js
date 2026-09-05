#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

function closingBrace(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === '{') depth++;
    if (text[index] === '}' && --depth === 0) return index;
  }
  throw new Error('Unclosed CSS block');
}

function mediaRange(header) {
  const min = header.match(/min-width\s*:\s*(\d+)px/i);
  const max = header.match(/max-width\s*:\s*(\d+)px/i);
  if (!min && !max) return () => false;
  return (width) => (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
}

function parseDeclarations(body) {
  const declarations = {};
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (property && value) declarations[property] = value;
  }
  return declarations;
}

function parseRules(text, active = () => true, output = []) {
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('{', cursor);
    if (open < 0) break;
    const header = text.slice(cursor, open).trim();
    const close = closingBrace(text, open);
    const body = text.slice(open + 1, close);
    if (header.startsWith('@media')) {
      const query = mediaRange(header);
      parseRules(body, (width) => active(width) && query(width), output);
    } else if (header && !header.startsWith('@')) {
      output.push({
        selectors: header.split(',').map((selector) => selector.trim()),
        declarations: parseDeclarations(body), active,
      });
    }
    cursor = close + 1;
  }
  return output;
}

const rules = parseRules(source.replace(/\/\*[\s\S]*?\*\//g, ''));

function computed(selector, width) {
  const result = {};
  for (const rule of rules) {
    if (rule.active(width) && rule.selectors.includes(selector)) Object.assign(result, rule.declarations);
  }
  return result;
}

function columns(value) {
  if (!value) return 1;
  const repeated = value.match(/^repeat\((\d+),/);
  if (repeated) return Number(repeated[1]);
  let depth = 0;
  let count = 0;
  let token = false;
  for (const character of value) {
    if (character === '(') depth++;
    if (character === ')') depth--;
    if (/\s/.test(character) && depth === 0) {
      if (token) count++;
      token = false;
    } else token = true;
  }
  return count + (token ? 1 : 0);
}

function testExactBreakpointBands() {
  for (const width of [320, 360, 767]) {
    assert.equal(columns(computed('.setup-layout', width)['grid-template-columns']), 1,
      `${width}px setup must be one column`);
    assert.equal(columns(computed('.stats-layout', width)['grid-template-columns']), 1,
      `${width}px stats must be one column`);
    assert.equal(columns(computed('.player-input-grid', width)['grid-template-columns']), 1);
  }

  for (const width of [768, 900, 1099]) {
    assert.equal(columns(computed('.setup-layout', width)['grid-template-columns']), 2,
      `${width}px setup must stay in the compact two-column band`);
    assert.equal(computed('.players-panel', width)['grid-column'], 'auto');
    assert.equal(computed('.match-panel', width)['grid-column'], 'auto');
    assert.equal(columns(computed('.stats-layout', width)['grid-template-columns']), 2,
      `${width}px stats must stay in the compact two-column band`);
    assert.equal(columns(computed('.player-input-grid', width)['grid-template-columns']), 1,
      `${width}px compact player cards must not be nested into cramped double columns`);
  }

  for (const width of [1100, 1280, 1366, 1920, 3840]) {
    assert.equal(columns(computed('.setup-layout', width)['grid-template-columns']), 12,
      `${width}px setup must use the full twelve-column grid`);
    assert.equal(computed('.players-panel', width)['grid-column'], 'span 7');
    assert.equal(computed('.match-panel', width)['grid-column'], 'span 5');
    assert.equal(columns(computed('.stats-layout', width)['grid-template-columns']), 2);
    assert.equal(columns(computed('.player-input-grid', width)['grid-template-columns']), 2,
      `${width}px player grid must place eight players in two columns`);
  }
}

function testBoundaryOwnershipAndStatsCutoff() {
  assert.ok(!/@media\s*\(min-width:\s*900px\)/.test(source),
    '900px must not introduce a fourth conflicting layout band');
  assert.ok(!/@media\s*\(max-width:\s*899px\)/.test(source),
    'the obsolete 899px Stats collapse cutoff must be removed');
  assert.match(source, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.stats-rail details:not\(\[open\]\) > :not\(summary\)/,
    'the collapsible Stats rail belongs only to the mobile band');
  assert.notEqual(computed('.stats-rail details > summary', 767).display, 'none');
  assert.equal(computed('.stats-rail details > summary', 768).display, 'none');
  assert.equal(computed('.stats-rail details:not([open]) > :not(summary)', 767).display, 'none');
  assert.equal(computed('.stats-rail details:not([open]) > :not(summary)', 768).display, 'block',
    'a rail collapsed on mobile is forced open visually after entering the tablet band');
  assert.equal(columns(computed('.setup-layout', 1099)['grid-template-columns']), 2);
  assert.equal(columns(computed('.setup-layout', 1100)['grid-template-columns']), 12);
}

function testSmartboardCardsTargetsAndBounds() {
  const grid1280 = computed('.player-input-grid', 1280);
  assert.equal(columns(grid1280['grid-template-columns']), 2);
  assert.match(grid1280['grid-template-rows'], /^repeat\(4,/,
    '1280px keeps the required 2 × 4 eight-player grid');
  assert.equal(computed('.player-input-row', 1280)['max-block-size'], '108px');

  for (const width of [360, 768, 1280, 1366, 1920, 3840]) {
    const minimumTarget = Number.parseFloat(computed('button', width)['min-block-size']);
    assert.ok(minimumTarget >= 48, `${width}px button target fell below 48px`);
    assert.equal(computed('.app-main', width)['overflow-x'], 'hidden');
    assert.equal(computed('.app-shell', width)['max-inline-size'], '100%');
    assert.equal(computed('.setup-layout', width)['inline-size'], '100%');
    assert.equal(computed('.setup-layout > *', width)['min-inline-size'], '0');
    assert.equal(computed('.stats-layout > *', width)['min-inline-size'], '0');
    assert.equal(computed('body', width).overflow, 'hidden');
  }
  assert.equal(computed('.setup-layout', 3840)['max-inline-size'], '1480px');
  assert.equal(computed('.stats-main', 3840)['max-inline-size'], '1480px');
  assert.equal(computed('.player-input-row', 768)['min-inline-size'], '0');
  assert.equal(computed('.prow-line input', 768)['min-inline-size'], '0');
}

testExactBreakpointBands();
testBoundaryOwnershipAndStatsCutoff();
testSmartboardCardsTargetsAndBounds();
console.log('v111 responsive CSS breakpoint tests passed.');
