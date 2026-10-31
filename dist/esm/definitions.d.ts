/**
 * Apple Game Center (iPhone, iPad) and Google Play Games Services v2 (Android) for Capacitor games.
 *
 * Built by DZK Consulting for our own games and shared as is. Nothing game-specific lives here: each game passes in
 * its own leaderboard and achievement IDs. On the web every call is a harmless no-op, so the same game code runs in
 * a browser.
 */
/** Which games service the device uses. `none` on the web. */
export type GamesPlatform = 'game-center' | 'play-games' | 'none';
export interface SignInResult {
    /** Whether a player is signed in to the platform's games service now. */
    signedIn: boolean;
    platform: GamesPlatform;
    /**
     * Why not, when `signedIn` is false: `unavailable` (no games service here, e.g. the web), `declined` (the player
     * cancelled or turned it off), `restricted` (blocked by parental controls or the device), or `error`.
     */
    reason?: 'unavailable' | 'declined' | 'restricted' | 'error';
    /** Extra detail from the platform when something went wrong. Never shown to players as is. */
    message?: string;
}
export interface SignInOptions {
    /**
     * Android only: show Google's sign-in screen if the silent sign-in didn't work. Leave false at launch (Play Games
     * signs in on its own when it can) and use true only from a button the player pressed. iPhone always shows Game
     * Center's own sheet the first time, as Apple requires.
     */
    interactive?: boolean;
}
/**
 * Proof of who the player is, for your own server to check (see `capacitor-game-services/server`). Never trust a
 * player ID the phone simply tells you.
 */
export type ServerProof = GameCenterProof | PlayGamesProof;
/** Apple's identity verification signature (GKLocalPlayer.fetchItems(forIdentityVerificationSignature:)). */
export interface GameCenterProof {
    platform: 'game-center';
    /** The team-scoped player ID (teamPlayerID). Only valid for one developer's games. Never display it. */
    playerId: string;
    /** The app's bundle ID, which the signature covers. */
    bundleId: string;
    /** Where Apple's public key is. The server must only fetch it from Apple's own domain. */
    publicKeyUrl: string;
    /** Base64 signature. */
    signature: string;
    /** Base64 salt. */
    salt: string;
    /** Milliseconds since 1970, as a string (it doesn't fit a JavaScript number safely in every case). */
    timestamp: string;
}
/** A one-time server auth code from Play Games (GamesSignInClient.requestServerSideAccess). */
export interface PlayGamesProof {
    platform: 'play-games';
    /** Swap it on your server, once, for the player's ID. Expires within minutes. */
    authCode: string;
}
export interface ServerProofOptions {
    /**
     * Android: the OAuth client ID of your game's "Games server" credential in Play Console (a web client). Required on
     * Android, ignored on iPhone.
     */
    serverClientId?: string;
}
export interface GameServicesPlugin {
    /** Signs in, silently where the platform allows. Call once at launch; it never blocks play. */
    signIn(options?: SignInOptions): Promise<SignInResult>;
    /** Whether a player is signed in right now, without trying to sign in. */
    isSignedIn(): Promise<SignInResult>;
    /** Proof of the signed-in player for your server. Fails if nobody is signed in. */
    getServerProof(options?: ServerProofOptions): Promise<ServerProof>;
    /**
     * Posts a score to a leaderboard (your ID from App Store Connect or Play Console). Whole numbers only. Fails quietly
     * (resolves) when nobody is signed in, so games can call it without checking.
     */
    submitScore(options: {
        leaderboardId: string;
        score: number;
    }): Promise<void>;
    /** Unlocks an achievement. Does nothing if it's already unlocked or nobody is signed in. */
    unlockAchievement(options: {
        achievementId: string;
    }): Promise<void>;
    /**
     * Sets an achievement's progress, 0 to 100 percent. Android needs the achievement made "incremental" in Play Console
     * with 100 steps; iPhone takes the percentage directly. Progress never goes backwards.
     */
    setAchievementProgress(options: {
        achievementId: string;
        percent: number;
    }): Promise<void>;
    /** Shows the platform's own leaderboard screen: one board, or all of them. */
    showLeaderboard(options?: {
        leaderboardId?: string;
    }): Promise<void>;
    /** Shows the platform's own achievements screen. */
    showAchievements(): Promise<void>;
}
