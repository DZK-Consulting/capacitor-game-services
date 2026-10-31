import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';

import {
  clearKeyCache,
  parseCertificate,
  ProofError,
  verifyGameCenter,
  verifyPlayGames,
  verifyServerProof,
} from '../src/server';

// A test-only key and self-signed certificate (test/fixtures), standing in for Apple's.
const KEY = readFileSync(new URL('./fixtures/test-key.pem', import.meta.url), 'utf8');
const CERT_DER = new Uint8Array(readFileSync(new URL('./fixtures/test-cert.der', import.meta.url)));
const CERT_PEM = new Uint8Array(readFileSync(new URL('./fixtures/cert.pem', import.meta.url)));
const KEY_URL = 'https://static.gc.apple.com/public-key/gc-prod-test.cer';
const NOW = Date.UTC(2027, 0, 15, 10);

function sign(playerId: string, bundleId: string, timestamp: bigint, salt: Buffer): string {
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(timestamp);
  const s = createSign('RSA-SHA256');
  s.update(Buffer.concat([Buffer.from(playerId, 'utf8'), Buffer.from(bundleId, 'utf8'), ts, salt]));
  return s.sign(KEY).toString('base64');
}

function proof(over: Record<string, string> = {}) {
  const salt = Buffer.from('0123456789abcdef');
  const timestamp = BigInt(NOW - 30_000);
  const base = {
    platform: 'game-center',
    playerId: 'T:_abc123',
    bundleId: 'com.example.game',
    publicKeyUrl: KEY_URL,
    salt: salt.toString('base64'),
    timestamp: timestamp.toString(),
  };
  return { ...base, signature: sign(base.playerId, base.bundleId, timestamp, salt), ...over };
}

let fetched: string[] = [];
const fakeFetch = async (url: string) => {
  fetched.push(url);
  return new Response(CERT_DER, { status: 200 });
};
const gc = { bundleIds: ['com.example.game'], now: () => NOW, fetch: fakeFetch };

beforeEach(() => {
  fetched = [];
  clearKeyCache();
});

const code = async (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof ProofError ? e.code : `not a ProofError: ${String(e)}`),
  );

describe('Game Center proof', () => {
  test('a good proof gives the player ID', async () => {
    expect(await verifyGameCenter(proof(), gc)).toEqual({ platform: 'game-center', playerId: 'T:_abc123' });
    expect(fetched).toEqual([KEY_URL]);
  });

  test("Apple's key is fetched once and reused", async () => {
    await verifyGameCenter(proof(), gc);
    await verifyGameCenter(proof(), gc);
    expect(fetched.length).toBe(1);
  });

  test('a different player, app, salt or time breaks the signature', async () => {
    const good = proof();
    expect(await code(verifyGameCenter({ ...good, playerId: 'T:_someone_else' }, gc))).toBe('bad-signature');
    expect(
      await code(verifyGameCenter({ ...good, salt: Buffer.from('another salt!!!!').toString('base64') }, gc)),
    ).toBe('bad-signature');
    expect(await code(verifyGameCenter({ ...good, timestamp: String(NOW - 10_000) }, gc))).toBe('bad-signature');
    expect(
      await code(
        verifyGameCenter(
          { ...good, bundleId: 'com.example.other' },
          { ...gc, bundleIds: ['com.example.game', 'com.example.other'] },
        ),
      ),
    ).toBe('bad-signature');
  });

  test("another app's proof is refused before anything is fetched", async () => {
    expect(await code(verifyGameCenter(proof(), { ...gc, bundleIds: ['com.example.mine'] }))).toBe('wrong-app');
    expect(fetched).toEqual([]);
  });

  test("keys only from Apple's own domain, over HTTPS", async () => {
    for (const u of [
      'https://evil.example/key.cer',
      'http://static.gc.apple.com/key.cer',
      'https://static.gc.apple.com.evil.example/key.cer',
      'https://user@static.gc.apple.com/key.cer',
      'https://static.gc.apple.com:8443/key.cer',
      'not a url',
    ]) {
      expect(await code(verifyGameCenter(proof({ publicKeyUrl: u }), gc)), u).toBe('untrusted-key');
    }
    expect(fetched).toEqual([]);
  });

  test('old or future proofs are refused', async () => {
    expect(await code(verifyGameCenter(proof(), { ...gc, now: () => NOW + 10 * 60_000 }))).toBe('expired');
    expect(await code(verifyGameCenter(proof({ timestamp: String(NOW + 5 * 60_000) }), gc))).toBe('expired');
    expect(await code(verifyGameCenter(proof({ timestamp: '12abc' }), gc))).toBe('bad-proof');
  });

  test('an out-of-date certificate is refused', async () => {
    const later = Date.UTC(2070, 0, 1);
    const p = proof();
    const ts = BigInt(later - 1000),
      salt = Buffer.from('0123456789abcdef');
    expect(
      await code(
        verifyGameCenter(
          { ...p, timestamp: ts.toString(), signature: sign(p.playerId, p.bundleId, ts, salt) },
          { ...gc, now: () => later },
        ),
      ),
    ).toBe('untrusted-key');
  });

  test('junk is refused as a bad proof', async () => {
    for (const junk of [
      null,
      {},
      { platform: 'game-center' },
      { ...proof(), playerId: 42 },
      { ...proof(), signature: '' },
      { ...proof(), salt: '%%%' },
    ]) {
      expect(['bad-proof', 'bad-signature']).toContain(await code(verifyGameCenter(junk, gc)));
    }
  });

  test('certificates read as DER or PEM', () => {
    const der = parseCertificate(CERT_DER),
      pem = parseCertificate(CERT_PEM);
    expect(pem).toEqual(der);
    expect(der.notAfter).toBeGreaterThan(der.notBefore);
    expect(der.spki[0]).toBe(0x30);
    expect(() => parseCertificate(new Uint8Array([0x30, 0x82, 0xff]))).toThrow(ProofError);
  });
});

