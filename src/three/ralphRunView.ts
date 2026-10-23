import * as THREE from 'three';
import type { DrivingView } from './driving';
import { RALPH_RUN, RALPH_STOPS, RalphRunModel } from './ralphRun';
import { disposeObject3D } from './resources';
import { textPlane } from './space';

/**
 * The Ralph run on screen (`ralphRun.ts` keeps its rules), in the drive's city: each business's mark on the sidewalk
 * (a ring, a beacon until it has its parcel, its sign on a post facing the street) and the parcels Termite throws.
 */

const GOLD = 0xffc23a, NEXT = 0xffe680, DONE = 0x7ee08a;
const parcelGeometry = new THREE.BoxGeometry(0.42, 0.3, 0.34);
const parcelMaterial = new THREE.MeshStandardMaterial({ color: 0xa8875c, roughness: 0.85 });
const tapeMaterial = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 });

interface Marker { ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; beacon: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> }

export class RalphRunScene {
  private readonly root = new THREE.Group();
  private readonly markers: Marker[] = [];
  private readonly parcels = new Map<number, THREE.Group>();
  private readonly view: DrivingView;

  constructor(view: DrivingView) {
    this.view = view;
    this.root.name = 'ralph-run';
    this.root.userData.keep = true;
    for (const stop of RALPH_STOPS) {
      const holder = new THREE.Group();
      holder.name = `ralph-stop:${stop.name}`;
      holder.position.set(stop.x, 0, stop.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(RALPH_RUN.ring - 0.25, RALPH_RUN.ring, 40), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const bull = new THREE.Mesh(new THREE.CircleGeometry(RALPH_RUN.bullseye, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      bull.rotation.x = -Math.PI / 2;
      bull.position.y = 0.04;
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.y = 7;
      // The business's sign on a post at the back of the sidewalk, facing the road.
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.5 }));
      const sign = textPlane([stop.name], 2.2, 0.55, { width: 280, height: 70, background: '#1d2a33', color: '#f3e6c6', radius: 8 });
      // At the back of the sidewalk, away from the road, facing it.
      const outward = new THREE.Vector3(stop.x, 0, stop.z);
      const road = this.roadPoint(stop.x, stop.z, stop.heading);
      outward.sub(road).setY(0).normalize();
      post.position.set(outward.x * 1.6, 1.3, outward.z * 1.6);
      sign.position.set(outward.x * 1.6, 2.4, outward.z * 1.6);
      sign.rotation.y = Math.atan2(-outward.x, -outward.z);
      holder.add(ring, bull, beacon, post, sign);
      this.root.add(holder);
      this.markers.push({ ring, beacon });
    }
  }

  /** The middle of the street beside a stop: the stop less its offset across the street. */
  private roadPoint(x: number, z: number, heading: number): THREE.Vector3 {
    const right = { x: Math.sin(heading), z: Math.cos(heading) };
    const across = Math.abs(right.x) > 0.5 ? x - Math.round(x / 60) * 60 : z - Math.round((z - 20) / 60) * 60 - 20;
    return Math.abs(right.x) > 0.5 ? new THREE.Vector3(x - across, 0, z) : new THREE.Vector3(x, 0, z - across);
  }

  public begin(): void {
    this.view.scene.add(this.root);
    for (const parcel of this.parcels.values()) { parcel.removeFromParent(); }
    this.parcels.clear();
  }

  public end(): void {
    this.root.removeFromParent();
    for (const parcel of this.parcels.values()) parcel.removeFromParent();
    this.parcels.clear();
  }

  /** Where Ralph's words hang: over the five-ton's cab, on his side. */
  public cabAnchor(): THREE.Vector3 {
    return this.view.truck.localToWorld(new THREE.Vector3(2.2, 3.6, 0.7));
  }

  public update(run: RalphRunModel, truck: { x: number; z: number }, time: number, reducedMotion: boolean): void {
    const next = run.routeNext(truck);
    run.stops.forEach((stop, index) => {
      const { ring, beacon } = this.markers[index];
      const isNext = next?.index === index;
      ring.material.color.setHex(stop.delivered ? DONE : isNext ? NEXT : GOLD);
      const pulse = isNext && !reducedMotion ? 1 + 0.06 * Math.sin(time * 6) : 1;
      ring.scale.setScalar(pulse);
      beacon.visible = !stop.delivered;
      beacon.material.opacity = isNext ? 0.34 : 0.16;
      beacon.material.color.setHex(isNext ? NEXT : GOLD);
    });
    for (const flight of run.flights) {
      let parcel = this.parcels.get(flight.id);
      if (!parcel) {
        parcel = new THREE.Group();
        parcel.name = 'ralph-parcel';
        const box = new THREE.Mesh(parcelGeometry, parcelMaterial);
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.31, 0.06), tapeMaterial);
        parcel.add(box, tape);
        this.root.add(parcel);
        this.parcels.set(flight.id, parcel);
      }
      const t = Math.min(1, flight.elapsedMs / RALPH_RUN.flightMs);
      const at = RalphRunModel.flightAt(flight, t);
      parcel.position.set(at.x, flight.landed ? 0.15 : at.y, at.z);
      if (!flight.landed && !reducedMotion) parcel.rotation.set(t * 5, t * 3, 0);
      else if (flight.landed) parcel.rotation.set(0, flight.id, 0);
    }
  }

  public dispose(): void {
    this.end();
    disposeObject3D(this.root);
  }
}
