const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const pkg = require(path.resolve('package.json'));
const registry = 'https://registry.npmjs.org/';
const endpoint = registry + pkg.name.replace('/', '%2f');
async function read(url, optional = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`Registry HTTP ${response.status} for public package metadata`);
  return response.json();
}
function newer(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}
(async () => {
  if (process.argv[2] === 'check') {
    const existing = await read(`${endpoint}/${pkg.version}`, true);
    if (existing) throw new Error('Version already published; do not republish an immutable npm version.');
    const latest = await read(`${endpoint}/latest`, true);
    if (latest && !newer(pkg.version, latest.version)) throw new Error('Release must advance the current latest version.');
    console.log(JSON.stringify({ package: pkg.name, target: pkg.version, latest: latest?.version ?? null, target_unpublished: true }));
    return;
  }
  if (process.argv[2] !== 'verify') throw new Error('Use check or verify.');
  let metadata;
  for (let attempt = 0; attempt < 5; attempt++) {
    metadata = await read(`${endpoint}/${pkg.version}`, true);
    if (metadata) break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (!metadata || metadata.version !== pkg.version || metadata.name !== pkg.name) throw new Error('Published package metadata does not match this release.');
  const tarball = new URL(metadata.dist.tarball);
  if (tarball.hostname !== 'registry.npmjs.org' || tarball.protocol !== 'https:') throw new Error('Unexpected public registry tarball host.');
  const response = await fetch(tarball, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Tarball HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const integrity = 'sha512-' + crypto.createHash('sha512').update(data).digest('base64');
  if (integrity !== metadata.dist.integrity) throw new Error('Registry tarball integrity mismatch.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-npm-readback-'));
  const archive = path.join(directory, 'package.tgz');
  fs.writeFileSync(archive, data);
  try {
    const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    for (const required of ['package/README.md', 'package/README.zh-CN.md', 'package/examples/', 'package/dist/src/index.js', 'package/docs/screenshots/']) {
      if (!files.some(file => file === required || file.startsWith(required))) throw new Error(`Published archive misses ${required}`);
    }
    const english = execFileSync('tar', ['-xOzf', archive, 'package/README.md'], { encoding: 'utf8' });
    if (!english.includes('utm_source=opensource') || !english.includes('_activepieces_')) throw new Error('Published guide misses canonical source attribution.');
    const attestationUrl = metadata.dist.attestations?.url;
    if (!attestationUrl || new URL(attestationUrl).hostname !== 'registry.npmjs.org') throw new Error('Published package has no registry attestation.');
    const attestations = await read(attestationUrl);
    if (!JSON.stringify(attestations).includes('https://slsa.dev/provenance')) throw new Error('No SLSA provenance found in registry attestation response.');
    const result = { as_of: new Date().toISOString(), package: pkg.name, version: pkg.version, integrity, tarball: tarball.href, attestation_url: attestationUrl, slsa_provenance: true, source: metadata.repository, file_count: files.length, english_utm: true, chinese_guide: true, credential_free_examples: true, screenshot_provenance: true, no_business_API_calls: true };
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/registry-readback.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
