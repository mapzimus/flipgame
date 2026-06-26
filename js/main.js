// main.js — game loop, wires everything together (loaded last)

(function () {
  const canvas       = document.getElementById('game-canvas');
  const setupScreen  = document.getElementById('setup-screen');
  const gameScreen   = document.getElementById('game-screen');
  const gameOverEl   = document.getElementById('game-over');
  const winnerNameEl = document.getElementById('winner-name');
  const playAgainBtn = document.getElementById('play-again-btn');
  const playerListEl = document.getElementById('player-list');
  const pointCountEl = document.getElementById('point-count');
  const turnBannerEl = document.getElementById('turn-banner');
  const streakBannerEl = document.getElementById('streak-banner');
  const flipHintEl   = document.getElementById('flip-hint');
  const startBtn     = document.getElementById('start-btn');
  const practiceBtn  = document.getElementById('practice-btn');
  const addPlayerBtn = document.getElementById('add-player-btn');
  const playerInputs = document.getElementById('player-inputs');
  const handoffEl    = document.getElementById('handoff-overlay');
  const handoffNameEl = document.getElementById('handoff-name');
  const tutorialEl   = document.getElementById('tutorial-overlay');
  const tutorialDoneBtn = document.getElementById('tutorial-done-btn');

  // ── Sizing ─────────────────────────────────────────────────────────────────
  // Scale the backing store by devicePixelRatio so everything is crisp on a
  // hi-DPI smartboard. We draw in LOGICAL (CSS) pixels — the transform maps
  // them to physical pixels — so physics/renderer keep using logical coords.
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2 (fill-rate)
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    Renderer.resize(w, h);
  }
  window.addEventListener('resize', resize);

  // ── Gatorade flavors (liquid color = whose turn it is) ──────────────────────
  const FLAVORS = [
    { name: 'Cool Blue',      color: '#1f9bff' },
    { name: 'Fruit Punch',    color: '#e23048' },
    { name: 'Lemon-Lime',     color: '#86d40a' },
    { name: 'Orange',         color: '#ff7a00' },
    { name: 'Grape',          color: '#8a3ffc' },
    { name: 'Glacier Freeze', color: '#56cfe1' },
    { name: 'Riptide Rush',   color: '#00bfa5' },
    { name: 'Strawberry',     color: '#ff4d8d' },
    { name: 'Lemonade',       color: '#ffd21a' },
  ];

  // ── Player setup rows (name + flavor picker + Human/CPU) ────────────────────
  let playerCount = 2;

  function swatchesHtml(sel) {
    return FLAVORS.map((f, i) =>
      `<button type="button" class="flavor-swatch${i === sel ? ' selected' : ''}" data-idx="${i}" style="background:${f.color}" title="${f.name}"></button>`
    ).join('');
  }

  function rowHtml(i, def) {
    return `<div class="player-input-row" data-flavor="${def.flavor}" data-ai="${def.ai ? 1 : 0}">
      <div class="prow-top">
        <span class="player-num" style="color:${FLAVORS[def.flavor].color}">P${i + 1}</span>
        <input type="text" placeholder="Player ${i + 1}" maxlength="14" value="${escapeHtml(def.name)}">
        <button type="button" class="ai-toggle${def.ai ? ' cpu' : ''}" title="Tap to switch Human / CPU">${def.ai ? '🤖' : '🧑'}</button>
        ${i >= 2 ? '<button type="button" class="remove-player-btn" title="Remove">✕</button>' : ''}
      </div>
      <div class="flavor-picker">${swatchesHtml(def.flavor)}</div>
    </div>`;
  }

  function readRows() {
    return [...playerInputs.querySelectorAll('.player-input-row')].map(row => ({
      name: row.querySelector('input').value,
      flavor: parseInt(row.dataset.flavor) || 0,
      ai: row.dataset.ai === '1',
    }));
  }

  function renderFrom(defs) {
    playerCount = defs.length;
    playerInputs.innerHTML = defs.map((d, i) => rowHtml(i, d)).join('');
    addPlayerBtn.disabled = playerCount >= 8;
  }

  function addPlayerInput() {
    if (playerCount >= 8) return;
    const defs = readRows();
    defs.push({ name: `Player ${defs.length + 1}`, flavor: defs.length % FLAVORS.length, ai: false });
    renderFrom(defs);
  }

  // event delegation: flavor select, AI toggle, remove
  playerInputs.addEventListener('click', (e) => {
    const sw = e.target.closest('.flavor-swatch');
    if (sw) {
      const row = sw.closest('.player-input-row');
      row.dataset.flavor = sw.dataset.idx;
      row.querySelectorAll('.flavor-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      row.querySelector('.player-num').style.color = FLAVORS[+sw.dataset.idx].color;
      return;
    }
    const ai = e.target.closest('.ai-toggle');
    if (ai) {
      const row = ai.closest('.player-input-row');
      const on = row.dataset.ai === '1';
      row.dataset.ai = on ? '0' : '1';
      ai.textContent = on ? '🧑' : '🤖';
      ai.classList.toggle('cpu', !on);
      return;
    }
    const rm = e.target.closest('.remove-player-btn');
    if (rm && playerCount > 2) {
      const defs = readRows();
      defs.splice([...playerInputs.children].indexOf(rm.closest('.player-input-row')), 1);
      renderFrom(defs);
    }
  });

  addPlayerBtn.addEventListener('click', addPlayerInput);

  function rowsToDefs(rows) {
    return rows.map((r, i) => ({
      name: (r.name || '').trim() || `Player ${i + 1}`,
      color: FLAVORS[r.flavor].color,
      isAI: r.ai,
    }));
  }
  function chosenDifficulty() {
    return document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
  }

  // ── Start game ─────────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    const defs = rowsToDefs(readRows());
    if (defs.length < 2) { alert('Need at least 2 players!'); return; }
    const dir = parseInt(document.querySelector('input[name="direction"]:checked')?.value ?? '1');
    Sound.unlock();   // first user gesture — unlock audio
    maybeShowTutorial(() => {
      setupScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');
      gameOverEl.classList.add('hidden');
      startGame(defs, dir, { difficulty: chosenDifficulty() });
    });
  });

  // ── Practice (solo, no lives) ───────────────────────────────────────────────
  practiceBtn.addEventListener('click', () => {
    const r0 = readRows()[0] || { name: 'You', flavor: 0 };
    const def = { name: (r0.name || '').trim() || 'You', color: FLAVORS[r0.flavor].color, isAI: false };
    Sound.unlock();
    maybeShowTutorial(() => {
      setupScreen.classList.add('hidden');
      gameScreen.classList.remove('hidden');
      gameOverEl.classList.add('hidden');
      startGame([def], 1, { practice: true });
    });
  });

  playAgainBtn.addEventListener('click', () => {
    gameOverEl.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (game.practice) {
      startGame([{ name: game.players[0].name, color: game.players[0].color, isAI: false }], 1, { practice: true });
    } else {
      const defs = game.players.map(p => ({ name: p.name, color: p.color, isAI: p.isAI }));
      startGame(defs, game.direction, { difficulty: game.difficulty });
    }
  });

  // initial two rows
  renderFrom([
    { name: 'Player 1', flavor: 0, ai: false },
    { name: 'Player 2', flavor: 1, ai: false },
  ]);

  // ── Game loop state ────────────────────────────────────────────────────────
  let lastTime    = 0;
  let loopId      = null;
  let evaluating  = false;
  let showGlow    = false;
  let resultTimer = 0;
  let resultAlpha = 0;
  let aiTimer     = null;
  const RESULT_MS = 1500;

  // CPU takes its turn: aim near the sweet-spot flick, with error set by difficulty.
  function aiFlick() {
    if (game.state !== GAME_STATES.TURN_START && game.state !== GAME_STATES.ON_FIRE) return;
    const sigma = { easy: 650, medium: 400, hard: 220 }[game.difficulty] || 400;
    const u1 = Math.random() || 1e-6, u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const up = Math.max(500, 2100 + gauss * sigma);   // sweet spot ~2100 px/s
    const vx = (Math.random() - 0.5) * 420;           // slight lean
    onFlick(vx, -up);
  }

  // ── Turn-handoff gate (pass-and-play clarity + no accidental flicks) ────────
  let handoffCb = null;

  function showHandoff(player, cb) {
    handoffCb = cb;
    handoffNameEl.textContent = player.name;
    handoffNameEl.style.color = player.color;
    handoffEl.classList.remove('hidden');
  }

  handoffEl.addEventListener('click', () => {
    handoffEl.classList.add('hidden');
    const cb = handoffCb; handoffCb = null;
    if (cb) cb();
  });

  // ── First-launch tutorial (shown once, then never blocks) ───────────────────
  const TUTORIAL_KEY = 'flipgame.tutorialSeen';

  function maybeShowTutorial(after) {
    let seen = false;
    try { seen = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (_) {}
    if (seen) { after(); return; }
    tutorialEl.classList.remove('hidden');
    tutorialDoneBtn.onclick = () => {
      try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (_) {}
      tutorialEl.classList.add('hidden');
      after();
    };
  }

  function startGame(defs, dir, opts) {
    Renderer.init(canvas);
    resize();   // sets DPR transform + renderer logical dims (must run after init)
    Physics.init(window.innerWidth, window.innerHeight);  // logical coords

    game.on(GAME_STATES.TURN_START, onTurnStart);
    game.on(GAME_STATES.RESULT,     onResult);
    game.on(GAME_STATES.ON_FIRE,    onOnFire);
    game.on(GAME_STATES.ELIMINATED, onEliminated);
    game.on(GAME_STATES.GAME_OVER,  onGameOver);

    game.init(defs, dir, opts || {});

    if (loopId) cancelAnimationFrame(loopId);
    lastTime = performance.now();
    loop(lastTime);
  }

  function loop(now) {
    loopId = requestAnimationFrame(loop);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    Physics.step(dt); // always step — bottle settles on table during TURN_START too

    // Physics-based landing check
    if (evaluating) {
      const result = Physics.checkLanding();
      if (result) {
        evaluating = false;
        showGlow   = result === 'MAKE';
        const b = Physics.getBottle();
        Renderer.kick(result, {
          x: b.position.x,
          y: b.position.y,
          color: game.currentPlayer()?.color || '#69f0ae',
        });
        game.resolveFlip(result);
      }
    }

    // Result countdown + fade
    if (game.state === GAME_STATES.RESULT) {
      resultTimer -= dt * 1000;
      if (resultTimer > RESULT_MS - 350) {
        resultAlpha = (RESULT_MS - resultTimer) / 350;
      } else if (resultTimer < 400) {
        resultAlpha = resultTimer / 400;
      } else {
        resultAlpha = 1;
      }
      if (resultTimer <= 0) {
        showGlow    = false;
        resultAlpha = 0;
        game.advanceTurn();
      }
    }

    Renderer.frame(dt, {
      bottle:      Physics.getBottle(),
      liquid:      Physics.getLiquid(),
      groundY:     Physics.getGroundY(),
      drag:        Input.getDragState(),
      result:      game.state === GAME_STATES.RESULT ? game.lastResult : null,
      resultAlpha,
      showGlow,
      isOnFire:    !!(game.onFirePlayer),
      liquidColor: game.currentPlayer()?.color,
    });
  }

  // ── State callbacks ────────────────────────────────────────────────────────
  function onTurnStart() {
    evaluating  = false;
    showGlow    = false;
    resultAlpha = 0;
    clearTimeout(aiTimer);
    Physics.resetBottle();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    streakBannerEl.textContent = '';
    streakBannerEl.className = 'streak-banner';

    if (game.practice) {
      turnBannerEl.textContent = '🎯 Practice';
      pointCountEl.textContent = '';
      Input.enable();
      updateHUD();
      return;
    }

    pointCountEl.textContent = game.pointCount > 1 ? `⚡ ×${game.pointCount}` : '';
    if (p.isAI) {
      turnBannerEl.textContent = `🤖 ${p.name}`;
      Input.disable();
      flipHintEl.classList.add('hidden');
      aiTimer = setTimeout(aiFlick, 1100);
    } else {
      turnBannerEl.textContent = `${p.name}'s turn`;
      flipHintEl.classList.add('hidden');           // hidden until they tap in
      showHandoff(p, () => {
        flipHintEl.classList.remove('hidden');
        Input.enable();
      });
    }
    updateHUD();
  }

  function onOnFire() {
    evaluating  = false;
    showGlow    = false;
    clearTimeout(aiTimer);
    Physics.resetBottle();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    turnBannerEl.textContent  = `🔥 ${p.name} IS ON FIRE!`;
    streakBannerEl.textContent = `+${game.onFireBonus} lives earned`;
    streakBannerEl.className   = 'streak-banner on-fire';
    pointCountEl.textContent   = '';
    if (p.isAI) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      aiTimer = setTimeout(aiFlick, 1000);
    } else {
      Input.enable();
    }
    updateHUD();
  }

  function onResult() {
    Input.disable();
    flipHintEl.classList.add('hidden');
    resultTimer = RESULT_MS;

    const p = game.currentPlayer();

    if (game.practice) {
      if (game.lastResult === 'MAKE') {
        streakBannerEl.textContent = game.practiceStreak > 1 ? `✓ ${game.practiceStreak} in a row!` : '✓ Make!';
        streakBannerEl.className = 'streak-banner on-fire';
        Sound.play('make');
      } else {
        streakBannerEl.textContent = '✗ Miss';
        streakBannerEl.className = 'streak-banner miss-penalty';
        Sound.play('miss');
      }
      updateHUD();
      return;
    }

    if (game.lastResult === 'MAKE') {
      if (game.onFireGain > 0) {
        // ON FIRE bonus make — gained a life
        streakBannerEl.textContent = `🔥 +1 life!  (+${game.onFireBonus} total)`;
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.justIgnited) {
        streakBannerEl.textContent = '🔥 ON FIRE!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('ignite');
      } else if (p.isHeatingUp) {
        streakBannerEl.textContent = '🌡 Heating up!';
        streakBannerEl.className   = 'streak-banner heating-up';
        Sound.play('make');
      } else {
        streakBannerEl.textContent = '';
        streakBannerEl.className   = 'streak-banner';
        Sound.play('make');
      }
    } else if (game.fireEnded) {
      // ON FIRE ended on a miss — no penalty
      streakBannerEl.textContent = '🔥 Streak over — no penalty';
      streakBannerEl.className   = 'streak-banner on-fire';
      Sound.play('miss');
    } else {
      const info = Physics.getLandingInfo();
      const soClose = info && info.flipped && Math.abs(info.finalAngle) < 0.9;
      const n = game.lastPenalty;
      const penalty = `−${n} ${n === 1 ? 'life' : 'lives'}`;
      streakBannerEl.textContent = soClose ? `So close! ${penalty}` : penalty;
      streakBannerEl.className   = 'streak-banner miss-penalty';
      Sound.play('miss');
    }

    updateHUD();
  }

  function onEliminated() {
    const p = game.currentPlayer();
    turnBannerEl.textContent = `❌ ${p.name} is out!`;
    updateHUD();
    setTimeout(() => game.advanceTurn(), 1800);
  }

  function onGameOver() {
    gameScreen.classList.add('hidden');
    gameOverEl.classList.remove('hidden');
    const active = game.activePlayers();
    winnerNameEl.textContent = active.length ? active[0].name : '???';
    Sound.play('win');
    Input.disable();
  }

  // ── Flick ──────────────────────────────────────────────────────────────────
  function onFlick(vx, vy) {
    if (game.state !== GAME_STATES.TURN_START &&
        game.state !== GAME_STATES.ON_FIRE) return;

    Sound.unlock();
    Sound.play('flick');
    Physics.applyFlick(vx, vy);
    Input.disable();
    flipHintEl.classList.add('hidden');
    evaluating = true;
    game.setState(GAME_STATES.EVALUATING);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function updateHUD() {
    if (game.practice) {
      const pct = game.practiceAttempts ? Math.round(game.practiceMakes / game.practiceAttempts * 100) : 0;
      playerListEl.innerHTML = `<div class="practice-stats">
        <div class="ps-item"><span class="ps-num">${game.practiceMakes}/${game.practiceAttempts}</span><span class="ps-label">makes</span></div>
        <div class="ps-item"><span class="ps-num">${pct}%</span><span class="ps-label">rate</span></div>
        <div class="ps-item"><span class="ps-num">${game.practiceStreak}</span><span class="ps-label">streak</span></div>
        <div class="ps-item"><span class="ps-num">${game.practiceBest}</span><span class="ps-label">best</span></div>
      </div>`;
      return;
    }
    playerListEl.innerHTML = game.players.map((p, i) => {
      const active = i === game.currentPlayerIndex && !p.eliminated;
      let cls = 'player-card';
      if (p.eliminated)       cls += ' eliminated';
      else if (active)        cls += ' active';
      if (p.isOnFire)         cls += ' on-fire';
      else if (p.isHeatingUp) cls += ' heating-up';
      if (!p.eliminated && p.lives <= 3) cls += ' low-lives';

      return `<div class="${cls}">
        <span class="p-name">${escapeHtml(p.name)}</span>
        <span class="p-lives-num">${p.lives}</span>
        <span class="p-lives-label">lives</span>
      </div>`;
    }).join('');
  }

  Input.attach(canvas, onFlick);

  // Show setup on load
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');
})();
