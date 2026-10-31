'use strict';

var core = require('@capacitor/core');

const GameServices = core.registerPlugin('GameServices', {
    web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.GameServicesWeb()),
});

/** The web has no Game Center or Play Games: everything is a harmless no-op, so the same game code runs in a browser. */
class GameServicesWeb extends core.WebPlugin {
    constructor() {
        super(...arguments);
        this.none = { signedIn: false, platform: 'none', reason: 'unavailable' };
    }
    async signIn() {
        return this.none;
    }
    async isSignedIn() {
        return this.none;
    }
    async getServerProof() {
        throw this.unavailable('Game Center and Play Games are not available on the web.');
    }
    async submitScore() {
        /* nothing to post to on the web */
    }
    async unlockAchievement() {
        /* nothing to unlock on the web */
    }
    async setAchievementProgress() {
        /* nothing to update on the web */
    }
    async showLeaderboard() {
        /* no platform screen on the web */
    }
    async showAchievements() {
        /* no platform screen on the web */
    }
}

var web = /*#__PURE__*/Object.freeze({
    __proto__: null,
    GameServicesWeb: GameServicesWeb
});

exports.GameServices = GameServices;
//# sourceMappingURL=plugin.cjs.js.map
