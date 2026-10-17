import * as https from 'node:https';

type Request = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  retries?: number;
};

// Keep credentials on the documented API host and verify TLS even if the host
// process or an unrelated Piece has changed NODE_TLS_REJECT_UNAUTHORIZED.
export const httpClient = {
  async sendRequest<T>(request: Request): Promise<{ status: number; body: T }> {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.hostname !== 'api.acedata.cloud' || url.port) {
      throw new Error('Unsupported Ace Data Cloud API host.');
    }
    const payload = request.body === undefined ? undefined : JSON.stringify(request.body);
    return new Promise((resolve, reject) => {
      const pending = https.request(url, {
        method: request.method,
        rejectUnauthorized: true,
        headers: {
          ...request.headers,
          ...(payload === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(payload)) }),
        },
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => { body += chunk; });
        response.on('error', () => reject(new Error('Ace Data Cloud response interrupted. Inspect request history before resubmitting.')));
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            const error = new Error(`Ace Data Cloud HTTP ${status}. Inspect request history before resubmitting.`);
            Object.assign(error, { response: { status } });
            reject(error);
            return;
          }
          try {
            resolve({ status, body: JSON.parse(body) as T });
          } catch {
            reject(new Error('Ace Data Cloud returned invalid JSON. Inspect request history before resubmitting.'));
          }
        });
      });
      pending.setTimeout(120_000, () => pending.destroy(new Error('Request timeout')));
      pending.on('error', () => reject(new Error('Ace Data Cloud network or TLS error. Inspect request history before resubmitting.')));
      pending.end(payload);
    });
  },
};
