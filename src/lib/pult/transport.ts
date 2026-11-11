import { readFileSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Server only. This is a separate local transport key, never the Telegram token.
export function transportKey(): string {
  const key = readFileSync(process.env.OPS_TRANSPORT_KEY_FILE ||
    '/home/q/work/office-bridge/ops-transport.key', 'utf8').trim();
  if (key.length < 32) throw new Error('Ops transport unavailable');
  return key;
}

export interface PeerProof {
  at: number;
  local: boolean;
  secure: boolean;
  method: string;
  target: string;
  host: string;
}

export function signPeer(proof: PeerProof, key: string): string {
  const body = Buffer.from(JSON.stringify(proof)).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('hex')}`;
}

export function verifyPeer(headers: Headers, method: string, target: string, key: string,
  now = Date.now()): PeerProof | null {
  const parts = (headers.get('x-pult-peer-proof') || '').split('.');
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', key).update(parts[0]).digest();
  if (!timingSafeEqual(expected, Buffer.from(parts[1], 'hex'))) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as PeerProof;
    if (!Number.isFinite(p.at) || Math.abs(now - p.at) > 30_000 || p.method !== method ||
      p.target !== target || p.host !== headers.get('host') ||
      typeof p.local !== 'boolean' || typeof p.secure !== 'boolean') return null;
    return p;
  } catch { return null; }
}
