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
export declare class ProofError extends Error {
    readonly code: 'bad-proof' | 'wrong-app' | 'untrusted-key' | 'expired' | 'bad-signature' | 'not-configured' | 'platform-error';
    constructor(code: 'bad-proof' | 'wrong-app' | 'untrusted-key' | 'expired' | 'bad-signature' | 'not-configured' | 'platform-error', message: string);
}
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
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
/**
 * Checks Apple's identity verification signature (GKLocalPlayer.fetchItems(forIdentityVerificationSignature:)),
 * following Apple's steps: a recent timestamp, a public key fetched only from Apple, and an RSASSA-PKCS1-v1_5 SHA-256
 * signature over the player ID, bundle ID, timestamp (big-endian 64-bit) and salt.
 *
 * Note: the key is trusted because it comes over HTTPS from Apple's own domain and its certificate is in date; the
 * certificate chain isn't walked to Apple's root (Web Crypto can't), which is the usual approach on edge runtimes.
 */
export declare function verifyGameCenter(raw: unknown, opts: GameCenterOptions): Promise<VerifiedPlayer>;
/** Forget cached Apple keys (for tests). */
export declare const clearKeyCache: () => void;
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
export declare function verifyPlayGames(raw: unknown, opts: PlayGamesOptions): Promise<VerifiedPlayer>;
/** Checks a proof from either platform. A platform you don't configure is refused. */
export declare function verifyServerProof(raw: unknown, opts: {
    gameCenter?: GameCenterOptions;
    playGames?: PlayGamesOptions;
}): Promise<VerifiedPlayer>;
/** Reads a DER (or PEM) X.509 certificate: its public key (SubjectPublicKeyInfo) and validity dates. */
export declare function parseCertificate(input: Uint8Array): {
    spki: Uint8Array<ArrayBuffer>;
    notBefore: number;
    notAfter: number;
};
export {};
