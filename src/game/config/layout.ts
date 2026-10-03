import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';

export const layout = {
  game: {
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    centerX: GAME_WIDTH / 2,
    centerY: GAME_HEIGHT / 2,
  },

  hud: {
    barY: 660,
    barHeight: 60,
    contentY: 678,
    secondRowY: 700,
    slots: [
      { x: 14, width: 150, label: 'SCORE' },
      { x: 176, width: 118, label: 'COMBO' },
      { x: 306, width: 112, label: 'TIME' },
      { x: 430, width: 122, label: 'ERRORS' },
      { x: 564, width: 146, label: 'ACTIVE' },
      { x: 722, width: 108, label: 'VIC' },
      { x: 842, width: 104, label: 'BELT' },
    ],
  },

  belt: {
    left: 440,
    right: 520,
    top: 60,
    bottom: 660,
  },

  players: {
    termiteHome: { x: 100, y: 560 },
    skankyHome: { x: 860, y: 560 },
    minY: 80,
    maxY: 640,
  },

  notification: {
    centerX: GAME_WIDTH / 2,
    centerY: 200,
  },

  mesaPrompt: {
    x: 480,
    y: 340,
  },
} as const;
