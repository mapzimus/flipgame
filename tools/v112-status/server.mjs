import http from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const STATUS_PATH = path.join(ROOT, 'docs', 'v112-status.json');
const DEFECTS_PATH = path.join(ROOT, 'docs', 'v112-defects.md');
const LOG_PATH = path.join(ROOT, 'docs', 'v112-integration-log.md');
const TEST_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_PORT = 4192;

const SMOKE_TESTS = Object.freeze([
  ['Browser authority', 'scripts/v112-browser-authority-boundary-tests.js'],
  ['Rules', 'scripts/v112-rules-tests.js'],
  ['Event kernel', 'scripts/v112-event-kernel-tests.js'],
  ['Event contract', 'scripts/v112-event-contract-tests.js'],
  ['Activity', 'scripts/v112-activity-tests.js'],
  ['Battle', 'scripts/v112-battle-tests.js'],
  ['Story', 'scripts/v112-story-tests.js'],
  ['Physics hardening', 'scripts/v112-physics-hardening-tests.js'],
  ['Legacy regression', 'scripts/regression-tests.js']
]);

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
});

let tests = {
  state: 'waiting',
  head: null,
  startedAt: null,
  finishedAt: null,
  passed: 0,
  failed: 0,
  results: []
};
let testPromise = null;
let lastAutomaticRun = 0;

