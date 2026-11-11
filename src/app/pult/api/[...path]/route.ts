import { NextRequest, NextResponse } from 'next/server';
import { transportKey, verifyPeer } from '@/lib/pult/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const allowed = new Set(['session', 'status', 'auth/telegram', 'auth/code/request', 'auth/code', 'logout', 'action']);
const maxBody = 16_384;

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = path.join('/');
  if (!allowed.has(route)) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
  if ((request.method === 'GET') !== ['session', 'status'].includes(route))
    return NextResponse.json({ error: 'Метод не разрешён' }, { status: 405 });
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    return NextResponse.json({ error: 'Запрос с другого сайта запрещён' }, { status: 403 });
  try {
    const key = transportKey();
    const proof = verifyPeer(request.headers, request.method,
      request.nextUrl.pathname + request.nextUrl.search, key);
    // Without a socket proof, even authenticated requests fail closed. Host/XFF
    // can never grant local access or decide cookie security on their own.
    if (!proof) return NextResponse.json({ error: 'Не удалось проверить соединение' }, { status: 403 });
    const headers = new Headers({
      'x-ops-transport': key, 'x-ops-local': proof.local ? '1' : '0',
      'x-ops-secure': proof.secure ? '1' : '0',
    });
    for (const name of ['cookie', 'content-type', 'x-csrf-token']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    let body: Uint8Array | undefined;
    if (request.method === 'POST') {
      const chunks: Uint8Array[] = [];
      const reader = request.body?.getReader();
      let length = 0;
      while (reader) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.length;
        if (length > maxBody) {
          await reader.cancel();
          return NextResponse.json({ error: 'Слишком большой запрос' }, { status: 413 });
        }
        chunks.push(item.value);
      }
      body = Buffer.concat(chunks);
    }
    const upstream = await fetch(`http://127.0.0.1:3112/${route}`, {
      method: request.method, headers, body: body as BodyInit | undefined,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    const result = new NextResponse(await upstream.text(), { status: upstream.status });
    result.headers.set('Content-Type', 'application/json; charset=utf-8');
    result.headers.set('Cache-Control', 'private, no-store');
    const cookie = upstream.headers.get('set-cookie');
    if (cookie) result.headers.set('Set-Cookie', cookie);
    return result;
  } catch {
    return NextResponse.json({ error: 'Сторож очередей недоступен. Повторите позже.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = forward;
export const POST = forward;
