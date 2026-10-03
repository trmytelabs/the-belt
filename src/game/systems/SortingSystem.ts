import Phaser from 'phaser';

import { BulkPileZone } from '../entities/BulkPileZone';
import { Package } from '../entities/Package';
import { PileUpZone } from '../entities/PileUpZone';
import { Player } from '../entities/Player';
import { TruckZone } from '../entities/TruckZone';
import { audioSystem } from './AudioSystem';
import { ScoreSystem } from './ScoreSystem';

type SortingZones = {
  truckZones: TruckZone[];
  bulkPileZone: BulkPileZone;
  pileUpZone: PileUpZone;
};

export class SortingSystem {
  private scene!: Phaser.Scene;

  private zones!: SortingZones;

  private scoreSystem!: ScoreSystem;

  private readonly playerZoneLocks = new Map<string, string | null>();

  public create(scene: Phaser.Scene, zones: SortingZones, scoreSystem: ScoreSystem): void {
    this.scene = scene;
    this.zones = zones;
    this.scoreSystem = scoreSystem;
    this.playerZoneLocks.clear();
  }

  public checkDrop(item: Package, player: Player): void {
    const zone = this.findCurrentZone(player.x, player.y);

    if (!zone) {
      this.playerZoneLocks.set(player.id, null);
      return;
    }

    const previousZoneId = this.playerZoneLocks.get(player.id) ?? null;

    if (previousZoneId === zone.id) {
      return;
    }

    this.playerZoneLocks.set(player.id, zone.id);

    if (zone.type === 'bulk') {
      if (item.destination === 'BULK') {
        this.resolveCorrectSort(player, item, zone.zone, 120);
        this.zones.bulkPileZone.incrementCount();
        this.scoreSystem.addBulkSorted();
      } else {
        this.resolveWrongSort(zone.zone, player);
      }

      return;
    }

    if (item.destination === zone.zone.acceptedDestination) {
      this.resolveCorrectSort(player, item, zone.zone, 100);
      this.scoreSystem.addSorted();
    } else {
      this.resolveWrongSort(zone.zone, player);
    }
  }

  public handleBeltEnd(item: Package): void {
    if (item.isHeld || item.isSorted) {
      return;
    }

    item.isSorted = true;
    item.setVisible(false);

    if (item.destination === 'MISSED') {
      const awarded = 80 + this.scoreSystem.getState().combo * 25;
      this.scoreSystem.addScore(awarded);
      this.scoreSystem.incrementCombo();
      this.scoreSystem.addMissedCorrect();
      audioSystem.play('missed');
      this.showFloatingText(item.x, item.y - 12, `+${awarded}`, '#61f29b');
      return;
    }

    this.zones.pileUpZone.addPackage(item);
    this.scoreSystem.addError();
    this.scoreSystem.resetCombo();
    audioSystem.play('pile-up');
    this.showFloatingText(item.x, item.y - 12, 'PILE UP', '#ff5d5d');
  }

  private findCurrentZone(
    x: number,
    y: number,
  ):
    | { id: string; type: 'truck'; zone: TruckZone }
    | { id: string; type: 'bulk'; zone: BulkPileZone }
    | null {
    for (const truckZone of this.zones.truckZones) {
      if (truckZone.containsPoint(x, y)) {
        return { id: truckZone.id, type: 'truck', zone: truckZone };
      }
    }

    if (this.zones.bulkPileZone.containsPoint(x, y)) {
      return { id: 'bulk-pile', type: 'bulk', zone: this.zones.bulkPileZone };
    }

    return null;
  }

  private resolveCorrectSort(
    player: Player,
    item: Package,
    zone: TruckZone | BulkPileZone,
    baseScore: number,
  ): void {
    const comboBonus = item.wasDugOut ? 0 : this.scoreSystem.getState().combo * 25;
    const effectiveBaseScore =
      item.wasDugOut && baseScore === 120
        ? 60
        : item.wasDugOut
          ? 50
          : baseScore;
    const awarded = effectiveBaseScore + comboBonus;

    player.releaseHeldPackageForSort(item);
    item.isSorted = true;
    item.isHeld = false;
    item.holderId = null;
    item.setHeldVisual(false, 12);
    item.setVisible(false);

    zone.flashAccept();
    this.scoreSystem.addScore(awarded);
    this.scoreSystem.incrementCombo();
    audioSystem.play(baseScore === 120 ? 'bulk' : 'correct');
    this.showFloatingText(player.x, player.y - 36, `+${awarded}`, '#61f29b');
  }

  private resolveWrongSort(zone: TruckZone | BulkPileZone, player: Player): void {
    const heldPackage = player.heldPackage;
    zone.flashReject();

    if (heldPackage?.wasDugOut) {
      audioSystem.play('wrong');
      this.showFloatingText(player.x, player.y - 36, 'NO SCORE', '#ffd36b');
      return;
    }

    this.scoreSystem.addScore(-50);
    this.scoreSystem.addError();
    this.scoreSystem.resetCombo();
    audioSystem.play('wrong');
    this.showFloatingText(player.x, player.y - 36, 'WRONG', '#ff5d5d');
  }

  private showFloatingText(x: number, y: number, text: string, color: string): void {
    const floatingText = this.scene.add.text(x, y, text, {
      color,
      fontFamily: 'Arial',
      fontSize: '18px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    floatingText.setOrigin(0.5);
    floatingText.setDepth(40);

    this.scene.tweens.add({
      targets: floatingText,
      y: y - 22,
      alpha: 0,
      duration: 450,
      ease: 'Quad.Out',
      onComplete: () => {
        floatingText.destroy();
      },
    });
  }
}
