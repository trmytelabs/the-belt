import * as THREE from 'three';

import { softDotTexture } from './space';

interface Puff {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  grow: number;
  baseOpacity: number;
}

/** Small pooled billboard particles for smoke, stink and fumes. */
export class PuffField {
  private readonly puffs: Puff[] = [];
  private readonly free: THREE.Sprite[] = [];
  private readonly texture = softDotTexture();

  private readonly parent: THREE.Object3D;

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
  }

  public emit(position: THREE.Vector3, options: {
    color: THREE.ColorRepresentation; size: number; life: number; velocity: THREE.Vector3;
    opacity?: number; grow?: number; spread?: number;
  }): void {
    const sprite = this.free.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthWrite: false, transparent: true }));
    const material = sprite.material;
    material.color.set(options.color);
    material.opacity = options.opacity ?? 0.5;
    const spread = options.spread ?? 0.05;
    sprite.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread));
    sprite.scale.setScalar(options.size);
    sprite.visible = true;
    this.parent.add(sprite);
    this.puffs.push({
      sprite, velocity: options.velocity.clone(), age: 0, life: options.life,
      grow: options.grow ?? 1.2, baseOpacity: material.opacity,
    });
  }

  public update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      const puff = this.puffs[i];
      puff.age += dt;
      const t = puff.age / puff.life;
      if (t >= 1) {
        puff.sprite.visible = false;
        this.parent.remove(puff.sprite);
        this.free.push(puff.sprite);
        this.puffs.splice(i, 1);
        continue;
      }
      puff.sprite.position.addScaledVector(puff.velocity, dt);
      puff.sprite.scale.multiplyScalar(1 + (puff.grow - 1) * dt / puff.life);
      puff.sprite.material.opacity = puff.baseOpacity * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t * 0.4);
    }
  }
}
