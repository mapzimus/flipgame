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

// Sudden death: after this many flips, ON FIRE stops minting free lives and every
// miss costs an escalating extra penalty — guarantees even high-skill games end.
const SD_THRESHOLD = 70;
const SD_STEP = 20;   // flips per escalation level (+1 extra life lost each level)

const game = {
  state: GAME_STATES.SETUP,
  players: [],
  currentPlayerIndex: 0,
  direction: 1,          // 1 = forward through array, -1 = backward
  pointCount: 0,         // lives at risk on a miss; 0 = no stake built yet (free miss)
  lastResult: null,      // 'MAKE' | 'MISS'
  onFirePlayer: null,
  onFireBonus: 0,
  winnerIndex: 0,        // index of last game's winner (for "winner starts next")
  callbacks: {},

  // Per-flip display flags (set in resolveFlip, read by the HUD/banner)
  lastPenalty: 0,        // lives lost on the last miss (captured before reset)
  onFireGain: 0,         // lives gained on the last ON FIRE bonus make
  justIgnited: false,    // last make just triggered ON FIRE
  fireEnded: false,      // last miss ended an ON FIRE run (no penalty)
  justEliminated: false, // last miss eliminated the current player

  // Modes
  practice: false,       // solo free-flip practice (no lives/turns)
  difficulty: 'medium',  // AI skill: 'easy' | 'medium' | 'hard'
  practiceMakes: 0,
  practiceAttempts: 0,
  practiceStreak: 0,
  practiceBest: 0,
  turnCounter: 0,        // flips this game (drives sudden death)

  // defs: [{ name, color, isAI }]
  init(defs, direction, opts = {}) {
    this.practice   = !!opts.practice;
    this.difficulty = opts.difficulty || 'medium';
    this.players = defs.map(d => ({
      name: d.name,
      color: d.color || '#0b86ff',
      isAI: !!d.isAI,
      lives: 10,
      streak: 0,
      isHeatingUp: false,
      isOnFire: false,
      eliminated: false,
    }));
    this.direction = direction;
    this.currentPlayerIndex = 0;
    this.pointCount = 0;
    this.lastResult = null;
    this.onFirePlayer = null;
    this.onFireBonus = 0;
    this.practiceMakes = this.practiceAttempts = this.practiceStreak = this.practiceBest = 0;
    this.turnCounter = 0;

    // Winner-starts-next: caller passes the winner's INDEX (not name, which is
    // ambiguous when two players share a name). Ignored in practice.
    if (!this.practice && Number.isInteger(opts.startIndex) &&
        opts.startIndex >= 0 && opts.startIndex < this.players.length) {
      this.currentPlayerIndex = opts.startIndex;
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

  // ── Sudden death ────────────────────────────────────────────────────────
  inSuddenDeath() { return !this.practice && this.turnCounter > SD_THRESHOLD; },
  sdLevel()       { return this.inSuddenDeath() ? Math.floor((this.turnCounter - SD_THRESHOLD) / SD_STEP) + 1 : 0; },

  // Would the current player be ELIMINATED if they miss this flip? Drives the
  // "Make it or break it" intense finale. (No risk during a normal ON FIRE run,
  // since a miss there costs nothing — unless sudden death has added a cost.)
  missWouldEliminate() {
    const p = this.currentPlayer();
    if (!p || p.eliminated) return false;
    const sd = this.sdLevel();
    const penalty = p.isOnFire ? sd : this.pointCount + sd;
    return penalty > 0 && p.lives - penalty <= 0;
  },

  // Called by physics when bottle result is determined
  resolveFlip(result) {
    this.turnCounter++;
    this.lastResult = result;
    const player = this.currentPlayer();
    const wasOnFire = player.isOnFire;   // capture BEFORE we mutate any flags

    // reset per-flip display flags
    this.lastPenalty    = 0;
    this.onFireGain     = 0;
    this.justIgnited    = false;
    this.fireEnded      = false;
    this.justEliminated = false;

    // ── Practice: just track stats, no lives/streak stakes ──────────────────
    if (this.practice) {
      this.practiceAttempts++;
      if (result === 'MAKE') {
        this.practiceMakes++;
        this.practiceStreak++;
        this.practiceBest = Math.max(this.practiceBest, this.practiceStreak);
      } else {
        this.practiceStreak = 0;
      }
      this.setState(GAME_STATES.RESULT);
      return;
    }

    const sd = this.sdLevel();   // 0 normally; >0 once sudden death begins

    // ── ON FIRE bonus flips: each make = +1 life; a miss just ends the run ──
    if (wasOnFire) {
      if (result === 'MAKE') {
        // +1 life per flip while ON FIRE — the ONLY ceiling is the 20-life cap
        // (no separate per-run cap). In SUDDEN DEATH, ON FIRE stops minting free
        // lives (the deflation valve that lets games end).
        if (!sd) {
          const before = player.lives;
          player.lives    = Math.min(player.lives + 1, 20);
          this.onFireGain = player.lives - before;   // 0 once at the 20 cap
          if (this.onFireGain > 0) this.onFireBonus++;
        } else {
          this.onFireGain = 0;
        }
      } else {
        // Miss ends ON FIRE — normally NO life loss (the reward); in sudden death
        // it costs the escalating penalty so a hot player can't stall forever.
        if (sd) {
          const before = player.lives;
          player.lives     = Math.max(0, player.lives - sd);
          this.lastPenalty = before - player.lives;
          if (player.lives <= 0) { player.eliminated = true; this.justEliminated = true; }
        }
        player.isOnFire    = false;
        player.isHeatingUp = false;
        player.streak      = 0;
        this.onFirePlayer  = null;
        this.onFireBonus   = 0;
        this.pointCount    = 0;
        this.fireEnded     = true;
      }
      this.setState(GAME_STATES.RESULT);
      return;
    }

    // ── Normal flip ─────────────────────────────────────────────────────────
    if (result === 'MAKE') {
      player.streak++;
      this.pointCount++;
      player.isHeatingUp = player.streak === 2;
      if (player.streak >= 3) {
        player.isOnFire    = true;
        player.isHeatingUp = false;
        this.onFirePlayer  = player;
        this.onFireBonus   = 0;
        this.justIgnited   = true;
      }
    } else {
      const before = player.lives;
      player.lives       = Math.max(0, player.lives - (this.pointCount + sd));  // +sd in sudden death
      this.lastPenalty   = before - player.lives;   // lives ACTUALLY lost (HUD-accurate)
      player.streak      = 0;
      player.isHeatingUp = false;
      player.isOnFire    = false;
      this.pointCount    = 0;
      if (player.lives <= 0) {
        player.eliminated = true;
        this.justEliminated = true;
      }
    }

    this.setState(GAME_STATES.RESULT);
  },

  // Called after result display to advance turn
  advanceTurn() {
    // Practice: never ends — just keep flipping
    if (this.practice) { this.setState(GAME_STATES.TURN_START); return; }

    // Win check first
    const active = this.activePlayers();
    if (active.length <= 1) {
      if (active.length === 1) this.winnerIndex = this.players.indexOf(active[0]);
      this.setState(GAME_STATES.GAME_OVER);
      return;
    }

    // Announce an elimination once, then re-enter to actually advance past it
    if (this.justEliminated) {
      this.justEliminated = false;
      this.setState(GAME_STATES.ELIMINATED);
      return;
    }

    // ON FIRE: same player keeps flipping until they miss
    if (this.currentPlayer().isOnFire && !this.currentPlayer().eliminated) {
      this.setState(GAME_STATES.ON_FIRE);
      return;
    }

    // Advance to next active player
    let next = this.currentPlayerIndex;
    let attempts = 0;
    do {
      next = ((next + this.direction) + this.players.length) % this.players.length;
      attempts++;
    } while (this.players[next].eliminated && attempts <= this.players.length);

    this.currentPlayerIndex = next;
    this.setState(GAME_STATES.TURN_START);
  },
};
