/**
 * The server side of capacitor-game-services: check a phone's proof of who the player is, and get a player ID you
 * can trust. Plain TypeScript with no Node or Capacitor imports, so it runs on Cloudflare Workers, Deno, Bun and Node
 * 18+ (anything with `fetch` and Web Crypto).
 *
 *   import { verifyServerProof } from 'capacitor-game-services/server';
 *   const { platform, playerId } = await verifyServerProof(proofFromPhone, {
 *     gameCenter: { bundleIds: ['com.example.game'] },
 *     playGames: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
 *   });
 *
 * Player IDs are personal data on both platforms: store them hashed if you can, and never show them to anyone.
 */

export interface VerifiedPlayer {
  platform: 'game-center' | 'play-games';
  /** Game Center: the team-scoped player ID. Play Games: the player ID for your game. */
  playerId: string;
}

/** Why a proof was refused. `code` is stable; `message` is for logs, not players. */
export class ProofError extends Error {
  constructor(
    readonly code:
      'bad-proof' | 'wrong-app' | 'untrusted-key' | 'expired' | 'bad-signature' | 'not-configured' | 'platform-error',
    message: string,
  ) {
    super(message);
    this.name = 'ProofError';
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// ---------- Apple Game Center ----------

export interface GameCenterOptions {
  /** Your apps' bundle IDs. A proof for any other app is refused. */
  bundleIds: string[];
  /** How old a proof may be. Default 5 minutes. */
  maxAgeMs?: number;
  /** Hosts allowed to serve Apple's public key. Default: Apple's own domain only (*.apple.com). */
  allowedKeyHost?: (host: string) => boolean;
  /** For tests. */
  now?: () => number;
  fetch?: Fetch;
}

const appleHost = (host: string) => host === 'apple.com' || host.endsWith('.apple.com');
const keyCache = new Map<string, { key: CryptoKey; until: number }>();

/**
 * Checks Apple's identity verification signature (GKLocalPlayer.fetchItems(forIdentityVerificationSignature:)),
 * following Apple's steps: a recent timestamp, a public key fetched only from Apple, and an RSASSA-PKCS1-v1_5 SHA-256
 * signature over the player ID, bundle ID, timestamp (big-endian 64-bit) and salt.
 *
 * Note: the key is trusted because it comes over HTTPS from Apple's own domain and its certificate is in date; the
 * certificate chain isn't walked to Apple's root (Web Crypto can't), which is the usual approach on edge runtimes.
 */
export async function verifyGameCenter(raw: unknown, opts: GameCenterOptions): Promise<VerifiedPlayer> {
  const p = raw as Record<string, unknown>;
  const fields = ['playerId', 'bundleId', 'publicKeyUrl', 'signature', 'salt', 'timestamp'] as const;
  if (
    !p ||
    p.platform !== 'game-center' ||
    fields.some((f) => typeof p[f] !== 'string' || !(p[f] as string).length || (p[f] as string).length > 4096)
  ) {
    throw new ProofError('bad-proof', 'Not a Game Center proof');
  }
  const { playerId, bundleId, publicKeyUrl, signature, salt, timestamp } = p as Record<(typeof fields)[number], string>;
  if (!opts.bundleIds.includes(bundleId)) throw new ProofError('wrong-app', `Proof is for another app: ${bundleId}`);

  let url: URL;
  try {
    url = new URL(publicKeyUrl);
  } catch {
    throw new ProofError('untrusted-key', 'Bad key address');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !(opts.allowedKeyHost ?? appleHost)(url.hostname)
  ) {
    throw new ProofError('untrusted-key', `Key not from Apple: ${url.hostname}`);
  }

  if (!/^\d{1,20}$/.test(timestamp)) throw new ProofError('bad-proof', 'Bad timestamp');
  const ts = BigInt(timestamp);
  const now = BigInt(Math.floor((opts.now ?? Date.now)()));
  const maxAge = BigInt(opts.maxAgeMs ?? 5 * 60_000);
  if (ts > now + 60_000n || now - ts > maxAge) throw new ProofError('expired', 'Proof is too old, or from the future');

  const key = await appleKey(url.toString(), opts);
  const enc = new TextEncoder();
  const data = concat(enc.encode(playerId), enc.encode(bundleId), uint64be(ts), base64(salt, 'salt'));
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64(signature, 'signature'), data);
  if (!ok) throw new ProofError('bad-signature', 'Signature does not match');
  return { platform: 'game-center', playerId };
}

async function appleKey(url: string, opts: GameCenterOptions): Promise<CryptoKey> {
  const now = (opts.now ?? Date.now)();
  const hit = keyCache.get(url);
  if (hit && hit.until > now) return hit.key;
  const res = await (opts.fetch ?? fetch)(url, { redirect: 'error' });
  if (!res.ok) throw new ProofError('untrusted-key', `Apple key fetch failed: ${res.status}`);
  const cert = parseCertificate(new Uint8Array(await res.arrayBuffer()));
  if (now < cert.notBefore || now > cert.notAfter)
    throw new ProofError('untrusted-key', 'Apple key certificate is out of date');
  const key = await crypto.subtle.importKey('spki', cert.spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'verify',
  ]);
  keyCache.set(url, { key, until: Math.min(cert.notAfter, now + 24 * 3600_000) });
  return key;
}

/** Forget cached Apple keys (for tests). */
export const clearKeyCache = (): void => keyCache.clear();