describe('Play Games proof', () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const google = (token: Response, me: Response) => async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return url.includes('oauth2') ? token : me;
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const pg = { clientId: 'client.apps.googleusercontent.com', clientSecret: 'shh' };

  beforeEach(() => {
    calls.length = 0;
  });

  test("a code is swapped for the player's ID", async () => {
    const r = await verifyPlayGames(
      { platform: 'play-games', authCode: '4/abc' },
      { ...pg, fetch: google(json({ access_token: 'at' }), json({ playerId: 'g123' })) },
    );
    expect(r).toEqual({ platform: 'play-games', playerId: 'g123' });
    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(Object.fromEntries(body)).toMatchObject({
      code: '4/abc',
      client_id: pg.clientId,
      client_secret: 'shh',
      grant_type: 'authorization_code',
    });
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer at');
  });

  test('a code Google refuses, or a failed lookup, is refused', async () => {
    expect(
      await code(
        verifyPlayGames(
          { platform: 'play-games', authCode: 'x' },
          { ...pg, fetch: google(json({ error: 'invalid_grant' }, 400), json({})) },
        ),
      ),
    ).toBe('bad-signature');
    expect(
      await code(
        verifyPlayGames(
          { platform: 'play-games', authCode: 'x' },
          { ...pg, fetch: google(json({ access_token: 'at' }), json({}, 500)) },
        ),
      ),
    ).toBe('platform-error');
  });

  test('missing settings or junk are refused before calling Google', async () => {
    const f = google(json({}), json({}));
    expect(
      await code(
        verifyPlayGames({ platform: 'play-games', authCode: 'x' }, { clientId: '', clientSecret: '', fetch: f }),
      ),
    ).toBe('not-configured');
    expect(await code(verifyPlayGames({ platform: 'play-games' }, { ...pg, fetch: f }))).toBe('bad-proof');
    expect(calls).toEqual([]);
  });
});

describe('either platform', () => {
  test('routes by platform, and refuses platforms not configured', async () => {
    expect(await verifyServerProof(proof(), { gameCenter: gc })).toMatchObject({ platform: 'game-center' });
    expect(await code(verifyServerProof(proof(), {}))).toBe('not-configured');
    expect(await code(verifyServerProof({ platform: 'play-games', authCode: 'x' }, { gameCenter: gc }))).toBe(
      'not-configured',
    );
    expect(await code(verifyServerProof({ platform: 'steam' }, { gameCenter: gc }))).toBe('bad-proof');
  });
});
