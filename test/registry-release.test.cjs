const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const pkg = require('../package.json');

function checkRelease(existing, latest) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-release-guard-test-'));
  const preload = path.join(directory, 'fetch.cjs');
  fs.writeFileSync(preload, `global.fetch = async url => {
    const body = String(url).endsWith('/latest') ? ${JSON.stringify(latest)} : ${JSON.stringify(existing)};
    return new Response(JSON.stringify(body), { status: body === null ? 404 : 200, headers: {'Content-Type':'application/json'} });
  };`);
  try {
    return spawnSync(process.execPath, ['--require', preload, 'scripts/registry-release.cjs', 'check'], { encoding: 'utf8' });
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
}

test('release guard accepts a new immutable version and rejects collision or regression', () => {
  const initial = checkRelease(null, null);
  assert.equal(initial.status, 0, initial.stderr);
  assert.equal(JSON.parse(initial.stdout).target_unpublished, true);
  const collision = checkRelease({ name: pkg.name, version: pkg.version }, null);
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /already published/);
  const regression = checkRelease(null, { version: '99.0.0' });
  assert.notEqual(regression.status, 0);
  assert.match(regression.stderr, /advance/);
});
