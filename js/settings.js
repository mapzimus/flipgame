// settings.js — persisted user preferences (localStorage). Loaded after audio,
// before records/main. Holds mute + reduce-motion + physics feel prefs.
const Settings = (() => {
  const KEY = 'flipgame.settings.v1';
  const FEELS = ['forgiving', 'standard', 'pro'];
  const DEFAULTS = { sound: true, reduceMotion: false, feel: 'standard' };
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const merged = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
      if (!FEELS.includes(merged.feel)) merged.feel = 'standard';
      return merged;
    } catch (e) { return { ...DEFAULTS }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  return {
    get sound()        { return data.sound; },
    get reduceMotion() { return data.reduceMotion; },
    get feel()         { return data.feel; },
    setSound(v)        { data.sound = !!v; save(); },
    setReduceMotion(v) { data.reduceMotion = !!v; save(); },
    setFeel(v) {
      data.feel = FEELS.includes(v) ? v : 'standard';
      save();
    },
  };
})();
