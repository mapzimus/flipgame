const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'build-apk.yml'), 'utf8');

assert.match(workflow, /push:\s*\n\s*branches: \[master\]/,
  'production workflow must run for every master update');
assert.doesNotMatch(workflow, /branches: \[master\][\s\S]{0,80}\n\s+paths:/,
  'master deployment must not silently skip future source paths');
assert.match(workflow, /group: flipgame-production-\$\{\{ github\.ref \}\}/,
  'production updates require serialized concurrency');
assert.match(workflow, /needs: build/,
  'mapzimus.com deployment must wait for the complete APK and game qualification job');
assert.match(workflow, /Reject a reused public release identity/,
  'same-version commits must fail before either public origin can advance');
assert.match(workflow, /repository: mapzimus\/lab/);
assert.match(workflow, /ssh-key: \$\{\{ secrets\.LAB_DEPLOY_KEY \}\}/,
  'Lab access must use the repository-scoped deploy key');
assert.match(workflow,
  /node lab\/scripts\/sync-flipgame\.mjs --source flipgame --source-commit "\$GITHUB_SHA"/,
  'Lab must receive the exact qualified checkout through its guarded sync command');
assert.match(workflow, /npm run check/, 'the complete Lab site must pass before publication');
assert.match(workflow, /RELEASE_VERSION: \$\{\{ steps\.build_metadata\.outputs\.release_version \}\}/,
  'immutable release publication must follow the game release metadata');
assert.doesNotMatch(workflow, /gh release (?:view|create|upload) v1\.11/,
  'future version bumps must not require hand-editing release commands');
assert.match(workflow, /git -C lab add -- vendor\/apps\/flip-game/,
  'automation may stage only the owned Flipgame snapshot');
assert.match(workflow, /git -C lab push origin HEAD:main/);
assert.match(workflow, /uses: actions\/upload-pages-artifact@v3/);
assert.match(workflow, /uses: actions\/deploy-pages@v4/);
assert.match(workflow, /deploy_github_pages:[\s\S]*needs: publish_mapzimus/,
  'GitHub Pages must wait for the verified Cloudflare publication');
assert.match(workflow, /verify_dual_origins:[\s\S]*verify-dual-deployment\.mjs/,
  'a final job must reconcile provenance and bytes at both public origins');
assert.doesNotMatch(workflow, /git[^\n]*(?:push[^\n]*--force|add\s+-A|add\s+--all)/,
  'deployment must not force-push or stage unrelated Lab files');
assert.match(workflow, /rev-parse origin\/master/,
  'an obsolete workflow run must not publish after master advances');

console.log('Dual GitHub Pages and mapzimus.com deployment tests passed.');
