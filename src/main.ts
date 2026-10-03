import Phaser from 'phaser';

import { gameConfig } from './game/config/gameConfig';
import { audioSystem } from './game/systems/AudioSystem';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Expected #app container to exist.');
}

const game = new Phaser.Game(gameConfig);
audioSystem.installUnlockListeners();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
