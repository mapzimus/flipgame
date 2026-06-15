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
  const addPlayerBtn = document.getElementById('add-player-btn');
  const playerInputs = document.getElementById('player-inputs');

  // ── Sizing ─────────────────────────────────────────────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    Renderer.resize(canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);

  // ── Player input rows ──────────────────────────────────────────────────────
  let playerCount = 2;

  function addPlayerInput() {
    if (playerCount >= 8) return;
    playerCount++;
    const div = document.createElement('div');
    div.className = 'player-input-row';
    div.innerHTML = `
      <span class="player-num">P${playerCount}</span>
      <input type="text" placeholder="Player ${playerCount}" maxlength="14" value="Player ${playerCount}">
      <button class="remove-btn" onclick="removePlayer(this)">✕</button>
    `;
    playerInputs.appendChild(div);
    updateAddBtn();
  }

  window.removePlayer = function (btn) {
    btn.closest('.player-input-row').remove();
    playerCount--;
    playerInputs.querySelectorAll('.player-num').forEach((el, i) => {
      el.textContent = `P${i + 1}`;
    });
    updateAddBtn();
  };

  function updateAddBtn() {
    addPlayerBtn.disabled = playerCount >= 8;
  }

  addPlayerBtn.addEventListener('click', addPlayerInput);

  // ── Start game ─────────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    const names = [...playerInputs.querySelectorAll('input')]
      .map(i => i.value.trim() || i.placeholder)
      .filter(Boolean);

    if (names.length < 2) { alert('Need at least 2 players!'); return; }

    const dir = parseInt(document.querySelector('input[name="direction"]:checked')?.value ?? '1');
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    startGame(names, dir);
  });

  playAgainBtn.addEventListener('click', () => {
    gameOverEl.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startGame(game.players.map(p => p.name), game.direction);
  });

  // ── Game loop state ────────────────────────────────────────────────────────
  let lastTime    = 0;
  let loopId      = null;
  let evaluating  = false;
  let showGlow    = false;
  let resultTimer = 0;
  let resultAlpha = 0;
  const RESULT_MS = 1500;

  function startGame(names, dir) {
    resize();
    Physics.init(canvas.width, canvas.height);
    Renderer.init(canvas);

    game.on(GAME_STATES.TURN_START, onTurnStart);
    game.on(GAME_STATES.RESULT,     onResult);
    game.on(GAME_STATES.ON_FIRE,    onOnFire);
    game.on(GAME_STATES.ELIMINATED, onEliminated);
    game.on(GAME_STATES.GAME_OVER,  onGameOver);

    game.init(names, dir);

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

    updateHUD();

    Renderer.frame(dt, {
      bottle:      Physics.getBottle(),
      liquid:      Physics.getLiquid(),
      groundY:     Physics.getGroundY(),
      drag:        Input.getDragState(),
      result:      game.state === GAME_STATES.RESULT ? game.lastResult : null,
      resultAlpha,
      showGlow,
      isOnFire:    !!(game.onFirePlayer),
    });
  }

  // ── State callbacks ────────────────────────────────────────────────────────
  function onTurnStart() {
    evaluating  = false;
    showGlow    = false;
    resultAlpha = 0;
    Physics.resetBottle();
    Input.enable();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    turnBannerEl.textContent = `${p.name}'s turn`;
    pointCountEl.textContent = game.pointCount > 1 ? `⚡ ×${game.pointCount}` : '';
    streakBannerEl.textContent = '';
    streakBannerEl.className = 'streak-banner';
  }

  function onOnFire() {
    evaluating  = false;
    showGlow    = false;
    Physics.resetBottle();
    Input.enable();
    flipHintEl.classList.remove('hidden');

    const p = game.currentPlayer();
    turnBannerEl.textContent  = `🔥 ${p.name} IS ON FIRE!`;
    streakBannerEl.textContent = `+${game.onFireBonus} lives earned`;
    streakBannerEl.className   = 'streak-banner on-fire';
    pointCountEl.textContent   = '';
  }

  function onResult() {
    Input.disable();
    flipHintEl.classList.add('hidden');
    resultTimer = RESULT_MS;

    const p = game.currentPlayer();
    if (game.lastResult === 'MAKE') {
      if (p.isOnFire) {
        streakBannerEl.textContent = `🔥 +${game.onFireBonus} lives`;
        streakBannerEl.className   = 'streak-banner on-fire';
      } else if (p.isOnFire || p.streak >= 3) {
        streakBannerEl.textContent = '🔥 ON FIRE!';
        streakBannerEl.className   = 'streak-banner on-fire';
      } else if (p.isHeatingUp) {
        streakBannerEl.textContent = '🌡 Heating up!';
        streakBannerEl.className   = 'streak-banner heating-up';
      } else {
        streakBannerEl.textContent = '';
      }
    } else {
      streakBannerEl.textContent = `−${game.pointCount} ${game.pointCount === 1 ? 'life' : 'lives'}`;
      streakBannerEl.className   = 'streak-banner miss-penalty';
    }

    updateHUD();
  }

  function onEliminated() {
    setTimeout(() => game.advanceTurn(), 1800);
  }

  function onGameOver() {
    gameScreen.classList.add('hidden');
    gameOverEl.classList.remove('hidden');
    const active = game.activePlayers();
    winnerNameEl.textContent = active.length ? active[0].name : '???';
    Input.disable();
  }

  // ── Flick ──────────────────────────────────────────────────────────────────
  function onFlick(vx, vy) {
    if (game.state !== GAME_STATES.TURN_START &&
        game.state !== GAME_STATES.ON_FIRE) return;

    Physics.applyFlick(vx, vy);
    Input.disable();
    flipHintEl.classList.add('hidden');
    evaluating = true;
    game.setState(GAME_STATES.EVALUATING);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function updateHUD() {
    playerListEl.innerHTML = game.players.map((p, i) => {
      const active = i === game.currentPlayerIndex && !p.eliminated;
      const dots   = '●'.repeat(Math.max(0, p.lives)) + '○'.repeat(Math.max(0, 10 - p.lives));
      let cls = 'player-card';
      if (p.eliminated)     cls += ' eliminated';
      else if (active)      cls += ' active';
      if (p.isOnFire)       cls += ' on-fire';
      else if (p.isHeatingUp) cls += ' heating-up';

      return `<div class="${cls}">
        <span class="p-name">${p.name}</span>
        <span class="p-dots">${dots}</span>
        <span class="p-lives">${p.lives}</span>
      </div>`;
    }).join('');
  }

  Input.attach(canvas, onFlick);

  // Show setup on load
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  gameOverEl.classList.add('hidden');
})();
