import { registerPlugin } from '@capacitor/core';
const GameServices = registerPlugin('GameServices', {
    web: () => import('./web').then((m) => new m.GameServicesWeb()),
});
export * from './definitions';
export { GameServices };
//# sourceMappingURL=index.js.map