async function git(args, cwd = ROOT, timeout = 15000) {
  const result = await execFileAsync('git', args, {
    cwd,
    timeout,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return result.stdout.trim();
}

function parseWorktreeList(text) {
  return text.split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
    const item = {};
    for (const line of block.split(/\r?\n/)) {
      const split = line.indexOf(' ');
      const key = split === -1 ? line : line.slice(0, split);
      const value = split === -1 ? true : line.slice(split + 1);
      item[key] = value;
    }
    if (typeof item.branch === 'string') item.branch = item.branch.replace(/^refs\/heads\//, '');
    return item;
  });
}

function parseDefects(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^\| V112-\d+ \|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const [id, severity, subsystem, reproduction, status, verification] = cells;
    const lower = status.toLowerCase();
    const explicitlyOpen = /\b(open|pending|assigned|blocked)\b|remains open|outside integration|not live-wired/.test(lower);
    const independentlyPassed = /independent(?:ly| review| qa| audit| re-audit)?.*pass/.test(lower);
    const closed = !explicitlyOpen && independentlyPassed;
    const remediated = !closed && /\b(fixed|implemented|committed|landed)\b/.test(lower);
    rows.push({
      id,
      severity,
      subsystem,
      reproduction: reproduction.replace(/`/g, ''),
      status: status.replace(/`/g, ''),
      verification: verification.replace(/`/g, ''),
      disposition: closed ? 'verified' : remediated ? 'review' : 'open'
    });
  }
  return rows;
}

function parseLatestRevision(markdown) {
  const matches = [...markdown.matchAll(/^## Revision (\d+)\s+—\s+(.+)$/gm)];
  if (!matches.length) return null;
  const latest = matches[matches.length - 1];
  return { number: Number(latest[1]), title: latest[2].trim() };
}

async function worktreeStatus(config, integrationHead) {
  const raw = await git(['worktree', 'list', '--porcelain']);
  const all = parseWorktreeList(raw);
  const wanted = new Set(config.workstreams.map((item) => item.branch));
  wanted.add(config.integrationBranch);
  const selected = all.filter((item) => wanted.has(item.branch));

  return Promise.all(selected.map(async (item) => {
    const [dirtyText, logText, divergence] = await Promise.all([
      git(['status', '--short'], item.worktree).catch(() => ''),
      git(['log', '-1', '--format=%H%x1f%h%x1f%cI%x1f%s'], item.worktree).catch(() => ''),
      item.HEAD === integrationHead
        ? Promise.resolve('0\t0')
        : git(['rev-list', '--left-right', '--count', `${integrationHead}...${item.HEAD}`], ROOT).catch(() => '0\t0')
    ]);
    const [full = item.HEAD, short = item.HEAD.slice(0, 8), committedAt = null, subject = ''] = logText.split('\x1f');
    const [behind = '0', ahead = '0'] = divergence.split(/\s+/);
    return {
      path: item.worktree,
      branch: item.branch || '(detached)',
      head: full,
      shortHead: short,
      committedAt,
      subject,
      dirtyFiles: dirtyText ? dirtyText.split(/\r?\n/).filter(Boolean).length : 0,
      behind: Number(behind),
      ahead: Number(ahead)
    };
  }));
}

async function recentCommits() {
  const text = await git(['log', '-12', '--format=%H%x1f%h%x1f%cI%x1f%an%x1f%s']);
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [head, shortHead, committedAt, author, subject] = line.split('\x1f');
    return { head, shortHead, committedAt, author, subject };
  });
}

async function runSmokeTests(reason = 'automatic') {
  if (testPromise) return testPromise;
  testPromise = (async () => {
    const head = await git(['rev-parse', 'HEAD']);
    tests = {
      state: 'running',
      reason,
      head,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      passed: 0,
      failed: 0,
      results: SMOKE_TESTS.map(([name, script]) => ({ name, script, state: 'queued' }))
    };

    for (let index = 0; index < SMOKE_TESTS.length; index += 1) {
      const [name, script] = SMOKE_TESTS[index];
      tests.results[index] = { name, script, state: 'running' };
      const started = Date.now();
      try {
        const result = await execFileAsync(process.execPath, [script], {
          cwd: ROOT,
          timeout: 60000,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024
        });
        const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
        tests.results[index] = {
          name,
          script,
          state: 'passed',
          durationMs: Date.now() - started,
          summary: output.split(/\r?\n/).filter(Boolean).slice(-1)[0] || 'Passed'
        };
        tests.passed += 1;
      } catch (error) {
        const output = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
        tests.results[index] = {
          name,
          script,
          state: 'failed',
          durationMs: Date.now() - started,
          summary: output.split(/\r?\n/).filter(Boolean).slice(-1)[0] || error.message
        };
        tests.failed += 1;
      }
    }
    tests.state = tests.failed ? 'failed' : 'passed';
    tests.finishedAt = new Date().toISOString();
    lastAutomaticRun = Date.now();
    return tests;
  })().finally(() => {
    testPromise = null;
  });
  return testPromise;
}

async function buildSnapshot({ triggerTests = true } = {}) {
  const [configText, defectsText, logText, branch, head, shortHead, dirty, baselineCount, commits] = await Promise.all([
    readFile(STATUS_PATH, 'utf8'),
    readFile(DEFECTS_PATH, 'utf8'),
    readFile(LOG_PATH, 'utf8'),
    git(['branch', '--show-current']),
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', '--short=8', 'HEAD']),
    git(['status', '--short']),
    git(['rev-list', '--count', '947133360d3487a646e04be2b313c577474f54a5..HEAD']),
    recentCommits()
  ]);
  const config = JSON.parse(configText);
  const defects = parseDefects(defectsText);
  const worktrees = await worktreeStatus(config, head);
  const latestRevision = parseLatestRevision(logText);

  const activeBlocking = defects.filter((item) => item.disposition !== 'verified' && /P[0-2]/.test(item.severity));
  const counts = {
    total: defects.length,
    open: defects.filter((item) => item.disposition === 'open').length,
    review: defects.filter((item) => item.disposition === 'review').length,
    verified: defects.filter((item) => item.disposition === 'verified').length,
    p0: activeBlocking.filter((item) => item.severity === 'P0').length,
    p1: activeBlocking.filter((item) => item.severity === 'P1').length,
    p2: activeBlocking.filter((item) => item.severity === 'P2').length
  };

  if (triggerTests && !testPromise && (tests.head !== head || Date.now() - lastAutomaticRun > TEST_INTERVAL_MS)) {
    void runSmokeTests(tests.head !== head ? 'integration commit changed' : 'scheduled refresh');
  }

  return {
    generatedAt: new Date().toISOString(),
    config,
    integration: {
      branch,
      head,
      shortHead,
      dirtyFiles: dirty ? dirty.split(/\r?\n/).filter(Boolean).length : 0,
      commitsSincePublicBaseline: Number(baselineCount),
      latestRevision
    },
    counts,
    defects,
    worktrees,
    commits,
    tests
  };
}

function json(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

async function staticFile(response, name) {
  const safe = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/app.js', 'app.js'],
    ['/style.css', 'style.css']
  ]).get(name);
  if (!safe) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const data = await readFile(path.join(HERE, safe));
  response.writeHead(200, {
    'Content-Type': MIME[path.extname(safe)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  response.end(data);
}

async function handle(request, response) {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/api/status') {
      json(response, 200, await buildSnapshot());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/tests/run') {
      if (!testPromise) void runSmokeTests('manual dashboard request');
      json(response, 202, { accepted: true, state: tests.state });
      return;
    }
    if (request.method !== 'GET') {
      json(response, 405, { error: 'Method not allowed' });
      return;
    }
    await staticFile(response, url.pathname);
  } catch (error) {
    json(response, 500, { error: error.message });
  }
}

const snapshotOnly = process.argv.includes('--snapshot');
if (snapshotOnly) {
  process.stdout.write(`${JSON.stringify(await buildSnapshot({ triggerTests: false }))}\n`);
} else {
  const rawPort = process.argv.find((argument) => argument.startsWith('--port='))?.slice(7)
    ?? process.env.FLIPGAME_STATUS_PORT
    ?? DEFAULT_PORT;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid status dashboard port');
  const server = http.createServer((request, response) => void handle(request, response));
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    process.stdout.write(`Flipgame v1.12 status: http://127.0.0.1:${actualPort}/\n`);
    void runSmokeTests('dashboard startup');
  });
}

export { buildSnapshot, parseDefects, parseLatestRevision, parseWorktreeList };
