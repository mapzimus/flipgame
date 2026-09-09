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
sources.push(['v112-browser-entry', createHash('sha256').update(entry).digest('hex')]);
const identity = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
const output = `// GENERATED by scripts/build-v112-browser.mjs; do not edit.\n// Source identity: ${identity}\n(function (browser) {\n'use strict';\nif (Object.prototype.hasOwnProperty.call(browser, 'FlipgameV112')) throw new Error('v1.12 composition already installed');\nvar platform = Object.create(null);\n['localStorage', 'navigator', 'crypto', 'AbortController'].forEach(function (key) { try { platform[key] = browser[key]; } catch (_) { platform[key] = null; } });\nObject.freeze(platform);\nvar definitions = {\n${definitions.join(',\n')}\n};\nvar cache = Object.create(null);\nfunction require(id) {\n if (!Object.prototype.hasOwnProperty.call(definitions, id)) throw new Error('Unknown private module: ' + id);\n if (!Object.prototype.hasOwnProperty.call(cache, id)) cache[id] = definitions[id](require);\n return cache[id];\n}\n${entry}\nObject.defineProperty(browser, 'FlipgameV112', { value: createBrowserApplication(require, platform, ${JSON.stringify(identity)}), enumerable: true, configurable: false, writable: false });\n})(globalThis);\n`;
new vm.Script(output, { filename: 'v112-browser-bundle.js' });
const destination = path.join(root, 'js/v112-browser-bundle.js');
if (process.argv.includes('--check')) {
  if (normalize(await readFile(destination, 'utf8')) !== output) throw new Error('Browser bundle is stale; rebuild it');
  console.log('Browser composition matches all ' + sources.length + ' source modules: ' + identity.slice(0, 12));
} else {
  await writeFile(destination, output);
  console.log('Built private browser composition: ' + identity.slice(0, 12) + ' (' + output.length + ' bytes)');
}
