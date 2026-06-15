// game.js — state machine and rules (loaded first)

const GAME_STATES = {
  SETUP: 'SETUP',
  TURN_START: 'TURN_START',
  FLIPPING: 'FLIPPING',
  EVALUATING: 'EVALUATING',
  RESULT: 'RESULT',
  ON_FIRE: 'ON_FIRE',
  ELIMINATED: 'ELIMINATED',
  GAME_OVER: 'GAME_OVER',
};

const game = {
  state: GAME_STATES.SETUP,
  players: [],
  currentPlayerIndex: 0,
  direction: 1,          // 1 = forward through array, -1 = backward
  pointCount: 1,         // current stakes
  lastResult: null,      // 'MAKE' | 'MISS'
  onFirePlayer: null,
  onFireBonus: 0,
  previousWinnerName: null,
  resultTimer: 0,        // countdown before advancing from RESULT state
  callbacks: {},

  init(playerNames, direction) {
    this.players = playerNames.map(name => ({
      name,
      lives: 10,
      streak: 0,
      isHeatingUp: false,
      isOnFire: false,
      eliminated: false,
    }));
    this.direction = direction;
    this.currentPlayerIndex = 0;
    this.pointCount = 1;
    this.lastResult = null;
    this.onFirePlayer = null;
    this.onFireBonus = 0;

    // If there's a previous winner, start with them
    if (this.previousWinnerName) {
      const idx = this.players.findIndex(p => p.name === this.previousWinnerName);
      if (idx !== -1) this.currentPlayerIndex = idx;
    }

    this.setState(GAME_STATES.TURN_START);
  },

  setState(newState) {
    this.state = newState;
    if (this.callbacks[newState]) this.callbacks[newState]();
  },

  on(stateName, fn) {
    this.callbacks[stateName] = fn;
  },

  currentPlayer() {
    return this.players[this.currentPlayerIndex];
  },

  activePlayers() {
    return this.players.filter(p => !p.eliminated);
  },

  // Called by physics when bottle result is determined
  resolveFlip(result) {
    this.lastResult = result;
    const player = this.currentPlayer();

    if (this.state === GAME_STATES.ON_FIRE) {
      if (result === 'MAKE') {
        this.onFireBonus = Math.min(this.onFireBonus + 1, 10);
        player.lives = Math.min(player.lives + 1, 20);
        this.setState(GAME_STATES.RESULT);
      } else {
        // Miss ends ON FIRE — no life loss, bonus already applied per-make
        player.isOnFire = false;
        this.onFirePlayer = null;
        this.onFireBonus = 0;
        this.setState(GAME_STATES.RESULT);
      }
      return;
    }

    if (result === 'MAKE') {
      player.streak++;
      this.pointCount++;
      player.isHeatingUp = player.streak >= 2;
      if (player.streak >= 3 && !player.isOnFire) {
        player.isOnFire = true;
        player.isHeatingUp = false;
        this.onFirePlayer = player;
        this.onFireBonus = 0;
      }
    } else {
      player.lives -= this.pointCount;
      player.streak = 0;
      player.isHeatingUp = false;
      player.isOnFire = false;
      this.pointCount = 1;
      if (player.lives <= 0) {
        player.lives = 0;
        player.eliminated = true;
      }
    }

    this.setState(GAME_STATES.RESULT);
  },

  // Called after result display to advance turn
  advanceTurn() {
    const eliminated = this.players.find(p => p.eliminated && this.lastResult === 'MISS' && p === this.currentPlayer());
    if (eliminated) {
      this.setState(GAME_STATES.ELIMINATED);
      return;
    }

    const active = this.activePlayers();
    if (active.length === 1) {
      this.previousWinnerName = active[0].name;
      this.setState(GAME_STATES.GAME_OVER);
      return;
    }
    if (active.length === 0) {
      this.setState(GAME_STATES.GAME_OVER);
      return;
    }

    // ON FIRE: same player keeps flipping
    if (this.currentPlayer().isOnFire && this.lastResult === 'MAKE') {
      this.setState(GAME_STATES.ON_FIRE);
      return;
    }

    // Advance to next active player
    let next = this.currentPlayerIndex;
    let attempts = 0;
    do {
      next = ((next + this.direction) + this.players.length) % this.players.length;
      attempts++;
    } while (this.players[next].eliminated && attempts < this.players.length);

    this.currentPlayerIndex = next;
    this.setState(GAME_STATES.TURN_START);
  },
};
