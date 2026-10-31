import { WebPlugin } from '@capacitor/core';

import type { GameServicesPlugin, ServerProof, SignInResult } from './definitions';

/** The web has no Game Center or Play Games: everything is a harmless no-op, so the same game code runs in a browser. */
export class GameServicesWeb extends WebPlugin implements GameServicesPlugin {
  private readonly none: SignInResult = { signedIn: false, platform: 'none', reason: 'unavailable' };

  async signIn(): Promise<SignInResult> {
    return this.none;
  }

  async isSignedIn(): Promise<SignInResult> {
    return this.none;
  }

  async getServerProof(): Promise<ServerProof> {
    throw this.unavailable('Game Center and Play Games are not available on the web.');
  }

  async submitScore(): Promise<void> {
    /* nothing to post to on the web */
  }

  async unlockAchievement(): Promise<void> {
    /* nothing to unlock on the web */
  }

  async setAchievementProgress(): Promise<void> {
    /* nothing to update on the web */
  }

  async showLeaderboard(): Promise<void> {
    /* no platform screen on the web */
  }

  async showAchievements(): Promise<void> {
    /* no platform screen on the web */
  }
}
