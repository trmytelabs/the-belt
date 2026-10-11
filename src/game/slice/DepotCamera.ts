import Phaser from 'phaser';
import type { Worker } from './ShiftModel';

/** Separate world and screen cameras keep the console and hit targets stationary. */
export class DepotCamera {
  public readonly world: Phaser.Cameras.Scene2D.Camera;
  public readonly hud: Phaser.Cameras.Scene2D.Camera;
  public overview = false;
  private center = { x: 480, y: 376 };
  private zoom = 1;
  private readonly reducedMotion: boolean;

  constructor(scene: Phaser.Scene, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.world = scene.cameras.main.setViewport(0, 126, 960, 494).setName('depot-world');
    this.world.setBackgroundColor('#11252c');
    this.hud = scene.cameras.add(0, 0, 960, 720, false, 'depot-hud');
    scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.addWorld, this);
    scene.events.on('depot-screen-object', this.screen, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.addWorld, this);
      scene.events.off('depot-screen-object', this.screen, this);
    });
    this.apply();
  }

  private addWorld(object: Phaser.GameObjects.GameObject): void {
    object.cameraFilter = (object.cameraFilter | this.hud.id) & ~this.world.id;
    // Phaser text is raster-backed. Keep the authored labels sharp when the
    // event camera gets closer; geometry and measured text size stay unchanged.
    if (object instanceof Phaser.GameObjects.Text) {
      object.setResolution(3);
      // Phaser 3's setter updates the text canvas but leaves the source density
      // unchanged. Canvas rendering reads this field; WebGL reads the style.
      object.frame.source.resolution = object.style.resolution;
    }
  }

  public screen<T extends Phaser.GameObjects.GameObject>(object: T): T {
    object.cameraFilter = (object.cameraFilter | this.world.id) & ~this.hud.id;
    if (object instanceof Phaser.GameObjects.Container) object.list.forEach(child => this.screen(child));
    return object;
  }

  public worldObject<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.addWorld(object);
    return object;
  }

  public toggleOverview(): void { this.overview = !this.overview; }

  public update(delta: number, worker: Worker, mode: 'follow' | 'interlude' | 'overview' | 'hold'): void {
    if (mode === 'hold') return;
    const wide = mode === 'overview' || (mode === 'follow' && this.overview);
    const targetZoom = mode === 'interlude' ? 2.45 : wide ? 1 : 1.45;
    const halfWidth = 960 / targetZoom / 2;
    const halfHeight = 494 / targetZoom / 2;
    const target = mode === 'interlude' ? { x: 150, y: 535 }
      : wide ? { x: 480, y: 376 } : { x: worker.side === 'left' ? 344 : 616, y: worker.y };
    target.x = Phaser.Math.Clamp(target.x, halfWidth, 960 - halfWidth);
    target.y = Phaser.Math.Clamp(target.y, 126 + halfHeight, 620 - halfHeight);
    // Exponential smoothing has the same feel at different frame rates. Reduced
    // motion retains the closer view but removes animated camera travel.
    const blend = this.reducedMotion ? 1 : 1 - Math.exp(-Math.min(Math.max(delta, 0), 100) / 165);
    this.zoom = Phaser.Math.Linear(this.zoom, targetZoom, blend);
    this.center.x = Phaser.Math.Linear(this.center.x, target.x, blend);
    this.center.y = Phaser.Math.Linear(this.center.y, target.y, blend);
    this.apply();
  }

  private apply(): void {
    const halfWidth = 480 / this.zoom;
    const halfHeight = 247 / this.zoom;
    this.center.x = Phaser.Math.Clamp(this.center.x, halfWidth, 960 - halfWidth);
    this.center.y = Phaser.Math.Clamp(this.center.y, 126 + halfHeight, 620 - halfHeight);
    this.world.setZoom(this.zoom).centerOn(this.center.x, this.center.y);
  }
}
