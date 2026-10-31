# capacitor-game-services

Apple Game Center (iPhone, iPad) and Google Play Games Services v2 (Android) for [Capacitor](https://capacitorjs.com) 8 games:

- **Silent sign-in** at launch, so most players never see a sign-in step.
- **Proof of who the player is** for your own server, plus a **server helper** that checks it (Cloudflare Workers, Node, Deno, Bun).
- **Leaderboards** and **achievements**, and the platforms' own screens for them.
- **On the web, everything is a harmless no-op**, so the same game code runs in a browser.

Built by [DZK Consulting](https://github.com/DZK-Consulting) for our own games and shared as is, under the MIT licence. **No support is promised**: issues and pull requests are welcome but may not get a reply.

## Install

Install from a GitHub version tag, pinned exactly (`dist/` is committed, so nothing is built on install):

```bash
npm install github:DZK-Consulting/capacitor-game-services#v0.1.0
npx cap sync
```

### iPhone

- In Xcode, add the **Game Center** capability to the app target.
- In App Store Connect, turn on Game Center for the app and create your leaderboards and achievements.
- Use the IDs from App Store Connect in your game.

### Android

- In Play Console, set up **Play Games Services** for the app, and create your leaderboards and achievements.
- Achievements you'll drive with `setAchievementProgress` must be **incremental with 100 steps**.
- Add your Play Games project ID to the app. In `android/app/src/main/res/values/strings.xml`:

  ```xml
  <string name="game_services_project_id" translatable="false">123456789012</string>
  ```

  and in `android/app/src/main/AndroidManifest.xml`, inside `<application>`:

  ```xml
  <meta-data android:name="com.google.android.gms.games.APP_ID" android:value="@string/game_services_project_id" />
  ```

  Without it, the game still runs, but `signIn` says `unavailable`.
- For server proof, create a **Games server** credential in Play Console (Play Games Services → Configuration). Its web OAuth client ID goes in the game (`serverClientId`); its client secret goes **only** on your server.
- A different Play Games library version can be set with `playGamesV2Version` in the app's `variables.gradle`.

## Use it

```ts
import { GameServices } from 'capacitor-game-services';

// At launch: never blocks play. Not signed in? Play as a guest.
const { signedIn } = await GameServices.signIn();

// Prove the player to your server (see "On your server").
if (signedIn) {
  const proof = await GameServices.getServerProof({ serverClientId: 'xxxx.apps.googleusercontent.com' });
  await fetch('https://your.server/link', { method: 'POST', body: JSON.stringify(proof) });
}

// Scores and achievements: safe to call when nobody's signed in (they just do nothing).
await GameServices.submitScore({ leaderboardId: 'points', score: 1234 });
await GameServices.unlockAchievement({ achievementId: 'first_win' });
await GameServices.setAchievementProgress({ achievementId: 'win_100', percent: 37 });
await GameServices.showLeaderboard({ leaderboardId: 'points' });
```

Scores posted from a phone can be faked by anyone who hacks the app. If scores matter, keep the official ones on your own server, and set score limits in App Store Connect and Play Console.

## On your server

```ts
import { verifyServerProof, ProofError } from 'capacitor-game-services/server';

const player = await verifyServerProof(proof, {
  gameCenter: { bundleIds: ['com.example.game'] },
  playGames: { clientId: env.PLAY_GAMES_CLIENT_ID, clientSecret: env.PLAY_GAMES_CLIENT_SECRET },
});
// player.platform: 'game-center' | 'play-games'; player.playerId: an ID you can trust.
```

- **Game Center:** follows [Apple's steps](https://developer.apple.com/documentation/gamekit/gklocalplayer/fetchitems(foridentityverificationsignature:)): a recent timestamp (5 minutes by default), the bundle ID must be yours, Apple's public key is only fetched over HTTPS from `*.apple.com` and must be in date, and the RSA signature must match. The certificate chain isn't walked to Apple's root (Web Crypto can't); trust rests on HTTPS to Apple's own domain.
- **Play Games:** swaps the one-time code at Google's token endpoint, then reads the player ID from `players/me`, as in [Google's guide](https://developer.android.com/games/pgs/android/server-access).
- Failures throw `ProofError` with a stable `code`: `bad-proof`, `wrong-app`, `untrusted-key`, `expired`, `bad-signature`, `not-configured`, `platform-error`.
- **Player IDs are personal data.** Apple's rules: never display Game Center player IDs, or pass them to anyone else. Store them hashed if you can.

## Development

```bash
npm ci
npm test            # server helper tests
npm run lint
npm run build       # updates dist/ (commit it) and the API section below
npm run verify:android
npm run verify:ios  # on a Mac
```

CI runs all of these on every pull request: Linux for the web and Android, and a Mac for iPhone.

**Releasing:**
1. Bump `version` in `package.json` and run `npm run build`, in a pull request.
2. Merge it. The Release workflow tags the merge `vX.Y.Z` automatically.
3. Games move to the new tag in their own pull request.

## API

<docgen-index>

* [`signIn(...)`](#signin)
* [`isSignedIn()`](#issignedin)
* [`getServerProof(...)`](#getserverproof)
* [`submitScore(...)`](#submitscore)
* [`unlockAchievement(...)`](#unlockachievement)
* [`setAchievementProgress(...)`](#setachievementprogress)
* [`showLeaderboard(...)`](#showleaderboard)
* [`showAchievements()`](#showachievements)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### signIn(...)

```typescript
signIn(options?: SignInOptions | undefined) => Promise<SignInResult>
```

Signs in, silently where the platform allows. Call once at launch; it never blocks play.

| Param         | Type                                                    |
| ------------- | ------------------------------------------------------- |
| **`options`** | <code><a href="#signinoptions">SignInOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#signinresult">SignInResult</a>&gt;</code>

--------------------


### isSignedIn()

```typescript
isSignedIn() => Promise<SignInResult>
```

Whether a player is signed in right now, without trying to sign in.

**Returns:** <code>Promise&lt;<a href="#signinresult">SignInResult</a>&gt;</code>

--------------------


### getServerProof(...)

```typescript
getServerProof(options?: ServerProofOptions | undefined) => Promise<ServerProof>
```

Proof of the signed-in player for your server. Fails if nobody is signed in.

| Param         | Type                                                              |
| ------------- | ----------------------------------------------------------------- |
| **`options`** | <code><a href="#serverproofoptions">ServerProofOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#serverproof">ServerProof</a>&gt;</code>

--------------------


### submitScore(...)

```typescript
submitScore(options: { leaderboardId: string; score: number; }) => Promise<void>
```

Posts a score to a leaderboard (your ID from App Store Connect or Play Console). Whole numbers only. Fails quietly
(resolves) when nobody is signed in, so games can call it without checking.

| Param         | Type                                                   |
| ------------- | ------------------------------------------------------ |
| **`options`** | <code>{ leaderboardId: string; score: number; }</code> |

--------------------


### unlockAchievement(...)

```typescript
unlockAchievement(options: { achievementId: string; }) => Promise<void>
```

Unlocks an achievement. Does nothing if it's already unlocked or nobody is signed in.

| Param         | Type                                    |
| ------------- | --------------------------------------- |
| **`options`** | <code>{ achievementId: string; }</code> |

--------------------


### setAchievementProgress(...)

```typescript
setAchievementProgress(options: { achievementId: string; percent: number; }) => Promise<void>
```

Sets an achievement's progress, 0 to 100 percent. Android needs the achievement made "incremental" in Play Console
with 100 steps; iPhone takes the percentage directly. Progress never goes backwards.

| Param         | Type                                                     |
| ------------- | -------------------------------------------------------- |
| **`options`** | <code>{ achievementId: string; percent: number; }</code> |

--------------------


### showLeaderboard(...)

```typescript
showLeaderboard(options?: { leaderboardId?: string | undefined; } | undefined) => Promise<void>
```

Shows the platform's own leaderboard screen: one board, or all of them.

| Param         | Type                                     |
| ------------- | ---------------------------------------- |
| **`options`** | <code>{ leaderboardId?: string; }</code> |

--------------------


### showAchievements()

```typescript
showAchievements() => Promise<void>
```

Shows the platform's own achievements screen.

--------------------


### Interfaces


#### SignInResult

| Prop           | Type                                                                | Description                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`signedIn`** | <code>boolean</code>                                                | Whether a player is signed in to the platform's games service now.                                                                                                                                                 |
| **`platform`** | <code><a href="#gamesplatform">GamesPlatform</a></code>             |                                                                                                                                                                                                                    |
| **`reason`**   | <code>'error' \| 'unavailable' \| 'declined' \| 'restricted'</code> | Why not, when `signedIn` is false: `unavailable` (no games service here, e.g. the web), `declined` (the player cancelled or turned it off), `restricted` (blocked by parental controls or the device), or `error`. |
| **`message`**  | <code>string</code>                                                 | Extra detail from the platform when something went wrong. Never shown to players as is.                                                                                                                            |


#### SignInOptions

| Prop              | Type                 | Description                                                                                                                                                                                                                                                                         |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`interactive`** | <code>boolean</code> | Android only: show Google's sign-in screen if the silent sign-in didn't work. Leave false at launch (Play Games signs in on its own when it can) and use true only from a button the player pressed. iPhone always shows Game Center's own sheet the first time, as Apple requires. |


#### GameCenterProof

Apple's identity verification signature (GKLocalPlayer.fetchItems(forIdentityVerificationSignature:)).

| Prop               | Type                       | Description                                                                                       |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------- |
| **`platform`**     | <code>'game-center'</code> |                                                                                                   |
| **`playerId`**     | <code>string</code>        | The team-scoped player ID (teamPlayerID). Only valid for one developer's games. Never display it. |
| **`bundleId`**     | <code>string</code>        | The app's bundle ID, which the signature covers.                                                  |
| **`publicKeyUrl`** | <code>string</code>        | Where Apple's public key is. The server must only fetch it from Apple's own domain.               |
| **`signature`**    | <code>string</code>        | Base64 signature.                                                                                 |
| **`salt`**         | <code>string</code>        | Base64 salt.                                                                                      |
| **`timestamp`**    | <code>string</code>        | Milliseconds since 1970, as a string (it doesn't fit a JavaScript number safely in every case).   |


#### PlayGamesProof

A one-time server auth code from Play Games (GamesSignInClient.requestServerSideAccess).

| Prop           | Type                      | Description                                                                |
| -------------- | ------------------------- | -------------------------------------------------------------------------- |
| **`platform`** | <code>'play-games'</code> |                                                                            |
| **`authCode`** | <code>string</code>       | Swap it on your server, once, for the player's ID. Expires within minutes. |


#### ServerProofOptions

| Prop                 | Type                | Description                                                                                                                                   |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **`serverClientId`** | <code>string</code> | Android: the OAuth client ID of your game's "Games server" credential in Play Console (a web client). Required on Android, ignored on iPhone. |


### Type Aliases


#### GamesPlatform

Which games service the device uses. `none` on the web.

<code>'game-center' | 'play-games' | 'none'</code>


#### ServerProof

Proof of who the player is, for your own server to check (see `capacitor-game-services/server`). Never trust a
player ID the phone simply tells you.

<code><a href="#gamecenterproof">GameCenterProof</a> | <a href="#playgamesproof">PlayGamesProof</a></code>

</docgen-api>
