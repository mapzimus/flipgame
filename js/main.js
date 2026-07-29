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
    const skin = (game && game.currentPlayer && game.currentPlayer()?.skin) || BASE_SKIN;
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
        prepareTurnArena();
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

  // ── Player setup rows (character + independent color + Human/CPU) ──────────
  // Unlock = one character. Color is a separate 12-flavor pick (HUD / recolor).
  let playerCount = 2;

  const FORCE_SKIN = (typeof window !== 'undefined' && window.FLIP_FORCE_SKIN) || null;
  const BRAND = (typeof window !== 'undefined' && window.FLIP_BRAND) || {};
  const BASE_SKIN = BRAND.baseSkin || 'bottle';
  const ONLINE_ENABLED = BRAND.online !== false;

  function characterList() {
    return window.Skins && Skins.list ? Skins.list() : [{ id: BASE_SKIN, name: 'Bottle', emoji: '🍾', color: '#1f9bff', tint: '#1f9bff' }];
  }
  function characterById(id) {
    if (window.Skins && Skins.character) return Skins.character(id);
    return characterList().find((c) => c.id === id) || null;
  }
  function availableCharacters() {
    return characterList().filter((c) => c.id === BASE_SKIN || c.unlock == null || Records.isSkinUnlocked(c.id));
  }
  function defaultCharId() {
    if (FORCE_SKIN && characterById(FORCE_SKIN)) return FORCE_SKIN;
    const avail = availableCharacters();
    return (avail[0] && avail[0].id) || BASE_SKIN;
  }
  function defaultNameFor(charId) {
    const c = characterById(charId);
    return (c && c.name) || 'Player';
  }
  function defaultColorFor(charId) {
    const c = characterById(charId);
    return (c && (c.color || c.tint)) || FLAVORS[0].color;
  }
  function normalizeColor(hex) {
    const h = String(hex || '').toLowerCase();
    const hit = FLAVORS.find((f) => f.color === h);
    return hit ? hit.color : defaultColorFor(defaultCharId());
  }
  function drawTintFor(charId, color) {
    if (window.Skins && Skins.drawColor) return Skins.drawColor(charId, color);
    return color || defaultColorFor(charId);
  }

  function charChipsHtml(selId) {
    return availableCharacters().map((c) =>
      `<button type="button" class="char-chip${c.id === selId ? ' selected' : ''}" data-char="${c.id}" title="${escapeHtml(c.name)}" style="--chip:${c.color || c.tint}">` +
      `<span class="char-chip-emoji">${c.emoji || '🍾'}</span>` +
      `<span class="char-chip-name">${escapeHtml(c.name)}</span>` +
      `</button>`
    ).join('');
  }

  function colorSwatchesHtml(selColor) {
    const sel = normalizeColor(selColor);
    return FLAVORS.map((f) =>
      `<button type="button" class="flavor-swatch${f.color === sel ? ' selected' : ''}" data-color="${f.color}" style="background:${f.color}" title="${escapeHtml(f.name)}"></button>`
    ).join('');
  }

  function rowHtml(i, def) {
    const charId = def.charId || defaultCharId();
    const col = normalizeColor(def.color || defaultColorFor(charId));
    return `<div class="player-input-row" data-char="${charId}" data-color="${col}" data-ai="${def.ai ? 1 : 0}">
      <div class="prow-top">
        <canvas class="skin-preview" width="76" height="92" aria-hidden="true"></canvas>
        <span class="player-num" style="color:${col}">P${i + 1}</span>
        <input type="text" placeholder="${escapeHtml(defaultNameFor(charId))}" maxlength="14" value="${escapeHtml(def.name)}">
        <button type="button" class="ai-toggle${def.ai ? ' cpu' : ''}" title="Tap to switch Human / CPU">${def.ai ? 'CPU' : 'Human'}</button>
        ${i >= 2 ? '<button type="button" class="remove-player-btn" title="Remove">✕</button>' : ''}
      </div>
      <div class="picker-label">Character</div>
      <div class="char-picker">${charChipsHtml(charId)}</div>
      <div class="picker-label">Color</div>
      <div class="flavor-picker">${colorSwatchesHtml(col)}</div>
    </div>`;
  }

  function readRows() {
    return [...playerInputs.querySelectorAll('.player-input-row')].map(row => ({
      name: row.querySelector('input').value,
      charId: row.dataset.char || defaultCharId(),
      color: normalizeColor(row.dataset.color || defaultColorFor(row.dataset.char)),
      ai: row.dataset.ai === '1',
    }));
  }

  function paintRowPreview(row) {
    const cv = row && row.querySelector('.skin-preview');
    if (!cv || typeof Renderer === 'undefined' || !Renderer.drawPreview) return;
    const charId = row.dataset.char || defaultCharId();
    const color = normalizeColor(row.dataset.color || defaultColorFor(charId));
    const drawAs = (window.Skins && Skins.drawAs) ? Skins.drawAs(charId) : charId;
    Renderer.drawPreview(cv, drawAs === 'bottle' ? 'bottle' : charId, drawTintFor(charId, color));
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
    const avail = availableCharacters();
    const pick = avail[defs.length % Math.max(1, avail.length)] || avail[0];
    const charId = (pick && pick.id) || defaultCharId();
    defs.push({ name: defaultNameFor(charId), charId, color: defaultColorFor(charId), ai: false });
    renderFrom(defs);
  }

  // event delegation: character, color, AI toggle, remove
  playerInputs.addEventListener('click', (e) => {
    const chip = e.target.closest('.char-chip');
    if (chip) {
      const row = chip.closest('.player-input-row');
      const oldId = row.dataset.char || defaultCharId();
      const newId = chip.dataset.char || defaultCharId();
      const input = row.querySelector('input');
      if (!input.value.trim() || input.value.trim() === defaultNameFor(oldId)) {
        input.value = defaultNameFor(newId);
      }
      row.dataset.char = newId;
      // Match color to the character's default tint when switching characters.
      const col = defaultColorFor(newId);
      row.dataset.color = col;
      row.querySelectorAll('.char-chip').forEach((s) => s.classList.remove('selected'));
      chip.classList.add('selected');
      row.querySelectorAll('.flavor-swatch').forEach((s) => {
        s.classList.toggle('selected', s.dataset.color === col);
      });
      row.querySelector('.player-num').style.color = col;
      input.placeholder = defaultNameFor(newId);
      paintRowPreview(row);
      return;
    }
    const sw = e.target.closest('.flavor-swatch');
    if (sw) {
      const row = sw.closest('.player-input-row');
      const col = normalizeColor(sw.dataset.color);
      const oldId = row.dataset.char || defaultCharId();
      row.dataset.color = col;
      // If this edition has a variant for that color, switch to it when unlocked
      // (keeps the name chip in sync with the art). Otherwise keep the character
      // and still recolor/swap art via the chosen color.
      const sib = (window.Skins && Skins.siblingForColor)
        ? Skins.siblingForColor(oldId, col)
        : null;
      if (sib && (sib.id === BASE_SKIN || sib.unlock == null || Records.isSkinUnlocked(sib.id))) {
        const input = row.querySelector('input');
        if (!input.value.trim() || input.value.trim() === defaultNameFor(oldId)) {
          input.value = defaultNameFor(sib.id);
        }
        row.dataset.char = sib.id;
        input.placeholder = defaultNameFor(sib.id);
        row.querySelectorAll('.char-chip').forEach((s) => {
          s.classList.toggle('selected', s.dataset.char === sib.id);
        });
      }
      row.querySelectorAll('.flavor-swatch').forEach((s) => s.classList.remove('selected'));
      sw.classList.add('selected');
      row.querySelector('.player-num').style.color = col;
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
      const charId = FORCE_SKIN || r.charId || defaultCharId();
      return {
        name: (r.name || '').trim() || defaultNameFor(charId),
        color: normalizeColor(r.color || defaultColorFor(charId)),
        isAI: r.ai,
        skin: charId, // character id — Skins.draw/physicsFor resolve it
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
    const r0 = readRows()[0] || { name: 'You', charId: defaultCharId(), color: defaultColorFor(defaultCharId()) };
    const charId = FORCE_SKIN || r0.charId || defaultCharId();
    const def = {
      name: (r0.name || '').trim() || defaultNameFor(charId),
      color: normalizeColor(r0.color || defaultColorFor(charId)),
      isAI: false,
      skin: charId,
    };
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
          skin: FORCE_SKIN || p.skin || BASE_SKIN, netId: p.netId,
        }));
        const payload = {
          defs, direction: game.direction, startingLives: game.startingLives,
          startIndex: game.winnerIndex, newMatch: false,
        };
        Net.startMatch(payload);
        if (playAgainBtn) playAgainBtn.textContent = 'Play Again';
        startGame(defs, game.direction, {
          difficulty: 'medium',
          startingLives: game.startingLives,
          startIndex: game.winnerIndex,
          newMatch: false,
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
           skin: FORCE_SKIN || game.players[0].skin || BASE_SKIN }],
        1,
        { practice: true, startingLives: game.startingLives }
      );
    } else {
      const defs = game.players.map(p => ({ name: p.name, color: p.color, isAI: p.isAI,
                                            skin: FORCE_SKIN || p.skin || BASE_SKIN }));
      // Winner starts the next game (by index — robust to duplicate names).
      startGame(defs, game.direction, {
        difficulty: game.difficulty,
        startingLives: game.startingLives,
        startIndex: game.winnerIndex,
      });
    }
  });

  // initial two rows — names default to the unlocked characters
  renderFrom([
    (() => {
      const id = defaultCharId();
      return { name: defaultNameFor(id), charId: id, color: defaultColorFor(id), ai: false };
    })(),
    (() => {
      const avail = availableCharacters();
      const id = (avail[1] && avail[1].id) || defaultCharId();
      return { name: defaultNameFor(id), charId: id, color: defaultColorFor(id), ai: false };
    })(),
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
    if (onlineMode && netAuthority && window.Net) {
      Net.sendResult({
        result: 'MISS',
        info: { reason: 'timeout', tilt: null, perfect: false },
        playerId: Net.selfId,
      });
      netAuthority = false;
    }
    game.resolveFlip('MISS');
  }

  function clearTimers() { clearTimeout(aiTimer); clearTimeout(elimTimer); clearTimeout(gameOverTimer); }

  function landingMeta(landingInfo = null) {
    return {
      perfect: !!(landingInfo && landingInfo.perfect),
    };
  }

  // CPU takes its turn: aim near the sweet-spot flick, with error set by difficulty.
  // Alien bank-shot skins get a sideways aim instead of a pure vertical flip.
  function aiFlick() {
    if (game.state !== GAME_STATES.TURN_START && game.state !== GAME_STATES.ON_FIRE) return;
    const sigma = { easy: 1000, medium: 400, hard: 220 }[game.difficulty] || 400;
    const u1 = Math.random() || 1e-6, u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const skin = game.currentPlayer()?.skin || BASE_SKIN;
    const bank = window.Skins && Skins.physicsFor && Skins.physicsFor(skin);
    if (bank && bank.floorResolve) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const vx = side * (1100 + Math.abs(gauss) * sigma * 0.9 + Math.random() * 500);
      const up = Math.max(900, 1700 + gauss * sigma * 0.55);
      onFlick(vx, -up);
      return;
    }
    // Aim at the measured sweet spot. This drifted out of date when POWER_SPEED
    // was retuned: at the stale 2100 the CPU sat on the slope, so hard (63%)
    // was barely better than medium (60%). At 2500 the tiers separate properly
    // — easy 45% / medium 74% / hard 85%.
    const up = Math.max(500, 2500 + gauss * sigma);   // sweet spot ~2500 px/s
    const vx = (Math.random() - 0.5) * 420;           // slight lean
    onFlick(vx, -up);
  }

  // Deterministic turn seed shared by all online peers (same turnCounter + seat).
  function turnArenaSeed() {
    const tc = game.turnCounter | 0;
    const pi = game.currentPlayerIndex | 0;
    return ((tc * 0x9E3779B1) ^ ((pi + 1) * 0x85EBCA6B) ^ 0xC2B2AE35) >>> 0;
  }

  function prepareTurnArena() {
    if (Physics.seedTurn) Physics.seedTurn(turnArenaSeed());
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
      topStake: 0, longestFire: 0, sawSuddenDeath: false, ignitionsThisGame: 0,
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
      (game.sdLevelForNextFlip ? game.sdLevelForNextFlip() > 0 : game.inSuddenDeath());
    Sound.setSuddenDeath(active, game.sdLevelForNextFlip ? game.sdLevelForNextFlip() : game.sdLevel());
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
        // Online non-authority: display-only sim — wait for the flicker's result
        // so cross-device pad/float drift can't fork lives/turns.
        if (onlineMode && !netAuthority) continue;
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
                padOffset: landingInfo && landingInfo.padOffset,
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
      suddenDeath: game.sdLevelForNextFlip ? game.sdLevelForNextFlip() > 0 : game.inSuddenDeath(),
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
    prepareTurnArena();
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
    prepareTurnArena();
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

  // Edition unlocks + achievements only count when a human is in the lobby.
  // Kids were farming AI-vs-AI blitz games to unlock the whole ladder.
  function progressCounts() {
    return game.practice || game.players.some((p) => !p.isAI);
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
    const counts = progressCounts();
    const rec = counts
      ? Records.recordFlip(game, { greatSave: greatSaveActive })
      : null;
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
      const firePeak = Math.max(game.onFireBonus || 0, game.endedFireBonus || 0);
      if (firePeak > gameStats.longestFire) gameStats.longestFire = firePeak;
      if (game.inSuddenDeath && game.inSuddenDeath()) gameStats.sawSuddenDeath = true;
      if (game.justIgnited) gameStats.ignitionsThisGame = (gameStats.ignitionsThisGame || 0) + 1;
    }

    // NB: achievements.js declares `const Achievements` (script scope, not on
    // window) — same gotcha as Renderer above, so feature-detect via typeof.
    if (counts && typeof Achievements !== 'undefined' && rec) {
      const fresh = Achievements.check({
        result:        game.lastResult,
        justIgnited:   game.justIgnited,
        onFireBonus:   Math.max(game.onFireBonus || 0, game.endedFireBonus || 0),
        streak:        game.practice ? game.practiceStreak : (p ? p.streak : 0),
        pointCount:    game.pointCount,
        perfect:       !!game.perfectLanding,
        power:         lastFlickPower,
        greatSave:     greatSaveActive,
        landingReason: landing ? landing.reason : null,
        padOffset: landing && landing.padOffset != null ? landing.padOffset : null,
        totalFlipsLifetime: rec.totalFlips,
        totalMakesLifetime: rec.totalMakes,
        playerCount:   game.players.length,
        ignitionsThisGame: gameStats ? gameStats.ignitionsThisGame : 0,
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

  // Lightweight toast queue (self-creating so it needs no markup). Used for
  // unlocks + achievements — queued so game-over don't overwrite each other.
  const toastQueue = [];
  let toastBusy = false;
  function showToast(msg) {
    toastQueue.push(msg);
    pumpToast();
  }
  function pumpToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    const msg = toastQueue.shift();
    let t = document.getElementById('skin-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'skin-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      t.classList.remove('show');
      toastBusy = false;
      // Brief gap so consecutive toasts are readable.
      setTimeout(pumpToast, 280);
    }, 3600);
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
      // AI-only lobbies can still finish for fun, but they do not advance the
      // unlock ladder, hall-of-fame wins, or achievements.
      let winRec = null;
      if (humansPlayed) {
        winRec = Records.recordWin(active.length ? active[0].name : null);
        renderRecordsPanel();
        // Character unlock ladder: each character's `unlock` is a total-win
        // threshold (every 3 wins). Crossing multiple thresholds in one game
        // grants every newly earned character.
        if (active.length && window.Skins) {
          const wins = Records.totalWins();
          const newlyUnlocked = Skins.list().filter((s) => {
            const need = Skins.unlockRule(s.id);
            return typeof need === 'number' && wins >= need && Records.unlockSkin(s.id);
          });
          if (newlyUnlocked.length) {
            const names = newlyUnlocked.map((s) => `${s.emoji} ${s.name}`).join(', ');
            showToast(`${names} unlocked! Pick them in setup.`);
            try { renderFrom(readRows()); } catch (_) {}
          }
        }
      } else {
        renderRecordsPanel();
        showToast('🤖 AI-only games don’t count toward unlocks or achievements.');
      }
      Sound.play('win');

      // Win-based achievements (display-only) — human required in the lobby.
      if (humansPlayed && typeof Achievements !== 'undefined' && active.length && gameStats) {
        const winner = active[0];
        const wIdx = game.players.indexOf(winner);
        const pp = (gameStats.perPlayer && gameStats.perPlayer[wIdx]) || { makes: 0, flips: 0, lowestLives: Infinity };
        announceAchievements(Achievements.check({
          won:              true,
          wonWithoutMiss:   pp.flips > 0 && pp.makes === pp.flips,
          droppedToOneLife: pp.lowestLives <= 1,
          sawSuddenDeath:   !!gameStats.sawSuddenDeath,
          winnerWins:       (winRec && winRec.mostWins && winRec.mostWins[winner.name]) || 0,
          playerCount:      game.players.length,
          ignitionsThisGame: gameStats.ignitionsThisGame || 0,
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
    const r0 = rows[0] || { name: '', charId: defaultCharId(), color: defaultColorFor(defaultCharId()) };
    const charId = FORCE_SKIN || r0.charId || defaultCharId();
    const name = (onlineNameEl && onlineNameEl.value.trim()) ||
      (r0.name || '').trim() || defaultNameFor(charId);
    return {
      name,
      color: normalizeColor(r0.color || defaultColorFor(charId)),
      skin: charId,
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
    if (playAgainBtn) playAgainBtn.textContent = 'Play Again';
    startGame(defs, dir || 1, {
      difficulty: 'medium',
      startingLives: (opts && opts.startingLives) || chosenStartingLives(),
      startIndex: (opts && Number.isInteger(opts.startIndex)) ? opts.startIndex : undefined,
      // Default true for first match; rematch host sends newMatch: false.
      newMatch: !(opts && opts.newMatch === false),
    });
  }

  // Ports that ship without networking (Parrot Flip) hide the entry point
  // entirely rather than leaving a button that goes nowhere.
  if (onlineBtn && !ONLINE_ENABLED) onlineBtn.classList.add('hidden');
  if (onlineBtn && window.Net && ONLINE_ENABLED) {
    onlineBtn.addEventListener('click', () => {
      setupScreen.classList.add('hidden');
      onlineScreen.classList.remove('hidden');
      onlineForm.classList.remove('hidden');
      onlineLobby.classList.add('hidden');
      if (onlineNameEl && !onlineNameEl.value) {
        const r0 = readRows()[0];
        onlineNameEl.value = (r0 && r0.name) || defaultNameFor(defaultCharId());
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
        skin: FORCE_SKIN || p.skin || BASE_SKIN,
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
    Net.on('leave', (peerId) => {
      if (!onlineMode || !gameStarted || !peerId) return;
      const p = game.players.find(x => x.netId === peerId && !x.eliminated);
      if (!p) return;
      const wasCurrent = game.currentPlayer() === p;
      if (!game.forfeitPlayer(peerId, 'left')) return;
      showToast(`${p.name} left — forfeited.`);
      stopTurnTimer();
      Input.disable();
      clearTimeout(aiTimer);
      evaluating = false;
      pendingNetResult = null;
      netAuthority = false;
      updateHUD();
      if (wasCurrent || game.activePlayers().length <= 1) {
        // Treat like an elimination so advanceTurn can end or rotate.
        game.justEliminated = true;
        game.advanceTurn();
      }
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
  if (Records.syncUnlocksFromWins) Records.syncUnlocksFromWins();
  renderRecordsPanel();

  // ── Secret: tap the title 5× fast ──────────────────────────────────────────
  // Unlock every character at once (demo) or wipe progress back to bottle.
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
      const defs = readRows().map((d) => {
        const id = d.charId || defaultCharId();
        if (Records.isSkinUnlocked(id) || id === BASE_SKIN) return d;
        const wasDefault = !d.name.trim() || d.name.trim() === defaultNameFor(id);
        return {
          ...d,
          charId: BASE_SKIN,
          color: defaultColorFor(BASE_SKIN),
          name: wasDefault ? defaultNameFor(BASE_SKIN) : d.name,
        };
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
