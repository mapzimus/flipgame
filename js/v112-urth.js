// v112-urth.js -- authored canon terms and flavor-only alternate spellings.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Urth = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';
  var CANON = Object.freeze({
    planet: 'Urth',
    championship: 'Whirled Flip Champyunship',
    championshipShort: 'WFC',
    standardFormat: 'Whirled Standard',
    refrain: 'Ten lives. Every one public.',
    storyTitle: 'Pressure Signal',
    physicsUnit: 'Field Physics Unit',
  });
  // Never apply these as a text transform. Writers opt into one authored token
  // per short flavor unit; functional and accessible copy stays conventional.
  var FLAVOR_SPELLINGS = Object.freeze({
    official: 'offishul',
    schedule: 'schedyule',
    calibration: 'calibrayshun',
    spectator: 'spectaytor',
    registration: 'regystration',
    certified: 'certyfied',
    committee: 'commity',
    maintenance: 'maintaynance',
    transmission: 'transmyssion',
    status: 'statyus',
  });
  var AUTHORED_LINES = Object.freeze({
    qualifierPoster: 'Offishul WFC Qualifier — doors at seven.',
    stationBoard: 'Next transmyssion: Whirled Standard.',
    inspectionSeal: 'Certyfied for open exhibition.',
    labCard: 'Calibrayshun passed. Result remains inconvenient.',
    maintenanceCard: 'Maintaynance checked the clock twice.',
    crowdNotice: 'Spectaytor lanes remain open after the final horn.',
  });
  return Object.freeze({
    schema: 'UrthLexiconV1',
    canon: CANON,
    flavorSpellings: FLAVOR_SPELLINGS,
    authoredLines: AUTHORED_LINES,
  });
});
