// main.js — game loop, wires everything together (loaded last)

(function () {
  const canvas       = document.getElementById('game-canvas');
  const setupScreen  = document.getElementById('setup-screen');
  const gameScreen   = document.getElementById('game-screen');
  const gameOverEl   = document.getElementById('game-over');
  const winnerNameEl = document.getElementById('winner-name');
  const scoreboardEl = document.getElementById('scoreboard');
  const playAgainBtn = document.getElementById('play-again-btn');
  const playerListEl = document.getElementById('player-list');
  const pointCountEl = document.getElementById('point-count');
  const turnBannerEl = document.getElementById('turn-banner');
  const streakBannerEl = document.getElementById('streak-banner');
  const turnTimerEl  = document.getElementById('turn-timer');
  const turnTimerFillEl = document.getElementById('turn-timer-fill');
  const flipHintEl   = document.getElementById('flip-hint');
  const startBtn     = document.getElementById('start-btn');
  const practiceBtn  = document.getElementById('practice-btn');
  const onlineBtn    = document.getElementById('online-btn');
  const onlineScreen = document.getElementById('online-screen');
  const onlineForm   = document.getElementById('online-form');
  const onlineLobby  = document.getElementById('online-lobby');
  const onlineNameEl = document.getElementById('online-name');
  const onlineCodeEl = document.getElementById('online-code');
  const onlineCreateBtn = document.getElementById('online-create-btn');
  const onlineJoinBtn   = document.getElementById('online-join-btn');
  const onlineBackBtn   = document.getElementById('online-back-btn');
  const onlineLeaveBtn  = document.getElementById('online-leave-btn');
  const onlineStartBtn  = document.getElementById('online-start-btn');
  const onlineRoomCodeEl = document.getElementById('online-room-code');
  const onlineStatusEl   = document.getElementById('online-status');
  const onlineRosterEl   = document.getElementById('online-roster');
  const addPlayerBtn = document.getElementById('add-player-btn');
  const playerInputs = document.getElementById('player-inputs');
  const muteBtn      = document.getElementById('mute-btn');
  const recordsPanel = document.getElementById('records-panel');
  const passScreen   = document.getElementById('pass-screen');
  const passCardEl   = document.getElementById('pass-card');
  const passNameEl   = document.getElementById('pass-name');
  const passGoBtn    = document.getElementById('pass-go-btn');
  const gameStatsEl  = document.getElementById('game-stats');
  const menuBtn      = document.getElementById('menu-btn');
  const homeBtn      = document.getElementById('home-btn');

  // ── Sizing ─────────────────────────────────────────────────────────────────
  // Scale the backing store by devicePixelRatio so everything is crisp on a
  // hi-DPI smartboard. We draw in LOGICAL (CSS) pixels — the transform maps
  // them to physical pixels — so physics/renderer keep using logical coords.
  function stageBottomInset() {
    return Math.min(150, Math.max(92, Math.round(window.innerHeight * 0.18)));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2 (fill-rate)
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    Renderer.resize(w, h);
    scheduleReflow();
  }

  // Re-fit the physics world to the new size (debounced). Without this, the
  // floor + walls keep their original dimensions after a resize/orientation
  // change and the bottle flips against an off-screen floor. Re-place the
  // bottle only when it's at rest (not mid-flight), so a stray resize can't
  // void an in-progress flip.
  let reflowTimer = null;
  // Editions may bring their own physics (see Skins.physicsFor / skins.js META).
  // Applied per turn, so one player can be flipping a bottle while the next
  // takes a bank shot with the alien. Must run AFTER Physics.resetBottle, which
  // rebuilds the body.
  function applyTurnPhysics() {
    if (!Physics.setProfile) return;
    const skin = (game && game.currentPlayer && game.currentPlayer()?.skin) || 'bottle';
    Physics.setProfile(window.Skins && Skins.physicsFor ? Skins.physicsFor(skin) : null);
  }

  function scheduleReflow() {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => {
      if (!gameStarted) return;
      Physics.reflow(window.innerWidth, window.innerHeight, stageBottomInset());
      // B2: only re-place the bottle when one is genuinely at rest — never mid-flick
      // (a stray resize must not reset a bottle in flight and void it as a MISS).
      if (!evaluating &&
          (game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE)) {
        Physics.resetBottle();
        applyTurnPhysics();
      }
    }, 150);
  }
  window.addEventListener('resize', resize);

  // ── Flavors (liquid color = whose turn it is) ───────────────────────────────
  // Pun-forward names, each riffing on its color. Ordered so the first 8
  // (max players) are maximally distinct colors. NB: skins.js name rosters and
  // FLAVOR_ORDER are index-aligned to this list — keep the colors in place.
  const FLAVORS = [
    { name: 'Blue Steel',       color: '#1f9bff' },
    { name: 'Sucker Punch',     color: '#e3263c' },
    { name: 'Lime Light',       color: '#8ed11a' },
    { name: 'Orange Crush',     color: '#ff7a00' },
    { name: 'Grape Expectations', color: '#8a3ffc' },
    { name: 'Ice Ice Baby',     color: '#5fcfe6' },
    { name: 'Apple-solutely',   color: '#3fae1a' },
    { name: 'Berry Nice',       color: '#ff5b86' },
    { name: 'Making Waves',     color: '#4f63e0' },
    { name: 'Lemon Aid',        color: '#ffc233' },
    { name: 'Very Cherry',      color: '#c8203a' },
    { name: 'Pink Fluff',       color: '#ff9ecf' },
  ];

  // ── Player setup rows (name + flavor picker + Human/CPU) ────────────────────
  let playerCount = 2;

  function swatchesHtml(sel) {
    return FLAVORS.map((f, i) =>
      `<button type="button" class="flavor-swatch${i === sel ? ' selected' : ''}" data-idx="${i}" style="background:${f.color}" title="${f.name}"></button>`
    ).join('');
  }

  // ── Skins (flippable editions: bottle, parrot, …) ───────────────────────────
  // A fully-themed port (e.g. the parrot site) sets window.FLIP_FORCE_SKIN to
  // force one edition and hide the picker. Otherwise players choose per-row once
  // an edition is unlocked (see Records.unlockSkin).
  const FORCE_SKIN = (typeof window !== 'undefined' && window.FLIP_FORCE_SKIN) || null;

  // The default player name for a given skin + flavor index — bottle (or any
  // skin without its own roster) falls back to the flavor name; a skin with a
  // `names` list (see skins.js) uses the name at the SAME index, so the color
  // picked doesn't change when the skin does.
  function defaultNameFor(skin, flavorIdx) {
    const names = window.Skins && Skins.namesFor ? Skins.namesFor(skin) : null;
    return (names && names[flavorIdx]) || FLAVORS[flavorIdx].name;
  }

  function availableSkins() {
    const all = window.Skins ? Skins.list() : [{ id: 'bottle', name: 'Bottle', emoji: '🍾' }];
    return all.filter(s => s.id === 'bottle' || Records.isSkinUnlocked(s.id));
  }
  function skinChoiceHtml(sel) {
    const list = availableSkins();
    if (FORCE_SKIN || list.length < 2) return '';   // nothing to choose yet
    return '<div class="skin-picker">' + list.map(s =>
      `<button type="button" class="skin-choice${s.id === sel ? ' selected' : ''}" data-skin="${s.id}">${s.emoji} ${s.name}</button>`
    ).join('') + '</div>';
  }

  function rowHtml(i, def) {
    const skin = def.skin || 'bottle';
    return `<div class="player-input-row" data-flavor="${def.flavor}" data-ai="${def.ai ? 1 : 0}" data-skin="${skin}">
      <div class="prow-top">
        <canvas class="skin-preview" width="76" height="92" aria-hidden="true"></canvas>
        <span class="player-num" style="color:${FLAVORS[def.flavor].color}">P${i + 1}</span>
        <input type="text" placeholder="${escapeHtml(defaultNameFor(skin, def.flavor))}" maxlength="14" value="${escapeHtml(def.name)}">
        <button type="button" class="ai-toggle${def.ai ? ' cpu' : ''}" title="Tap to switch Human / CPU">${def.ai ? 'CPU' : 'Human'}</button>
        ${i >= 2 ? '<button type="button" class="remove-player-btn" title="Remove">✕</button>' : ''}
      </div>
      <div class="flavor-picker">${swatchesHtml(def.flavor)}</div>
      ${skinChoiceHtml(skin)}
    </div>`;
  }

  function readRows() {
    return [...playerInputs.querySelectorAll('.player-input-row')].map(row => ({
      name: row.querySelector('input').value,
      flavor: parseInt(row.dataset.flavor) || 0,
      ai: row.dataset.ai === '1',
      skin: row.dataset.skin || 'bottle',
    }));
  }

  // Live "what am I flipping" thumbnail on each setup row. Call after anything
  // that changes a row's skin or color.
  function paintRowPreview(row) {
    // NB: renderer.js declares `const Renderer`, which lives in script scope
    // and never lands on `window` — checking window.Renderer here silently
    // skips every preview.
    const cv = row && row.querySelector('.skin-preview');
    if (!cv || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
    const idx = parseInt(row.dataset.flavor) || 0;
    Renderer.drawPreview(cv, row.dataset.skin || 'bottle', FLAVORS[idx].color);
  }
  function paintAllPreviews() {
    playerInputs.querySelectorAll('.player-input-row').forEach(paintRowPreview);
  }

  function renderFrom(defs) {
    playerCount = defs.length;
    playerInputs.innerHTML = defs.map((d, i) => rowHtml(i, d)).join('');
    addPlayerBtn.disabled = playerCount >= 8;
    paintAllPreviews();
  }

  function addPlayerInput() {
    if (playerCount >= 8) return;
    const defs = readRows();
    const fl = defs.length % FLAVORS.length;
    defs.push({ name: FLAVORS[fl].name, flavor: fl, ai: false });
    renderFrom(defs);
  }

  // event delegation: flavor select, AI toggle, remove
  playerInputs.addEventListener('click', (e) => {
    const sw = e.target.closest('.flavor-swatch');
    if (sw) {
      const row = sw.closest('.player-input-row');
      const oldIdx = +row.dataset.flavor, newIdx = +sw.dataset.idx;
      const skin = row.dataset.skin || 'bottle';
      const input = row.querySelector('input');
      // The name follows the flavor's default name for the CURRENT skin,
      // unless the player typed a custom one.
      if (!input.value.trim() || input.value.trim() === defaultNameFor(skin, oldIdx)) {
        input.value = defaultNameFor(skin, newIdx);
      }
      row.dataset.flavor = newIdx;
      row.querySelectorAll('.flavor-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      row.querySelector('.player-num').style.color = FLAVORS[newIdx].color;
      input.placeholder = defaultNameFor(skin, newIdx);
      paintRowPreview(row);
      return;
    }
    const ai = e.target.closest('.ai-toggle');
    if (ai) {
      const row = ai.closest('.player-input-row');
      const on = row.dataset.ai === '1';
      row.dataset.ai = on ? '0' : '1';
      ai.textContent = on ? 'Human' : 'CPU';
      ai.classList.toggle('cpu', !on);
      return;
    }
    const sk = e.target.closest('.skin-choice');
    if (sk) {
      const row = sk.closest('.player-input-row');
      const oldSkin = row.dataset.skin || 'bottle';
      const newSkin = sk.dataset.skin;
      const idx = +row.dataset.flavor;
      const input = row.querySelector('input');
      // Same rule as the flavor swatch: the name follows the skin's default
      // unless the player typed a custom one.
      if (!input.value.trim() || input.value.trim() === defaultNameFor(oldSkin, idx)) {
        input.value = defaultNameFor(newSkin, idx);
      }
      input.placeholder = defaultNameFor(newSkin, idx);
      row.dataset.skin = newSkin;
      row.querySelectorAll('.skin-choice').forEach(s => s.classList.remove('selected'));
      sk.classList.add('selected');
      paintRowPreview(row);
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
    return rows.map((r) => {
      const skin = FORCE_SKIN || r.skin || 'bottle';
      return {
        name: (r.name || '').trim() || defaultNameFor(skin, r.flavor),
        color: FLAVORS[r.flavor].color,
        isAI: r.ai,
        skin,
      };
    });
  }
  function chosenDifficulty() {
    return document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
  }
  function chosenStartingLives() {
    const v = parseInt(document.querySelector('input[name="starting-lives"]:checked')?.value || '10', 10);
    return [3, 5, 10, 20, 100].includes(v) ? v : 10;
  }

  // ── Start game ─────────────────────────────────────────────────────────────
  // ── Immersive mode: fullscreen + keep the screen awake (panel ergonomics) ──
  // Best-effort + feature-detected; only works from a user gesture (the Start /
  // Practice / Play-Again taps) and silently no-ops where unsupported (e.g. the
  // bundled APK, which is already fullscreen + awake).
  let wakeLock = null;
  async function enterImmersive() {
    const el = document.documentElement;
    const reqFS = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    try { if (reqFS && !document.fullscreenElement) await reqFS.call(el); } catch (e) {}
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }
    catch (e) { wakeLock = null; }
  }
  // Wake locks auto-release when the tab is hidden — re-acquire a held one on return.
  document.addEventListener('visibilitychange', async () => {
    try {
      if (document.visibilityState === 'visible' && wakeLock && wakeLock.released) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {}
  });

  startBtn.addEventListener('click', () => {
    const defs = rowsToDefs(readRows());
    if (defs.length < 2) { alert('Need at least 2 players!'); return; }
    const dir = parseInt(document.querySelector('input[name="direction"]:checked')?.value ?? '1');
    Sound.unlock();   // first user gesture — unlock audio
    onlineMode = false;
    if (window.Net) Net.leave();
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame(defs, dir, {
      difficulty: chosenDifficulty(),
      startingLives: chosenStartingLives(),
      newMatch: true,
    });
  });

  // ── Practice (solo, no lives) ───────────────────────────────────────────────
  practiceBtn.addEventListener('click', () => {
    const r0 = readRows()[0] || { name: 'You', flavor: 0 };
    const def = { name: (r0.name || '').trim() || 'You', color: FLAVORS[r0.flavor].color, isAI: false,
                  skin: FORCE_SKIN || r0.skin || 'bottle' };
    Sound.unlock();
    onlineMode = false;
    if (window.Net) Net.leave();
    enterImmersive();
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame([def], 1, {
      practice: true,
      startingLives: chosenStartingLives(),
      newMatch: true,
    });
  });

  playAgainBtn.addEventListener('click', () => {
    enterImmersive();
    gameOverEl.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (onlineMode) {
      // Online rematch: only the host can kick off; others wait for start.
      if (window.Net && Net.isHost) {
        const defs = game.players.map(p => ({
          name: p.name, color: p.color, isAI: false,
          skin: FORCE_SKIN || p.skin || 'bottle', netId: p.netId,
        }));
        const payload = { defs, direction: game.direction, startingLives: game.startingLives, startIndex: game.winnerIndex };
        Net.startMatch(payload);
        startGame(defs, game.direction, {
          difficulty: 'medium',
          startingLives: game.startingLives,
          startIndex: game.winnerIndex,
        });
      } else if (onlineStatusEl) {
        // Non-host waits — Net.on('start') will fire beginOnlineMatch path via startGame
        // Re-show a tiny waiting state on the game-over card label.
        playAgainBtn.textContent = 'Waiting for host…';
      }
      return;
    }
    if (game.practice) {
      startGame(
        [{ name: game.players[0].name, color: game.players[0].color, isAI: false,
           skin: FORCE_SKIN || game.players[0].skin || 'bottle' }],
        1,
        { practice: true, startingLives: game.startingLives }
      );
    } else {
      const defs = game.players.map(p => ({ name: p.name, color: p.color, isAI: p.isAI,
                                            skin: FORCE_SKIN || p.skin || 'bottle' }));
      // Winner starts the next game (by index — robust to duplicate names).
      startGame(defs, game.direction, {
        difficulty: game.difficulty,
        startingLives: game.startingLives,
        startIndex: game.winnerIndex,
      });
    }
  });

  // initial two rows — names default to the flavor (overridable)
  renderFrom([
    { name: FLAVORS[0].name, flavor: 0, ai: false },
    { name: FLAVORS[1].name, flavor: 1, ai: false },
  ]);

  // ── Game loop state ────────────────────────────────────────────────────────
  let lastTime    = 0;
  let loopId      = null;
  let evaluating  = false;
  let showGlow    = false;
  let resultTimer = 0;
  let resultAlpha = 0;
  let aiTimer     = null;
  let elimTimer   = null;
  let gameStarted = false;
  let intenseTurn = false;   // "make it or break it" — a miss this flip eliminates the player
  let matchWins   = [];      // wins per player across the current series (by index)
  let gameStats   = null;    // per-game stats (reset each game), shown on game-over
  let timerActive = false, turnTimeLeft = 0, turnTimeLimit = 0, timedOut = false;
  let lastFlickPower = null;   // 0..1 strength of the current flip's flick (achievements)
  let greatSaveActive = false; // the RESULT being shown is a rare Great Save
  let onlineMode = false;      // playing via Net rooms
  let netAuthority = false;    // this client owns the current flick's verdict
  let pendingNetResult = null; // authoritative result waiting to apply
  const RESULT_MS = 1500;
  const TURN_SECONDS = 10, FIRE_SECONDS = 4;   // flip clock (less when ON FIRE)
  // Worst grounded tilt (rad) a MAKE must have survived to count as a Great
  // Save. FALLEN_ANGLE in physics.js is 1.20 — beyond ~1.0 the bottle is deep
  // in the teeter zone and almost never recovers, so this fires roughly
  // once-in-a-thousand flips: exactly the freak comeback worth celebrating.
  const GREAT_SAVE_TILT = 1.0;

  // Per-turn flip clock — only for HUMAN turns (CPU flicks on its own ~1.1s).
  function startTurnTimer(seconds) {
    turnTimeLimit = turnTimeLeft = seconds;
    timerActive = true;
    turnTimerEl.classList.add('active');
    updateTimerBar();
  }
  function stopTurnTimer() {
    timerActive = false;
    turnTimerEl.classList.remove('active');
  }
  function updateTimerBar() {
    const frac = Math.max(0, turnTimeLeft / turnTimeLimit);
    turnTimerFillEl.style.width = (frac * 100) + '%';
    // green → amber → red as it drains
    turnTimerFillEl.style.background =
      frac > 0.5 ? 'var(--make)' : frac > 0.25 ? 'var(--heat)' : 'var(--miss)';
  }
  // Ran out of time → forfeit the flip as a miss (you had your window).
  function onTimeout() {
    stopTurnTimer();
    timedOut = true;
    Input.disable();
    flipHintEl.classList.add('hidden');
    evaluating = false;
    Sound.play('miss');
    game.resolveFlip('MISS');
  }

  function clearTimers() { clearTimeout(aiTimer); clearTimeout(elimTimer); clearTimeout(gameOverTimer); }

  function landingMeta(landingInfo = null) {
    return {
      perfect: !!(landingInfo && landingInfo.perfect),
    };
  }

  // CPU takes its turn: aim near the sweet-spot flick, with error set by difficulty.
  function aiFlick() {
    if (game.state !== GAME_STATES.TURN_START && game.state !== GAME_STATES.ON_FIRE) return;
    const sigma = { easy: 1000, medium: 400, hard: 220 }[game.difficulty] || 400;
    const u1 = Math.random() || 1e-6, u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const up = Math.max(500, 2100 + gauss * sigma);   // sweet spot ~2100 px/s
    const vx = (Math.random() - 0.5) * 420;           // slight lean
    onFlick(vx, -up);
  }

  function startGame(defs, dir, opts) {
    clearTimers();
    Sound.setSuddenDeath(false);
    passScreen.classList.add('hidden');
    Renderer.init(canvas);
    Renderer.setReduceMotion(reduceMotionActive());
    if (window.Skins) Skins.preload(defs.map(d => d.color));   // warm skin sprites
    resize();   // sets DPR transform + renderer logical dims (must run after init)
    Physics.init(window.innerWidth, window.innerHeight, stageBottomInset());  // logical coords

    game.on(GAME_STATES.TURN_START, onTurnStart);
    game.on(GAME_STATES.RESULT,     onResult);
    game.on(GAME_STATES.ON_FIRE,    onOnFire);
    game.on(GAME_STATES.ELIMINATED, onEliminated);
    game.on(GAME_STATES.GAME_OVER,  onGameOver);

    game.init(defs, dir, opts || {});
    gameStarted = true;
    gameStats = {
      topStake: 0, longestFire: 0, sawSuddenDeath: false,
      perPlayer: game.players.map(() => ({ makes: 0, flips: 0, bestStreak: 0, lowestLives: Infinity })),
    };
    if (opts && opts.newMatch) matchWins = defs.map(() => 0);   // fresh series

    if (loopId) cancelAnimationFrame(loopId);
    lastTime = performance.now();
    loop(lastTime);
  }

  // Playback speed: AI turns run fast, and once every human is out we blitz to
  // the end so the all-CPU finish + stats come up quickly. 1 = real-time.
  function gameSpeed() {
    if (game.practice) return 1;
    const humansLeft = game.players.some(p => !p.eliminated && !p.isAI);
    if (!humansLeft) return 25;            // all humans out → fast-forward to the end
    const cur = game.currentPlayer();
    if (cur && cur.isAI) return 4;         // an AI is shooting → speed it up
    return 1;
  }

  function syncSuddenDeathAudio() {
    const active = gameStarted &&
      !game.practice &&
      game.state !== GAME_STATES.GAME_OVER &&
      game.inSuddenDeath();
    Sound.setSuddenDeath(active, game.sdLevel());
  }

  function loop(now) {
    // Stop stepping/rendering once the game is over (the game-over screen is a
    // plain HTML overlay). startGame() restarts the loop for the next game.
    if (game.state === GAME_STATES.GAME_OVER) {
      Sound.setSuddenDeath(false);
      loopId = null;
      return;
    }
    loopId = requestAnimationFrame(loop);
    syncSuddenDeathAudio();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // "Time stands still": slow the bottle's FLIGHT during a make-or-break flip.
    // Only while airborne — once it nears the table we resume normal speed so the
    // settle/landing detection (frame-based) is unaffected.
    const speed = gameSpeed();
    let stepDt = dt;
    // Make-or-break slow-mo only in real-time (human) turns — never while fast-forwarding.
    if (speed === 1 && intenseTurn && evaluating) {
      const b = Physics.getBottle();
      if (b && b.position.y < Physics.getGroundY() - 70) stepDt = dt * 0.4;
    }
    // Run `speed` physics sub-steps this frame (fast-forward AI / all-CPU turns).
    // Each sub-step uses a normal dt so the sim stays stable, and landing is polled
    // per sub-step so verdicts + settle/cap windows behave identically at any speed.
    for (let s = 0; s < speed; s++) {
      Physics.step(stepDt);
      if (evaluating) {
        // Remote peers may receive the authoritative verdict before local settle.
        if (pendingNetResult) {
          const forced = Physics.forceLanding
            ? Physics.forceLanding(pendingNetResult.result, pendingNetResult.info)
            : pendingNetResult.result;
          pendingNetResult = null;
          evaluating = false;
          showGlow = forced === 'MAKE';
          game.resolveFlip(forced, landingMeta(Physics.getLastLandingInfo()));
          break;
        }
        const result = Physics.checkLanding();
        if (result) {
          evaluating = false;
          showGlow   = result === 'MAKE';
          const landingInfo = Physics.getLastLandingInfo();
          if (onlineMode && netAuthority && window.Net) {
            Net.sendResult({
              result,
              info: {
                tilt: landingInfo && landingInfo.tilt,
                perfect: !!(landingInfo && landingInfo.perfect),
                reason: landingInfo && landingInfo.reason,
                maxTilt: landingInfo && landingInfo.maxTilt,
              },
              playerId: Net.selfId,
            });
          }
          netAuthority = false;
          game.resolveFlip(result, landingMeta(landingInfo));
          break;
        }
      }
    }

    // Per-turn flip clock (human turns only) — runs out → forfeited miss
    if (timerActive && !evaluating &&
        (game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE)) {
      turnTimeLeft -= dt;
      updateTimerBar();
      if (turnTimeLeft <= 0) onTimeout();
    }

    // Result countdown + fade
    if (game.state === GAME_STATES.RESULT) {
      resultTimer -= dt * 1000 * speed;
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
      specialLabel: game.state === GAME_STATES.RESULT && greatSaveActive ? '🧤 THE GREAT SAVE!' : null,
      showGlow,
      isOnFire:    !!(game.onFirePlayer),
      liquidColor: game.currentPlayer()?.color,
      skin:        game.currentPlayer()?.skin,
      intense:     intenseTurn,
      suddenDeath: game.inSuddenDeath(),
      awaitingFlick: game.state === GAME_STATES.TURN_START || game.state === GAME_STATES.ON_FIRE,
      stake:       game.pointCount,
      // Both null unless the active edition runs a bounce profile.
      target:      Physics.getTarget ? Physics.getTarget() : null,
      obstacles:   Physics.getObstacles ? Physics.getObstacles() : null,
      view:        Physics.getViewHint ? Physics.getViewHint() : null,
    });
  }

  // ── State callbacks ────────────────────────────────────────────────────────
  // Arm a human's turn: show the hint, fire the make-or-break sting (timed to
  // when the player is actually ready), enable input, start the flip clock.
  function armHumanTurn() {
    passScreen.classList.add('hidden');
    flipHintEl.classList.remove('hidden');
    if (intenseTurn) Sound.play('tension');
    Input.enable();
    startTurnTimer(TURN_SECONDS);
  }

  // Big flavor-colored "PASS TO {name}" handoff card (a deferred-input gate).
  function showPassGate(p) {
    passNameEl.textContent = p.name;
    passNameEl.style.color = p.color;
    passCardEl.style.borderColor = p.color;
    passScreen.classList.remove('hidden');
  }

  function onTurnStart() {
    evaluating  = false;
    showGlow    = false;
    resultAlpha = 0;
    intenseTurn = false;
    timedOut    = false;
    greatSaveActive = false;
    lastFlickPower  = null;
    stopTurnTimer();
    clearTimeout(aiTimer);
    passScreen.classList.add('hidden');
    Physics.resetBottle();
    applyTurnPhysics();
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

    intenseTurn = game.missWouldEliminate();   // make-it-or-break-it
    pointCountEl.textContent = '';   // stake shown big on the canvas (drawStake)

    if (p.isAI) {
      turnBannerEl.textContent = `${p.name}'s turn · CPU`;
      if (intenseTurn) Sound.play('tension');
      Input.disable();
      flipHintEl.classList.add('hidden');
      aiTimer = setTimeout(aiFlick, 1100 / gameSpeed());
      updateHUD();
      return;
    }

    turnBannerEl.textContent = `${p.name}'s turn`;
    updateHUD();

    // Online: only the peer whose netId matches can flick; everyone else watches.
    if (onlineMode && window.Net) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      passScreen.classList.add('hidden');
      if (p.netId === Net.selfId) {
        turnBannerEl.textContent = `${p.name}'s turn · YOU`;
        armHumanTurn();
      } else {
        turnBannerEl.textContent = `${p.name}'s turn · waiting…`;
      }
      return;
    }

    // "PASS TO {name}" handoff card — only with >2 players still alive (with 2
    // it's obvious whose turn it is). Defers input + flip clock + the tension
    // sting until the new player taps "Tap to flip".
    if (game.activePlayers().length > 2) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      showPassGate(p);
    } else {
      armHumanTurn();
    }
  }

  function onOnFire() {
    evaluating  = false;
    showGlow    = false;
    timedOut    = false;
    greatSaveActive = false;
    lastFlickPower  = null;
    stopTurnTimer();
    clearTimeout(aiTimer);
    passScreen.classList.add('hidden');
    Physics.resetBottle();
    applyTurnPhysics();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    intenseTurn = game.missWouldEliminate();   // only in sudden death (ON FIRE miss is otherwise free)
    if (intenseTurn) Sound.play('tension');
    turnBannerEl.textContent  = `🔥 ${p.name} IS ON FIRE!`;
    streakBannerEl.textContent = `+${game.onFireBonus} lives earned`;
    streakBannerEl.className   = 'streak-banner on-fire';
    pointCountEl.textContent   = '';
    if (p.isAI) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      aiTimer = setTimeout(aiFlick, 1000 / gameSpeed());
    } else if (onlineMode && window.Net) {
      Input.disable();
      flipHintEl.classList.add('hidden');
      if (p.netId === Net.selfId) {
        Input.enable();
        flipHintEl.classList.remove('hidden');
        startTurnTimer(FIRE_SECONDS);
      }
    } else {
      Input.enable();
      startTurnTimer(FIRE_SECONDS);   // tighter clock when ON FIRE
    }
    updateHUD();
  }

  function onResult() {
    Input.disable();
    stopTurnTimer();
    passScreen.classList.add('hidden');
    flipHintEl.classList.add('hidden');
    resultTimer = RESULT_MS;

    // Rare-event + achievement wiring (display-only, never touches the rules).
    const landing = Physics.getLastLandingInfo();
    greatSaveActive = !!(game.lastResult === 'MAKE' && landing &&
                         landing.maxTilt > GREAT_SAVE_TILT);
    const rec = Records.recordFlip(game, { greatSave: greatSaveActive });
    if (greatSaveActive) Sound.play('greatsave');

    const p = game.currentPlayer();

    if (!game.practice && gameStats) {
      const pp = gameStats.perPlayer[game.currentPlayerIndex];
      const st = p ? p.streak : 0;
      if (pp) {
        pp.flips++;
        if (game.lastResult === 'MAKE') pp.makes++;
        if (st > pp.bestStreak) pp.bestStreak = st;
        if (p) pp.lowestLives = Math.min(pp.lowestLives, p.lives);
      }
      if (game.pointCount > gameStats.topStake) gameStats.topStake = game.pointCount;
      if (game.onFireBonus > gameStats.longestFire) gameStats.longestFire = game.onFireBonus;
      if (game.inSuddenDeath && game.inSuddenDeath()) gameStats.sawSuddenDeath = true;
    }

    // NB: achievements.js declares `const Achievements` (script scope, not on
    // window) — same gotcha as Renderer above, so feature-detect via typeof.
    if (typeof Achievements !== 'undefined') {
      const fresh = Achievements.check({
        result:        game.lastResult,
        justIgnited:   game.justIgnited,
        onFireBonus:   game.onFireBonus,
        streak:        game.practice ? game.practiceStreak : (p ? p.streak : 0),
        pointCount:    game.pointCount,
        perfect:       !!game.perfectLanding,
        power:         lastFlickPower,
        greatSave:     greatSaveActive,
        landingReason: landing ? landing.reason : null,
        padOffset: landing && landing.padOffset != null ? landing.padOffset : null,
        totalFlipsLifetime: rec.totalFlips,
        totalMakesLifetime: rec.totalMakes,
      });
      announceAchievements(fresh);
    }

    if (game.practice) {
      if (game.lastResult === 'MAKE') {
        streakBannerEl.textContent = game.practiceStreak > 1
          ? `${game.practiceStreak} in a row!`
          : (game.perfectLanding ? 'Perfect make!' : 'Make!');
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
      if (greatSaveActive) {
        // The freak comeback — celebrate over everything else this flip.
        streakBannerEl.textContent = '🧤 THE GREAT SAVE! It came back from the brink!';
        streakBannerEl.className   = 'streak-banner on-fire';
      } else if (game.fireCapped) {
        // Big-lobby ON FIRE cap — banked the gains, pass it on
        streakBannerEl.textContent = '🔥 Fire maxed — pass it on!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.onFireGain > 0) {
        // ON FIRE bonus make — gained a life
        streakBannerEl.textContent = `🔥 +1 life!  (+${game.onFireBonus} total)`;
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('life');
      } else if (game.justIgnited) {
        streakBannerEl.textContent = '🔥 ON FIRE!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('ignite');
      } else if (p.isOnFire) {
        // On fire but at the match life cap — no life granted, so don't claim one
        streakBannerEl.textContent = '🔥 Maxed out!';
        streakBannerEl.className   = 'streak-banner on-fire';
        Sound.play('make');
      } else if (p.isHeatingUp) {
        streakBannerEl.textContent = '🌡 Heating up!';
        streakBannerEl.className   = 'streak-banner heating-up';
        Sound.play('make');
      } else {
        streakBannerEl.textContent = game.perfectLanding ? 'Perfect landing!' : '';
        streakBannerEl.className   = game.perfectLanding ? 'streak-banner heating-up' : 'streak-banner';
        Sound.play('make');
      }
    } else if (game.fireEnded) {
      // ON FIRE ended on a miss — no penalty
      streakBannerEl.textContent = timedOut ? '⏱ Out of time — streak over' : '🔥 Streak over — no penalty';
      streakBannerEl.className   = 'streak-banner on-fire';
      Sound.play('miss');
    } else {
      const n = game.lastPenalty;
      const lives = `${n} ${n === 1 ? 'life' : 'lives'}`;
      streakBannerEl.textContent = timedOut ? `⏱ Out of time!  −${lives}` : `−${lives}`;
      streakBannerEl.className   = 'streak-banner miss-penalty';
      Sound.play('miss');
    }

    updateHUD();
  }

  function onEliminated() {
    passScreen.classList.add('hidden');
    const p = game.currentPlayer();
    turnBannerEl.textContent = `❌ ${p.name} is out!`;
    updateHUD();
    clearTimeout(elimTimer);
    elimTimer = setTimeout(() => game.advanceTurn(), 1800 / gameSpeed());
  }

  // Lightweight toast (self-creating so it needs no markup). Used for unlocks.
  function showToast(msg) {
    let t = document.getElementById('skin-toast');
    if (!t) { t = document.createElement('div'); t.id = 'skin-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 4000);
  }

  function announceAchievements(fresh) {
    if (!fresh || !fresh.length) return;
    const names = fresh.map((a) => `${a.emoji} ${a.name}`).join(' · ');
    showToast(`🏅 Achievement${fresh.length > 1 ? 's' : ''} unlocked: ${names}`);
    Sound.play(fresh.some((a) => a.rare) ? 'greatsave' : 'life');
    renderRecordsPanel();
  }

  function renderRecordsPanel() {
    if (!recordsPanel) return;
    recordsPanel.innerHTML = Records.renderHtml() +
      (typeof Achievements !== 'undefined' ? Achievements.renderGridHtml() : '');
  }

  // The finale deserves a beat. When the game-ending flip eliminates the last
  // opponent, game.js jumps straight from RESULT to GAME_OVER and skips the
  // usual "X is out!" elimination banner — so the winner card used to slam in
  // the instant the object stopped moving. Hold on the settled scene (with the
  // elimination beat) for a moment of suspense before the reveal. Display-only.
  const GAME_OVER_HOLD_MS = 1500;
  let gameOverTimer = null;

  function onGameOver() {
    clearTimers();   // no stray advanceTurn/AI flick fires after the game ends
    Sound.setSuddenDeath(false);
    stopTurnTimer();
    Input.disable();
    passScreen.classList.add('hidden');

    const active = game.activePlayers();
    const loser  = game.currentPlayer();
    const finalElim = !game.practice && !!(loser && loser.eliminated);
    if (finalElim) {
      turnBannerEl.textContent = `❌ ${loser.name} is out!`;
      Sound.play('miss');
    }
    // All-CPU blitz endings shouldn't sit through the theatrical pause.
    const humansPlayed = game.players.some((p) => !p.isAI);
    const holdMs = (finalElim && humansPlayed ? GAME_OVER_HOLD_MS : 400) / gameSpeed();

    clearTimeout(gameOverTimer);
    gameOverTimer = setTimeout(() => {
      gameScreen.classList.add('hidden');
      gameOverEl.classList.remove('hidden');
      winnerNameEl.textContent = active.length ? active[0].name : '???';
      const winRec = Records.recordWin(active.length ? active[0].name : null);
      renderRecordsPanel();
      // Skin unlock ladder: each edition's `unlock` is a total-win threshold
      // (see skins.js META). Check every skin, not just one — a device that
      // jumps several wins at once (e.g. a long practice-free session) can
      // cross more than one threshold in the same game-over.
      if (active.length && window.Skins) {
        const wins = Records.totalWins();
        const newlyUnlocked = Skins.list().filter((s) => {
          const need = Skins.unlockRule(s.id);
          return typeof need === 'number' && wins >= need && Records.unlockSkin(s.id);
        });
        if (newlyUnlocked.length) {
          const names = newlyUnlocked.map((s) => `${s.emoji} ${s.name}`).join(', ');
          showToast(`${names} unlocked! Pick per player in setup.`);
          try { renderFrom(readRows()); } catch (_) {}
        }
      }
      Sound.play('win');

      // Win-based achievements (display-only).
      if (typeof Achievements !== 'undefined' && active.length && gameStats) {
        const winner = active[0];
        const wIdx = game.players.indexOf(winner);
        const pp = (gameStats.perPlayer && gameStats.perPlayer[wIdx]) || { makes: 0, flips: 0, lowestLives: Infinity };
        announceAchievements(Achievements.check({
          won:              true,
          wonWithoutMiss:   pp.flips > 0 && pp.makes === pp.flips,
          droppedToOneLife: pp.lowestLives <= 1,
          sawSuddenDeath:   !!gameStats.sawSuddenDeath,
          winnerWins:       (winRec && winRec.mostWins && winRec.mostWins[winner.name]) || 0,
        }));
      }

      // Series scoreboard: tally this game's win, then show the running totals.
      if (matchWins.length !== game.players.length) matchWins = game.players.map(() => 0);
      if (game.winnerIndex >= 0 && game.winnerIndex < matchWins.length) matchWins[game.winnerIndex]++;
      renderScoreboard();
      if (gameStatsEl) gameStatsEl.innerHTML = renderGameStats();
    }, holdMs);
  }

  // Per-game stats on the game-over screen (this match, not all-time): each
  // player's make %, plus the game's peak stake and longest ON FIRE run.
  function renderGameStats() {
    if (!gameStats) return '';
    const rows = game.players.map((p, i) => {
      const pp = (gameStats.perPlayer && gameStats.perPlayer[i]) || { makes: 0, flips: 0, bestStreak: 0 };
      const pct = pp.flips ? Math.round(pp.makes / pp.flips * 100) : 0;
      return `<div class="gs-row">
        <span class="score-dot" style="background:${p.color}"></span>
        <span class="gs-name">${escapeHtml(p.name)}</span>
        <span class="gs-pct">${pct}%</span>
        <span class="gs-sub">${pp.makes}/${pp.flips} · 🔥${pp.bestStreak}</span>
      </div>`;
    }).join('');
    const cells = [
      ['⚡', 'Top stake',    '×' + gameStats.topStake],
      ['🔥', 'Longest fire', '+' + gameStats.longestFire],
    ];
    const grid = cells.map(([i, k, v]) =>
      `<div class="rec-item"><span class="rec-val">${v}</span><span class="rec-key">${i} ${k}</span></div>`).join('');
    return `<div class="gs-title">This game</div><div class="gs-players">${rows}</div>` +
           `<div class="records-grid gs-grid2">${grid}</div>`;
  }

  function renderScoreboard() {
    const total = matchWins.reduce((a, c) => a + c, 0);
    if (total < 1) { scoreboardEl.innerHTML = ''; return; }
    const max = Math.max(...matchWins);
    const rows = game.players
      .map((p, i) => ({ p, w: matchWins[i] || 0 }))
      .sort((a, b) => b.w - a.w)
      .map(({ p, w }) => `
        <div class="score-row${w === max && w > 0 ? ' leader' : ''}">
          <span class="score-dot" style="background:${p.color}"></span>
          <span class="score-name">${escapeHtml(p.name)}</span>
          <span class="score-wins">${w}</span>
        </div>`).join('');
    scoreboardEl.innerHTML = `<div class="sb-title">Series — ${total} ${total === 1 ? 'game' : 'games'}</div>${rows}`;
  }

  // ── Flick ──────────────────────────────────────────────────────────────────
  function launchFlick(vx, vy, seed, asAuthority) {
    if (evaluating) return;
    if (game.state !== GAME_STATES.TURN_START &&
        game.state !== GAME_STATES.ON_FIRE) return;

    evaluating = true;
    netAuthority = !!asAuthority;
    pendingNetResult = null;
    stopTurnTimer();
    Input.disable();
    flipHintEl.classList.add('hidden');
    Sound.unlock();
    Sound.play('flick');
    lastFlickPower = Math.min(Math.max(0, -vy) / 4000, 1);
    Physics.applyFlick(vx, vy, seed);
    game.setState(GAME_STATES.EVALUATING);
  }

  function onFlick(vx, vy) {
    // Online: only the current player may flick, and only on their device.
    if (onlineMode && window.Net) {
      const cur = game.currentPlayer();
      if (!cur || cur.netId !== Net.selfId) return;
      const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      Net.sendFlick({ vx, vy, seed, playerId: Net.selfId });
      launchFlick(vx, vy, seed, true);
      return;
    }
    launchFlick(vx, vy, undefined, false);
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
      if (game.maxLives >= 100) cls += ' marathon-lives';

      return `<div class="${cls}">
        <span class="p-name">${escapeHtml(p.name)}</span>
        <span class="p-lives-num">${p.lives}</span>
        <span class="p-lives-label">lives</span>
      </div>`;
    }).join('');
  }

  // ── Settings / records wiring ───────────────────────────────────────────────
  function reduceMotionActive() {
    return Settings.reduceMotion ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;
  }
  function syncMuteBtn() {
    if (!muteBtn) return;
    muteBtn.textContent = Settings.sound ? '🔊' : '🔇';
    muteBtn.setAttribute('aria-label', Settings.sound ? 'Mute' : 'Unmute');
  }
  if (muteBtn) muteBtn.addEventListener('click', () => {
    const on = !Settings.sound;
    Settings.setSound(on);
    Sound.setMuted(!on);
    if (on) Sound.unlock();
    syncMuteBtn();
  });
  if (passGoBtn) passGoBtn.addEventListener('click', () => {
    passScreen.classList.add('hidden');
    Sound.unlock();
    armHumanTurn();
  });

  // Exit to the main menu (setup): stop the loop + timers, show setup fresh.
  function backToMenu() {
    if (loopId) cancelAnimationFrame(loopId);
    loopId = null;
    clearTimers();
    Sound.setSuddenDeath(false);
    stopTurnTimer();
    Input.disable();
    gameStarted = false;
    onlineMode = false;
    netAuthority = false;
    pendingNetResult = null;
    if (window.Net) Net.leave();
    game.state = GAME_STATES.SETUP;
    gameScreen.classList.add('hidden');
    gameOverEl.classList.add('hidden');
    passScreen.classList.add('hidden');
    if (onlineScreen) onlineScreen.classList.add('hidden');
    renderRecordsPanel();
    setupScreen.classList.remove('hidden');
  }
  if (menuBtn) menuBtn.addEventListener('click', () => {
    if (confirm('Return to the main menu? The current game will end.')) backToMenu();
  });
  if (homeBtn) homeBtn.addEventListener('click', backToMenu);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => Renderer.setReduceMotion(reduceMotionActive());
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  Input.attach(canvas, onFlick);

  // ── Online multiplayer lobby ────────────────────────────────────────────────
  function showOnlineLobby() {
    if (!onlineForm || !onlineLobby) return;
    onlineForm.classList.add('hidden');
    onlineLobby.classList.remove('hidden');
    onlineRoomCodeEl.textContent = Net.roomCode || '----';
    onlineStatusEl.textContent = Net.transport
      ? `Connected via ${Net.transport}${Net.isHost ? ' · you are host' : ''}`
      : 'Connecting…';
    if (onlineStartBtn) onlineStartBtn.classList.toggle('hidden', !Net.isHost);
    renderOnlineRoster();
  }

  function renderOnlineRoster() {
    if (!onlineRosterEl || !window.Net) return;
    const list = Net.roster;
    onlineRosterEl.innerHTML = list.map(p => `
      <div class="online-peer">
        <span class="dot" style="background:${p.color || '#4fc3f7'}"></span>
        <span>${escapeHtml(p.name || 'Player')}</span>
        ${p.host || p.id === (list.find(x => x.host) || {}).id ? '<span class="host-tag">host</span>' : ''}
        ${p.id === Net.selfId ? '<span class="host-tag">you</span>' : ''}
      </div>`).join('') || '<div class="online-status">Waiting for players…</div>';
    if (onlineStartBtn) {
      onlineStartBtn.disabled = list.length < 2;
      onlineStartBtn.textContent = list.length < 2 ? 'Need 2+ players' : 'Start Match';
    }
  }

  function onlinePlayerFromSetup() {
    const rows = readRows();
    const r0 = rows[0] || { name: '', flavor: 0, skin: 'bottle' };
    const name = (onlineNameEl && onlineNameEl.value.trim()) ||
      (r0.name || '').trim() || defaultNameFor(r0.skin || 'bottle', r0.flavor || 0);
    const flavor = Math.min(FLAVORS.length - 1, Math.max(0, r0.flavor || 0));
    return {
      name,
      flavor,
      color: FLAVORS[flavor].color,
      skin: FORCE_SKIN || r0.skin || 'bottle',
    };
  }

  function beginOnlineMatch(defs, dir, opts) {
    onlineMode = true;
    Sound.unlock();
    enterImmersive();
    if (onlineScreen) onlineScreen.classList.add('hidden');
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame(defs, dir || 1, {
      difficulty: 'medium',
      startingLives: (opts && opts.startingLives) || chosenStartingLives(),
      newMatch: true,
    });
  }

  if (onlineBtn && window.Net) {
    onlineBtn.addEventListener('click', () => {
      setupScreen.classList.add('hidden');
      onlineScreen.classList.remove('hidden');
      onlineForm.classList.remove('hidden');
      onlineLobby.classList.add('hidden');
      if (onlineNameEl && !onlineNameEl.value) {
        const r0 = readRows()[0];
        onlineNameEl.value = (r0 && r0.name) || FLAVORS[0].name;
      }
    });

    onlineBackBtn && onlineBackBtn.addEventListener('click', () => {
      Net.leave();
      onlineScreen.classList.add('hidden');
      setupScreen.classList.remove('hidden');
    });

    onlineLeaveBtn && onlineLeaveBtn.addEventListener('click', () => {
      Net.leave();
      onlineLobby.classList.add('hidden');
      onlineForm.classList.remove('hidden');
      onlineStatusEl.textContent = '';
    });

    onlineCreateBtn && onlineCreateBtn.addEventListener('click', async () => {
      try {
        onlineStatusEl.textContent = 'Creating room…';
        await Net.createRoom(onlinePlayerFromSetup());
        showOnlineLobby();
      } catch (e) {
        onlineStatusEl.textContent = 'Could not create room — try ?net=local or a relay.';
        console.error(e);
      }
    });

    onlineJoinBtn && onlineJoinBtn.addEventListener('click', async () => {
      try {
        onlineStatusEl.textContent = 'Joining…';
        await Net.joinRoom(onlineCodeEl.value, onlinePlayerFromSetup());
        showOnlineLobby();
      } catch (e) {
        onlineStatusEl.textContent = e.message || 'Join failed';
        console.error(e);
      }
    });

    onlineStartBtn && onlineStartBtn.addEventListener('click', () => {
      if (!Net.isHost || Net.roster.length < 2) return;
      const defs = Net.roster.map(p => ({
        name: p.name,
        color: p.color,
        isAI: false,
        skin: FORCE_SKIN || p.skin || 'bottle',
        netId: p.id,
      }));
      const payload = {
        defs,
        direction: 1,
        startingLives: chosenStartingLives(),
      };
      Net.startMatch(payload);
      beginOnlineMatch(defs, 1, payload);
    });

    Net.on('roster', () => {
      renderOnlineRoster();
      if (onlineStatusEl && Net.connected) {
        onlineStatusEl.textContent =
          `Connected via ${Net.transport} · ${Net.roster.length} player${Net.roster.length === 1 ? '' : 's'}`;
      }
    });
    Net.on('welcome', () => showOnlineLobby());
    Net.on('start', (msg) => {
      if (Net.isHost) return; // host already started locally
      const defs = (msg.defs || []).map(d => ({ ...d, isAI: false }));
      beginOnlineMatch(defs, msg.direction || 1, msg);
    });
    Net.on('flick', (msg) => {
      if (!onlineMode || !gameStarted) return;
      if (msg.playerId === Net.selfId) return;
      launchFlick(msg.vx, msg.vy, msg.seed, false);
    });
    Net.on('result', (msg) => {
      if (!onlineMode || !gameStarted) return;
      if (msg.playerId === Net.selfId) return;
      pendingNetResult = { result: msg.result, info: msg.info || {} };
    });
    Net.on('disconnected', () => {
      if (onlineStatusEl) onlineStatusEl.textContent = 'Disconnected — reconnecting…';
    });
    Net.on('reconnected', () => {
      if (onlineStatusEl) onlineStatusEl.textContent = 'Reconnected';
    });
  }

  // Apply persisted prefs + render the hall-of-fame
  Sound.setMuted(!Settings.sound);
  Renderer.setReduceMotion(reduceMotionActive());
  syncMuteBtn();
  renderRecordsPanel();

  // ── Secret: tap the title 5× fast ──────────────────────────────────────────
  // A toggle. With anything still locked it unlocks every edition at once (for
  // showing the whole set off without grinding 50 wins); with everything
  // already unlocked it wipes the ladder back to zero — fresh collection, win
  // counter at 0 — so the same gesture undoes itself. The title is a safe
  // target: nothing else is bound to it, and 5 taps inside 2s won't happen by
  // accident.
  const titleEl = setupScreen.querySelector('h1');
  if (titleEl) {
    let taps = [];
    titleEl.addEventListener('click', () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 2000);
      taps.push(now);
      if (taps.length < 5) return;
      taps = [];
      if (!window.Skins) return;
      const allUnlocked = Skins.list().every((s) => Records.isSkinUnlocked(s.id));
      if (!allUnlocked) {
        const fresh = Skins.list().filter((s) => Records.unlockSkin(s.id));
        showToast(`🔓 Secret! Unlocked everything (+${fresh.length}).`);
        Sound.play('win');
        renderFrom(readRows());
        return;
      }
      Records.resetSkinProgress();
      // Any row riding a now-locked edition drops back to the bottle; its
      // auto-filled name follows, but a custom-typed name is kept.
      const defs = readRows().map((d) => {
        if (Records.isSkinUnlocked(d.skin)) return d;
        const wasDefault = !d.name.trim() || d.name.trim() === defaultNameFor(d.skin, d.flavor);
        return { ...d, skin: 'bottle', name: wasDefault ? FLAVORS[d.flavor].name : d.name };
      });
      showToast('🔒 Secret! Progress wiped — earn it all back.');
      renderFrom(defs);
    });
  }

  // Sprites are SVG data URIs that decode a beat after they're requested, so
  // the first preview paint can land on the placeholder. Repaint when one
  // arrives (no-op once the setup screen is gone).
  if (window.Skins && Skins.onSpriteLoad) Skins.onSpriteLoad(paintAllPreviews);
  paintAllPreviews();

  // Show setup on load
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');
})();
