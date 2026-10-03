import Phaser from 'phaser';

import { GAME_HEIGHT } from '../config/gameConfig';
import {
  Package,
  PACKAGE_DIMENSIONS,
  type PackageConfig,
  type PackageVariant,
} from '../entities/Package';
import type { PackageDestination, PackageSize } from '../types/GameTypes';
import {
  BELT_CENTER_X,
  BELT_TOP,
  BELT_WIDTH,
  BeltSystem,
} from './BeltSystem';
import { audioSystem } from './AudioSystem';

type WeightedValue<T> = {
  value: T;
  weight: number;
};

type SpawnProfile = {
  destination: PackageDestination;
  size: PackageSize;
  labelText?: string;
  variant?: PackageVariant;
};

const DESTINATION_WEIGHTS: WeightedValue<
  Exclude<PackageDestination, 'MISSED'>
>[] = [
  { value: 'HERES_UR_SOVICE', weight: 34 },
  { value: 'PAYTMAN', weight: 34 },
  { value: 'BULK', weight: 32 },
];

const SIZE_WEIGHTS: WeightedValue<
  Exclude<
    PackageSize,
    'mesa_boogie' | 'quad_bike' | 'goji_berries' | 'live_lobsters'
  >
>[] = [
  { value: 'small_envelope', weight: 25 },
  { value: 'small_box', weight: 30 },
  { value: 'medium_box', weight: 25 },
  { value: 'large_box', weight: 15 },
  { value: 'long_box', weight: 5 },
];

export class SpawnSystem {
  private scene!: Phaser.Scene;

  private readonly beltSystem: BeltSystem;

  private readonly packages: Package[] = [];

  private spawnTimer = 4000;

  private spawnInterval = 4000;

  private spawningEnabled = true;

  private packageId = 0;

  constructor(beltSystem: BeltSystem) {
    this.beltSystem = beltSystem;
  }

  public create(scene: Phaser.Scene): void {
    this.scene = scene;
    for (const item of this.packages) {
      item.destroy(true);
    }
    this.packages.length = 0;
    this.spawnInterval = 4000;
    this.spawnTimer = this.spawnInterval;
    this.spawningEnabled = true;
    this.packageId = 0;
  }

  public update(delta: number): void {
    this.cleanupPackages();

    if (!this.spawningEnabled || !this.beltSystem.isRunning()) {
      return;
    }

    this.spawnTimer -= delta;

    while (this.spawnTimer <= 0) {
      this.spawnPackage();
      this.spawnTimer += this.spawnInterval;
    }
  }

  public getPackages(): Package[] {
    return this.packages;
  }

  public setSpawnInterval(intervalMs: number): void {
    this.spawnInterval = intervalMs;
    this.spawnTimer = Math.min(this.spawnTimer, this.spawnInterval);
  }

  public setSpawningEnabled(enabled: boolean): void {
    this.spawningEnabled = enabled;
  }

  public setPackageSpeed(speed: number): void {
    for (const item of this.packages) {
      if (!item.isSorted) {
        item.speed = speed;
      }
    }
  }

  public createRecoveredPackage(
    x: number,
    y: number,
    config: Pick<PackageConfig, 'destination' | 'size'>,
  ): Package {
    const nextPackage = new Package(this.scene, x, y, {
      id: `pkg-${this.packageId}`,
      destination: config.destination,
      size: config.size,
      speed: this.beltSystem.beltSpeed,
      isBeltRunning: () => this.beltSystem.isRunning(),
      wasDugOut: true,
    });

    this.packageId += 1;
    this.packages.push(nextPackage);

    return nextPackage;
  }

  private spawnPackage(): void {
    const spawnProfile = this.rollSpawnProfile();
    const { width } = PACKAGE_DIMENSIONS[spawnProfile.size];
    const maxOffset = Math.max(0, (BELT_WIDTH - width) / 2 - 4);
    const x = BELT_CENTER_X + Phaser.Math.FloatBetween(-maxOffset, maxOffset);
    const y = BELT_TOP + 10;

    const nextPackage = new Package(this.scene, x, y, {
      id: `pkg-${this.packageId}`,
      destination: spawnProfile.destination,
      size: spawnProfile.size,
      speed: this.beltSystem.beltSpeed,
      isBeltRunning: () => this.beltSystem.isRunning(),
      labelText: spawnProfile.labelText,
      variant: spawnProfile.variant,
    });

    this.packageId += 1;
    this.packages.push(nextPackage);
    audioSystem.play('package-spawn');
  }

  private cleanupPackages(): void {
    for (let index = this.packages.length - 1; index >= 0; index -= 1) {
      const item = this.packages[index];
      const isPastBottom = item.y - item.height / 2 > GAME_HEIGHT;

      if (!item.isSorted && !isPastBottom) {
        continue;
      }

      item.destroy(true);
      this.packages.splice(index, 1);
    }
  }

  private rollSpawnProfile(): SpawnProfile {
    const rareRoll = Math.random();

    if (rareRoll < 0.01) {
      return {
        destination: 'BULK',
        size: 'mesa_boogie',
        labelText: 'MESA\nBOOGIE',
      };
    }

    if (rareRoll < 0.02) {
      return {
        destination: 'BULK',
        size: 'quad_bike',
        labelText: 'SMALL\nATV',
      };
    }

    if (rareRoll < 0.06) {
      return {
        destination: 'BULK',
        size: 'live_lobsters',
        labelText: 'LIVE\nLOBSTERS',
      };
    }

    if (rareRoll < 0.09) {
      return {
        destination: 'PAYTMAN',
        size: 'goji_berries',
        labelText: 'GOJI\nBERRIES',
      };
    }

    if (rareRoll < 0.13) {
      return {
        destination: 'PAYTMAN',
        size: 'medium_box',
        labelText: 'MAKEUP\nLOTION',
        variant: 'makeup',
      };
    }

    const destination = this.pickWeighted(DESTINATION_WEIGHTS);
    const size = this.pickWeighted(SIZE_WEIGHTS);
    const labelRoll = Math.random();

    if (labelRoll < 0.34) {
      return {
        destination,
        size: size === 'small_envelope' || size === 'small_box' ? 'long_box' : size,
        labelText: 'MALLWOOD RD\nEAST',
        variant: 'mallwood',
      };
    }

    if (labelRoll < 0.56) {
      return {
        destination,
        size: size === 'small_envelope' ? 'medium_box' : size,
        labelText: 'PANCHETTERS',
        variant: 'panchetters',
      };
    }

    if (labelRoll < 0.72) {
      return {
        destination,
        size: size === 'small_envelope' ? 'small_box' : size,
        labelText: 'LE DUCK',
      };
    }

    return {
      destination,
      size,
    };
  }

  private pickWeighted<T>(items: WeightedValue<T>[]): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const item of items) {
      roll -= item.weight;

      if (roll <= 0) {
        return item.value;
      }
    }

    return items[items.length - 1].value;
  }
}