// ---------- Google Play Games ----------

export interface PlayGamesOptions {
  /** The OAuth client ID of your "Games server" credential in Play Console (a web client). */
  clientId: string;
  /** Its client secret. Keep it in a server secret, never in code or the app. */
  clientSecret: string;
  fetch?: Fetch;
}

/**
 * Swaps a Play Games server auth code (GamesSignInClient.requestServerSideAccess) for the player's ID: Google's token
 * endpoint, then Players.get("me"). Each code works once.
 */
export async function verifyPlayGames(raw: unknown, opts: PlayGamesOptions): Promise<VerifiedPlayer> {
  const p = raw as Record<string, unknown>;
  if (
    !p ||
    p.platform !== 'play-games' ||
    typeof p.authCode !== 'string' ||
    !p.authCode.length ||
    p.authCode.length > 2048
  ) {
    throw new ProofError('bad-proof', 'Not a Play Games proof');
  }
  if (!opts.clientId || !opts.clientSecret)
    throw new ProofError('not-configured', 'Play Games client ID or secret missing');
  const f = opts.fetch ?? fetch;
  const token = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: p.authCode,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: '',
    }).toString(),
  });
  const t = (await token.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!token.ok || !t.access_token)
    throw new ProofError('bad-signature', `Google refused the code: ${t.error ?? token.status}`);
  const me = await f('https://games.googleapis.com/games/v1/players/me', {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  const m = (await me.json().catch(() => ({}))) as { playerId?: string };
  if (!me.ok || typeof m.playerId !== 'string' || !m.playerId)
    throw new ProofError('platform-error', `Play Games player lookup failed: ${me.status}`);
  return { platform: 'play-games', playerId: m.playerId };
}

// ---------- either ----------

/** Checks a proof from either platform. A platform you don't configure is refused. */
export async function verifyServerProof(
  raw: unknown,
  opts: { gameCenter?: GameCenterOptions; playGames?: PlayGamesOptions },
): Promise<VerifiedPlayer> {
  const platform = (raw as { platform?: unknown } | null)?.platform;
  if (platform === 'game-center') {
    if (!opts.gameCenter) throw new ProofError('not-configured', 'Game Center not configured');
    return verifyGameCenter(raw, opts.gameCenter);
  }
  if (platform === 'play-games') {
    if (!opts.playGames) throw new ProofError('not-configured', 'Play Games not configured');
    return verifyPlayGames(raw, opts.playGames);
  }
  throw new ProofError('bad-proof', 'Unknown platform');
}

// ---------- small helpers ----------

function base64(s: string, what: string): Uint8Array<ArrayBuffer> {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    throw new ProofError('bad-proof', `Bad ${what}`);
  }
}

function uint64be(n: bigint): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, false);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------- just enough X.509 to get the public key and dates ----------

interface Tlv {
  tag: number;
  start: number;
  end: number;
  next: number;
}

function tlv(b: Uint8Array, at: number): Tlv {
  if (at + 2 > b.length) throw new ProofError('untrusted-key', 'Bad certificate');
  const tag = b[at];
  let len = b[at + 1],
    start = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4 || start + n > b.length) throw new ProofError('untrusted-key', 'Bad certificate');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[start + i];
    start += n;
  }
  const end = start + len;
  if (end > b.length) throw new ProofError('untrusted-key', 'Bad certificate');
  return { tag, start, end, next: end };
}

function time(b: Uint8Array, t: Tlv): number {
  const s = new TextDecoder().decode(b.subarray(t.start, t.end));
  const m =
    t.tag === 0x17
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s)
      : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) throw new ProofError('untrusted-key', 'Bad certificate date');
  let year = Number(m[1]);
  if (t.tag === 0x17) year += year < 50 ? 2000 : 1900;
  return Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

/** Reads a DER (or PEM) X.509 certificate: its public key (SubjectPublicKeyInfo) and validity dates. */
export function parseCertificate(input: Uint8Array): {
  spki: Uint8Array<ArrayBuffer>;
  notBefore: number;
  notAfter: number;
} {
  let b = input;
  const text = new TextDecoder().decode(input.subarray(0, 32));
  if (text.startsWith('-----BEGIN')) {
    const pem = new TextDecoder()
      .decode(input)
      .replace(/-----[^-]+-----/g, '')
      .replace(/\s+/g, '');
    b = base64(pem, 'certificate');
  }
  const cert = tlv(b, 0);
  const tbs = tlv(b, cert.start);
  if (cert.tag !== 0x30 || tbs.tag !== 0x30) throw new ProofError('untrusted-key', 'Bad certificate');
  let at = tbs.start;
  let el = tlv(b, at);
  if (el.tag === 0xa0) {
    at = el.next;
    el = tlv(b, at);
  } // version
  at = el.next; // serial number
  at = tlv(b, at).next; // signature algorithm
  at = tlv(b, at).next; // issuer
  const validity = tlv(b, at);
  const nb = tlv(b, validity.start),
    na = tlv(b, nb.next);
  at = validity.next;
  at = tlv(b, at).next; // subject
  const spki = tlv(b, at);
  if (spki.tag !== 0x30) throw new ProofError('untrusted-key', 'Bad certificate');
  return { spki: new Uint8Array(b.subarray(at, spki.end)), notBefore: time(b, nb), notAfter: time(b, na) };
}
