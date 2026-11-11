import { Server, type IncomingMessage } from 'node:http';
import { signPeer, transportKey, type PeerProof } from './transport';

const installed = Symbol.for('office.pult.peer-installed');
const proxyHeaders = ['forwarded', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip',
  'true-client-ip', 'x-forwarded-host', 'x-forwarded-proto'];

export function peerFromSocket(req: IncomingMessage, now = Date.now()): PeerProof {
  const address = req.socket.remoteAddress;
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '');
  const host = req.headers.host || '';
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  return {
    at: now,
    local: loopback && localHost && !proxyHeaders.some(h => req.headers[h] !== undefined),
    secure: Boolean((req.socket as typeof req.socket & { encrypted?: boolean }).encrypted) ||
      (loopback && req.headers['x-forwarded-proto'] === 'https'),
    method: req.method || '', target: req.url || '', host,
  };
}

// Next's Web Request omits socket.remoteAddress. Capture it before Next processes
// the request; overwrite all caller-supplied proofs, and fail closed without a key.
// The hook changes only /pult/api requests, leaving the office and WS untouched.
export function installPultPeerProof() {
  const proto = Server.prototype as typeof Server.prototype & { [installed]?: boolean };
  if (proto[installed]) return;
  proto[installed] = true;
  const original = proto.emit;
  proto.emit = function (event: string | symbol, ...args: unknown[]): boolean {
    const req = args[0] as IncomingMessage | undefined;
    if (event === 'request' && req?.url?.startsWith('/pult/api/')) {
      delete req.headers['x-pult-peer-proof'];
      try { req.headers['x-pult-peer-proof'] = signPeer(peerFromSocket(req), transportKey()); }
      catch { /* Missing service/key disables anonymous reads; auth API returns 503. */ }
    }
    return Reflect.apply(original, this, [event, ...args]) as boolean;
  };
}
