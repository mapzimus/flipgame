// Reproducible, dependency-free browser composition. Node entry guards are
// replaced at build time with explicit factory arguments, never browser shims.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dep = id => `require(${JSON.stringify('./' + id + '.js')})`;
const modules = [
  ['v111-interfaces', '', []],
  ['v111-runtime', 'Interfaces', [dep('v111-interfaces')]],
  ['v111-name-policy', 'Interfaces, Runtime', [dep('v111-interfaces'), dep('v111-runtime')]],
  ['v111-object-manifest', '', []],
  ['v111-content-catalog', 'Manifest', [dep('v111-object-manifest')]],
  ['v111-cosmetic-catalog', '', []],
  ['v111-progression', 'Interfaces, Content, Cosmetics, root', [dep('v111-interfaces'), dep('v111-content-catalog'), dep('v111-cosmetic-catalog'), 'platform']],
  ['achievements', 'Interfaces, Progression, root', [dep('v111-interfaces'), dep('v111-progression'), 'platform']],
  ['v112-achievements', 'Legacy, trustedComposition', [dep('achievements'), 'true']],
  ['v112-progression-catalog', '', []],
  ['v112-economy', '', []],
  ['v112-profile', 'Catalog, Economy, LegacyProgression, Achievements, root, commonJs', [dep('v112-progression-catalog'), dep('v112-economy'), dep('v111-progression'), dep('v112-achievements'), 'platform', 'true']],
  ['v111-save-backup', 'NamePolicy, Interfaces', [dep('v111-name-policy'), dep('v111-interfaces')]],
  ['v112-profile-backup', 'SaveBackup, Profile, Catalog', [dep('v111-save-backup'), dep('v112-profile'), dep('v112-progression-catalog')]],
  ['v112-progression-runtime', 'Catalog, Economy, Profile, Backup, root, commonJs', [dep('v112-progression-catalog'), dep('v112-economy'), dep('v112-profile'), dep('v112-profile-backup'), 'platform', 'true']],
  ['v112-rules', 'loadEventKernel', [`function () { return ${dep('v112-event-kernel')}; }`]],
  ['v112-event-kernel', 'Rules', [dep('v112-rules')]],
  ['v112-landing-verdict', 'Rules', [dep('v112-rules')]],
  ['v112-battle', '', []],
  ['v112-activity', 'root, commonJs', ['platform', 'true']],
  ['v112-story', '', []],
  ['v112-urth', '', []],
  ['v112-story-view', 'Story, Urth', [dep('v112-story'), dep('v112-urth')]],
  ['v112-story-runtime', 'Activity, Story, Profile, View, root, commonJs', [dep('v112-activity'), dep('v112-story'), dep('v112-profile'), dep('v112-story-view'), 'platform', 'true']],
  ['v112-data', 'Stats', ['platform.statsModule']],
  ['v111-physics-events', 'Interfaces', [dep('v111-interfaces')]],
  ['v112-alien-event-adapters', '', []],
  ['v112-events', 'Legacy, AlienAdapters', [dep('v111-physics-events'), dep('v112-alien-event-adapters')]],
  ['v112-tutorial', 'Events', [dep('v112-events')]],
  ['v112-training', 'Activity, Events, Tutorial', [dep('v112-activity'), dep('v112-events'), dep('v112-tutorial')]],
];
const normalize = source => source.replace(/\r\n/g, '\n');
function extractFactory(source, signature, id) {
  const invocation = source.indexOf('})(');
  if (invocation < 0) throw new Error(`${id}: missing factory invocation`);
  const start = source.indexOf('function (', invocation);
  const end = source.lastIndexOf('});');
  if (start < invocation || end < start || source.slice(end + 3).trim()) {
    throw new Error(`${id}: unsupported module wrapper`);
  }
  const factory = source.slice(start, end + 1);
  const actual = factory.slice(10, factory.indexOf(')')).replace(/\s+/g, ' ').trim();
  if (actual !== signature) throw new Error(`${id}: factory signature changed: ${actual}`);
  if (!source.slice(0, invocation).includes('module.exports')) throw new Error(`${id}: missing verified CommonJS export`);
  new vm.Script('(' + factory + ')', { filename: id });
  return factory;
}
function replaceOnce(text, before, after, label) {
  if (text.split(before).length !== 2) throw new Error(`${label}: expected startup block changed`);
  return text.replace(before, after);
}
const sources = [];
const definitions = [];
for (const [id, signature, args] of modules) {
  const source = normalize(await readFile(path.join(root, 'js', id + '.js'), 'utf8'));
  sources.push([id, createHash('sha256').update(source).digest('hex')]);
  let factory = extractFactory(source, signature, id);
  if (id === 'v112-progression-runtime') {
    factory = replaceOnce(factory, `    var defaultHandle = Profile.connectProductionRuntime(function (connection) {
      return beginLiveRuntime({ profileStore: connection.profileStore,
        setWriterEnabled: connection.setWriterEnabled,
        lockManager: browserLockManager, backupAdapter: Backup });
    });
    moduleApi.liveAvailable = true;
    moduleApi.defaultRuntime = defaultHandle.runtime;
    moduleApi.defaultRuntimeReady = defaultHandle.ready;`, `    moduleApi.liveAvailable = true;
    moduleApi.connectBrowserRuntime = function (installRewardAuthority) {
      return Profile.connectProductionRuntime(function (connection) {
        return beginLiveRuntime({ profileStore: connection.profileStore,
          setWriterEnabled: connection.setWriterEnabled,
          lockManager: browserLockManager, backupAdapter: Backup,
          installRewardAuthority: installRewardAuthority });
      });
    };`, id);
  }
  definitions.push(`${JSON.stringify('./' + id + '.js')}: function (require) {\nreturn (${factory})(${args.join(', ')});\n}`);
}
const entry = normalize(await readFile(path.join(root, 'js/v112-browser-entry.js'), 'utf8'));
// A redeclared authority function silently shadows the one above it, so an edit
// that leaves both copies behind ships whichever came last. The composition is
// the reward authority: it must not be possible to guess which body runs.
const declared = new Map();
for (const [, name, line] of [...entry.matchAll(/^ {2}function ([A-Za-z0-9_$]+)/gm)]
  .map(match => [match, match[1], entry.slice(0, match.index).split('\n').length])) {
  if (declared.has(name)) {
    throw new Error(`v112-browser-entry: ${name} is declared twice (lines ${declared.get(name)} and ${line})`);
  }
  declared.set(name, line);
}
sources.push(['v112-browser-entry', createHash('sha256').update(entry).digest('hex')]);
const identity = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const output = `// GENERATED by scripts/build-v112-browser.mjs; do not edit.\n// Source identity: ${identity}\n(function (browser) {\n'use strict';\nif (Object.prototype.hasOwnProperty.call(browser, 'FlipgameV112')) throw new Error('v1.12 composition already installed');\nvar platform = Object.create(null);\n['localStorage', 'navigator', 'crypto', 'AbortController'].forEach(function (key) { try { platform[key] = browser[key]; } catch (_) { platform[key] = null; } });\nObject.freeze(platform);\nvar definitions = {\n${definitions.join(',\n')}\n};\nvar cache = Object.create(null);\nfunction require(id) {\n if (!Object.prototype.hasOwnProperty.call(definitions, id)) throw new Error('Unknown private module: ' + id);\n if (!Object.prototype.hasOwnProperty.call(cache, id)) cache[id] = definitions[id](require);\n return cache[id];\n}\n${entry}\nObject.defineProperty(browser, 'FlipgameV112', { value: createBrowserApplication(require, platform, ${JSON.stringify(identity)}), enumerable: true, configurable: false, writable: false });\n})(globalThis);\n`;
// Statistics is a diagnostics-only shared writer, never a reward dependency.
const composed = output.replace('Object.freeze(platform);',
  'platform.statsModule = browser.FlipgameV111Stats || null;\nObject.freeze(platform);');
new vm.Script(composed, { filename: 'v112-browser-bundle.js' });
const destination = path.join(root, 'js/v112-browser-bundle.js');
if (process.argv.includes('--check')) {
  if (normalize(await readFile(destination, 'utf8')) !== composed) throw new Error('Browser bundle is stale; rebuild it');
  console.log('Browser composition matches all ' + sources.length + ' source modules: ' + identity.slice(0, 12));
} else {
  await writeFile(destination, composed);
  console.log('Built private browser composition: ' + identity.slice(0, 12) + ' (' + composed.length + ' bytes)');
}
