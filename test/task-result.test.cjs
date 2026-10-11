const assert = require('node:assert/strict');
const test = require('node:test');

const { sunoClient } = require('../dist/src/lib/common/client.js');

test('a streaming preview stays pending', () => {
  const result = sunoClient.normalizeTask({
    taskId: 'one-task',
    body: {
      finished_at: null,
      response: { state: 'pending', data: [{ audio_url: 'https://example.com/preview.mp3' }] },
    },
  });
  assert.equal(result.status, 'pending');
  assert.equal(result.success, false);
  assert.deepEqual(result.media_urls, []);
});

test('a finished task exposes its audio and hides internal routing', () => {
  const result = sunoClient.normalizeTask({
    taskId: 'same-task',
    body: {
      finished_at: '2026-10-11T00:00:00Z',
      response: JSON.stringify({
        state: 'complete',
        data: [{ audio_url: 'https://example.com/final.mp3', supplier: 'internal' }],
      }),
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.success, true);
  assert.deepEqual(result.media_urls, ['https://example.com/final.mp3']);
  assert.equal(JSON.stringify(result).includes('internal'), false);
});

test('failed tasks cannot appear as successful media', () => {
  const result = sunoClient.normalizeTask({
    taskId: 'failed-task',
    body: { response: { state: 'failed', error: { message: 'private detail' }, audio_url: 'https://example.com/preview.mp3' } },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.success, false);
  assert.deepEqual(result.media_urls, []);
  assert.equal(JSON.stringify(result).includes('private detail'), false);
});
