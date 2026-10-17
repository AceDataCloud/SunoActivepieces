import { HttpMethod } from '@activepieces/pieces-common';
import { httpClient } from '../secure-http';

async function postSuno({
  token,
  path,
  body,
}: {
  token: string;
  path: '/suno/audios' | '/suno/tasks';
  body: Record<string, unknown>;
}): Promise<unknown> {
  const response = await httpClient.sendRequest<unknown>({
    method: HttpMethod.POST,
    url: `https://api.acedata.cloud${path}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
    retries: 0,
  });
  return response.body;
}

function normalizeTask({ body, taskId }: { body: unknown; taskId: string }): TaskResult {
  const envelope = record(body);
  const payload = parsePayload('response' in envelope ? envelope.response : body);
  const values = record(payload);
  const states = collectStates(payload);
  const failed = states.some((state) => FAILED_STATES.has(state)) || hasFailure(payload);
  const unfinished = 'finished_at' in envelope && envelope.finished_at === null;
  const finished =
    !unfinished &&
    !failed &&
    ((states.length > 0 && states.every((state) => COMPLETE_STATES.has(state))) ||
      Boolean(envelope.finished_at && hasContent(payload)));
  const traceId = stringValue(values.trace_id) || stringValue(envelope.trace_id);

  return {
    task_id: taskId,
    status: failed && !unfinished ? 'failed' : finished ? 'succeeded' : 'pending',
    success: finished,
    trace_id: traceId,
    media_urls: finished ? collectMediaUrls(payload) : [],
    result: sanitize(payload),
  };
}

function taskIdFromSubmission(body: unknown): string {
  const value = record(body);
  const nestedTask = record(value.task);
  return stringValue(value.task_id) || stringValue(nestedTask.id);
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function collectStates(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectStates);
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const item = record(value);
  return [
    ...['state', 'status'].flatMap((key) => {
      const state = stringValue(item[key]);
      return state ? [state.toLowerCase()] : [];
    }),
    ...['data', 'content', 'task'].flatMap((key) => collectStates(item[key])),
  ];
}

function hasFailure(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasFailure);
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const item = record(value);
  return Boolean(item.error) ||
    (item.success === false && !['pending', 'running', 'processing'].includes(stringValue(item.status || item.state).toLowerCase())) ||
    ['data', 'content', 'task'].some((key) => hasFailure(item[key]));
}

function collectMediaUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(collectMediaUrls))];
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const item = record(value);
  const urls = Object.entries(item).flatMap(([key, child]) => {
    if (['audio_url', 'file_url', 'video_url', 'url'].includes(key) && typeof child === 'string') {
      return child.startsWith('https://') ? [child] : [];
    }
    return collectMediaUrls(child);
  });
  return [...new Set(urls)];
}

function hasContent(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Object.keys(record(value)).length > 0;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()) && !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, child]) => [key, key === 'error' ? 'Task failed; inspect its task or trace ID.' : sanitize(child)]),
  );
}

export const sunoClient = { postSuno, normalizeTask, taskIdFromSubmission };

const COMPLETE_STATES = new Set(['complete', 'completed', 'succeeded', 'succeed', 'success', 'finished']);
const FAILED_STATES = new Set(['failed', 'error', 'cancelled', 'canceled', 'rejected']);
const SENSITIVE_KEYS = new Set([
  'request', 'request_body', 'user_id', 'actor_user_id', 'credential_id', 'authorization_id',
  'application_id', 'api_key', 'access_token', 'refresh_token', 'authorization', 'headers',
  'supplier', 'supplier_id', 'provider_route', 'upstream', 'upstream_model', 'actual_model', 'secret',
]);
const SENSITIVE_KEY_PATTERN = /(^internal(?:_|$)|supplier|upstream|(?:^|_)secret(?:_|$))/i;

export type TaskResult = {
  task_id: string;
  status: 'pending' | 'succeeded' | 'failed';
  success: boolean;
  trace_id: string;
  media_urls: string[];
  result: unknown;
};
