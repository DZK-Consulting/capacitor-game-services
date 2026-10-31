import { WebPlugin } from '@capacitor/core';
import type { GameServicesPlugin, ServerProof, SignInResult } from './definitions';
/** The web has no Game Center or Play Games: everything is a harmless no-op, so the same game code runs in a browser. */
export declare class GameServicesWeb extends WebPlugin implements GameServicesPlugin {
    private readonly none;
    signIn(): Promise<SignInResult>;
    isSignedIn(): Promise<SignInResult>;
    getServerProof(): Promise<ServerProof>;
    submitScore(): Promise<void>;
    unlockAchievement(): Promise<void>;
    setAchievementProgress(): Promise<void>;
    showLeaderboard(): Promise<void>;
    showAchievements(): Promise<void>;
}
