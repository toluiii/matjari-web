import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const context = { params: Promise.resolve({ path: ['auth', 'session'] }) };

function request(url = 'http://localhost:3000/api/auth/session', init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('same-origin API proxy', () => {
  it('fails closed when server-only upstream settings are missing', async () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    vi.stubEnv('PROXY_SHARED_SECRET', '');
    const response = await GET(request(), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'api_unavailable' } });
  });

  it('rejects cross-origin mutations before contacting the API', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:8080');
    vi.stubEnv('PROXY_SHARED_SECRET', 'p'.repeat(64));
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await POST(request('http://localhost:3000/api/products', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    }), { params: Promise.resolve({ path: ['products'] }) });
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('forwards only trusted session cookies and private headers to the configured API', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:8080');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('PROXY_SHARED_SECRET', 'p'.repeat(64));
    const token = 'a'.repeat(64);
    let forwarded: { url: string; headers: Headers; body: string } | undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded = {
        url: String(input),
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? init.body : init?.body instanceof ArrayBuffer ? new TextDecoder().decode(init.body) : '',
      };
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req-test', 'set-cookie': 'matjari_session=opaque; Path=/; HttpOnly; SameSite=Lax' },
      });
    }));

    const response = await POST(request('http://localhost:3000/api/products?search=milk', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        'x-csrf-token': token,
        'x-matjari-client': 'web',
        'idempotency-key': '6b568df8-8dd4-4caa-94ec-7004b1dd8ec1',
        'x-forwarded-for': '203.0.113.10, 10.0.0.2',
        cookie: `matjari_csrf=${token}; unrelated=do-not-forward`,
      },
      body: JSON.stringify({ name: 'Milk' }),
    }), { params: Promise.resolve({ path: ['products'] }) });

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-request-id')).toBe('req-test');
    expect(response.headers.getSetCookie().join(';')).toContain('matjari_session=opaque');
    expect(forwarded?.url).toBe('http://api.internal:8080/api/products?search=milk');
    expect(forwarded?.headers.get('x-matjari-proxy')).toBe('p'.repeat(64));
    expect(forwarded?.headers.get('origin')).toBe('http://localhost:3000');
    expect(forwarded?.headers.get('cookie')).toBe(`matjari_csrf=${token}`);
    expect(forwarded?.headers.get('x-client-ip')).toBe('203.0.113.10');
    expect(forwarded?.body).toBe(JSON.stringify({ name: 'Milk' }));
  });
});
