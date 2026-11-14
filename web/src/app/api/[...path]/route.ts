import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cookieNames = new Set([
  'matjari_session',
  'matjari_csrf',
  '__Host-matjari_session',
  '__Host-matjari_csrf',
]);
const responseHeaderNames = ['content-type', 'retry-after', 'x-request-id'];

type RouteContext = { params: Promise<{ path: string[] }> };
type AllowedMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function clientAddress(request: NextRequest): string | null {
  // The deployment proxy must overwrite/sanitize X-Forwarded-For. Only a syntactically valid
  // IP is forwarded; the API trusts it only when this private proxy also supplies its secret.
  const value = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return value && isIP(value) ? value : null;
}

async function proxy(request: NextRequest, context: RouteContext, method: AllowedMethod): Promise<NextResponse> {
  const internalUrl = process.env.API_INTERNAL_URL;
  const proxySecret = process.env.PROXY_SHARED_SECRET;
  if (!internalUrl || !proxySecret || proxySecret.length < 32) {
    return jsonError(503, 'api_unavailable', 'الخدمة غير متاحة مؤقتًا. حاول مرة أخرى لاحقًا.');
  }

  const { path } = await context.params;
  if (!path.length || path.some((part) => part === '.' || part === '..' || /[\u0000-\u001f]/.test(part))) {
    return jsonError(400, 'invalid_path', 'مسار الطلب غير صالح.');
  }

  let target: URL;
  try {
    const base = new URL(internalUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
      return jsonError(500, 'api_configuration_error', 'تعذّر إعداد الاتصال بالخدمة.');
    }
    const encodedPath = path.map((part) => encodeURIComponent(part)).join('/');
    target = new URL(`/api/${encodedPath}${request.nextUrl.search}`, base);
  } catch {
    return jsonError(500, 'api_configuration_error', 'تعذّر إعداد الاتصال بالخدمة.');
  }

  const headers = new Headers({
    Accept: request.headers.get('accept') ?? 'application/json',
    'X-Matjari-Proxy': proxySecret,
    'X-Matjari-Client': 'web',
  });
  const incomingOrigin = request.headers.get('origin');
  if (method !== 'GET') {
    if (!incomingOrigin) return jsonError(403, 'forbidden', 'الطلب غير مسموح.');
    try {
      if (new URL(incomingOrigin).origin !== request.nextUrl.origin) return jsonError(403, 'forbidden', 'الطلب غير مسموح.');
    } catch {
      return jsonError(403, 'forbidden', 'الطلب غير مسموح.');
    }
  }
  for (const name of ['content-type', 'x-csrf-token', 'idempotency-key', 'sec-fetch-site']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const backendOrigin = process.env.APP_ORIGIN ?? process.env.API_PUBLIC_ORIGIN ?? incomingOrigin;
  if (backendOrigin) headers.set('origin', backendOrigin);
  const cookies = request.cookies.getAll().filter(({ name }) => cookieNames.has(name));
  if (cookies.length) headers.set('cookie', cookies.map(({ name, value }) => `${name}=${value}`).join('; '));
  const ip = clientAddress(request);
  if (ip) headers.set('X-Client-IP', ip);

  let body: ArrayBuffer | undefined;
  if (!['GET', 'HEAD'].includes(method)) {
    body = await request.arrayBuffer();
    if (body.byteLength > 65_536) return jsonError(413, 'body_too_large', 'حجم الطلب أكبر من المسموح.');
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return jsonError(504, 'api_timeout', 'استغرق الطلب وقتًا أطول من المعتاد. حاول مرة أخرى.');
    }
    return jsonError(502, 'api_unreachable', 'تعذّر الاتصال بالخدمة. حاول مرة أخرى لاحقًا.');
  }

  const responseHeaders = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const name of responseHeaderNames) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const value of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', value);

  const responseBody = upstream.status === 204 || upstream.status === 304 ? null : upstream.body;
  return new NextResponse(responseBody, { status: upstream.status, headers: responseHeaders });
}

export function GET(request: NextRequest, context: RouteContext) { return proxy(request, context, 'GET'); }
export function POST(request: NextRequest, context: RouteContext) { return proxy(request, context, 'POST'); }
export function PUT(request: NextRequest, context: RouteContext) { return proxy(request, context, 'PUT'); }
export function PATCH(request: NextRequest, context: RouteContext) { return proxy(request, context, 'PATCH'); }
export function DELETE(request: NextRequest, context: RouteContext) { return proxy(request, context, 'DELETE'); }
