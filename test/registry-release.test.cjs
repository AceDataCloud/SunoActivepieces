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

test('readback bypasses cached absence and verifies actual archive integrity and provenance', () => {
  const crypto = require('node:crypto');
  const { execFileSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-readback-test-'));
  try {
    const packageRoot = path.join(directory, 'package');
    for (const subdirectory of ['examples', 'dist/src', 'docs/screenshots']) fs.mkdirSync(path.join(packageRoot, subdirectory), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'README.md'), 'utm_source=opensource service_activepieces_readme_api_key');
    fs.writeFileSync(path.join(packageRoot, 'README.zh-CN.md'), '中文');
    fs.writeFileSync(path.join(packageRoot, 'examples/quickstart.json'), '{}');
    fs.writeFileSync(path.join(packageRoot, 'dist/src/index.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(packageRoot, 'docs/screenshots/source.json'), '{}');
    const archive = path.join(directory, 'package.tgz');
    execFileSync('tar', ['-czf', archive, '-C', directory, 'package']);
    const tarball = fs.readFileSync(archive);
    const metadata = { name: pkg.name, version: pkg.version, dist: {
      tarball: 'https://registry.npmjs.org/test.tgz', integrity: 'sha512-' + crypto.createHash('sha512').update(tarball).digest('base64'),
      attestations: { url: 'https://registry.npmjs.org/test-attestation' },
    } };
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(pkg));
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.copyFileSync('scripts/registry-release.cjs', path.join(directory, 'scripts/registry-release.cjs'));
    const preload = path.join(directory, 'fetch.cjs');
    fs.writeFileSync(preload, `const fs=require('node:fs'); const metadata=${JSON.stringify(metadata)};
      global.fetch = async value => { const url=new URL(value);
        if(url.pathname==='/test.tgz')return new Response(fs.readFileSync(${JSON.stringify(archive)}));
        if(url.pathname==='/test-attestation')return new Response(JSON.stringify({attestations:[{predicateType:'https://slsa.dev/provenance/v1'}]}));
        if(!url.searchParams.has('ace_readback'))throw new Error('Readback must bypass cached metadata.');
        if(url.pathname.endsWith('/'+metadata.version))return new Response('{}',{status:404});
        return new Response(JSON.stringify({versions:{[metadata.version]:metadata}})); };
    `);
    const result = spawnSync(process.execPath, ['--require', preload, 'scripts/registry-release.cjs', 'verify'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'artifacts/registry-readback.json')));
    assert.equal(receipt.integrity, metadata.dist.integrity);
    assert.equal(receipt.slsa_provenance, true);
    assert.equal(receipt.credential_free_examples, true);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
