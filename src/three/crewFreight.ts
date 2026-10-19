import { DEPOT_3D_LAYOUT } from './layout.ts';

/** A resident's box rides the actual tread before the same box is lifted. */
export class CrewFreightTrip {
  public readonly beltOffset: number;
  public readonly startedAt: number;
  public readonly pickupY: number;
  private pickedAt: number | null = null;

  constructor(startedAt: number, beltTravel: number, pickupY: number, beltSpeed: number) {
    this.startedAt = startedAt; this.pickupY = pickupY;
    this.beltOffset = CrewFreightTrip.spawnY(pickupY, beltSpeed) - beltTravel;
  }

  public static spawnY(pickupY: number, beltSpeed: number): number {
    return Math.max(DEPOT_3D_LAYOUT.beltTop + 18, pickupY - Math.max(50, beltSpeed) * 1.3);
  }

  public sample(time: number, beltTravel: number): { cycle: number; beltY: number; lift: number } {
    const beltY = Math.min(this.pickupY, beltTravel + this.beltOffset);
    const clock = Math.max(0, time - this.startedAt);
    if (this.pickedAt === null && clock >= 1300 && beltY >= this.pickupY) this.pickedAt = time;
    return {
      cycle: this.pickedAt === null ? Math.min(clock, 1299) : 1300 + Math.max(0, time - this.pickedAt),
      beltY,
      lift: this.pickedAt === null ? 0 : Math.min(1, Math.max(0, time - this.pickedAt) / 350),
    };
  }
}
