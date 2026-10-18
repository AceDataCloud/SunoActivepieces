const assert = require('node:assert/strict');
const test = require('node:test');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { httpClient } = require('../dist/src/lib/secure-http.js');

test('requests explicitly verify certificates and never retry or expose HTTP error payloads', async () => {
  const original = https.request;
  const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  const requests = [];
  const responses = [
    { status: 200, body: '{"task_id":"same-task"}' },
    { status: 429, body: '{"error":"private upstream detail","api_key":"secret"}' },
    { status: 403, body: '{"error":"private moderation detail"}' },
  ];
  https.request = (url, options, callback) => {
    const pending = new EventEmitter();
    pending.setTimeout = () => pending;
    pending.end = (body) => {
      requests.push({ url, options, body });
      const next = responses.shift();
      const response = new EventEmitter();
      response.statusCode = next.status;
      response.setEncoding = () => {};
      callback(response);
      queueMicrotask(() => {
        response.emit('data', next.body);
        response.emit('end');
      });
    };
    return pending;
  };
  try {
    const request = { method: 'POST', url: 'https://api.acedata.cloud/example/tasks',
      headers: { Authorization: 'Bearer offline-test' }, body: { action: 'retrieve', id: 'same-task' }, retries: 2 };
    assert.deepEqual(await httpClient.sendRequest(request), { status: 200, body: { task_id: 'same-task' } });
    for (const status of [429, 403]) {
      await assert.rejects(httpClient.sendRequest(request), (error) => {
        assert.equal(error.response.status, status);
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(error.message, /private|secret|offline-test/);
        return true;
      });
    }
    assert.equal(requests.length, 3);
    assert(requests.every(request => request.options.rejectUnauthorized === true));
    assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, before);
    await assert.rejects(httpClient.sendRequest({ ...request, url: 'https://example.com/tasks' }), /Unsupported/);
    assert.equal(requests.length, 3);
  } finally {
    https.request = original;
  }
});

test('untrusted TLS is rejected even when the surrounding process disables certificate checks', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-tls-test-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory, 'key.pem'),
    '-out', path.join(directory, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(path.join(directory, 'key.pem')),
    cert: fs.readFileSync(path.join(directory, 'cert.pem')) }, (_request, response) => response.end('{}'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const original = https.request;
  const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  https.request = (_url, options, callback) => original(new URL(`https://127.0.0.1:${server.address().port}`), options, callback);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    await assert.rejects(httpClient.sendRequest({ method: 'POST', url: 'https://api.acedata.cloud/test', body: {} }), /TLS error/);
  } finally {
    https.request = original;
    if (before === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = before;
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true });
  }
});
