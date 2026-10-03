import Phaser from 'phaser';

export const randomTimedEventDelayMs = (
  minMs = 10_000,
  maxMs = 18_000,
): number => Phaser.Math.Between(minMs, maxMs);
