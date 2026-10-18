import * as THREE from 'three';

const MAX_CIRCLES = 16;
type Truck = { group: THREE.Group };

/** Camera-facing windows reveal people and carried freight through truck shells. */
export class TruckCutaway {
  public readonly circles = Array.from({ length: MAX_CIRCLES }, () => new THREE.Vector4());
  public activeCount = 0;
  private readonly aspect = { value: 1 };
  private readonly windows = { value: this.circles };
  private readonly bounds: { truck: Truck; box: THREE.Box3 }[];

  constructor(trucks: readonly Truck[]) {
    this.bounds = trucks.map(truck => ({ truck, box: new THREE.Box3().setFromObject(truck.group).expandByScalar(1.8) }));
    const materials = new Set<THREE.MeshStandardMaterial>();
    const visit = (object: THREE.Object3D): void => {
      // Include floors and shelf boards: from above, either can hide someone
      // standing beside the truck. Only fragments in front of the person fade.
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) materials.add(material as THREE.MeshStandardMaterial);
      }
      object.children.forEach(visit);
    };
    trucks.forEach(truck => visit(truck.group));
    for (const material of materials) {
      material.transparent = true;
      material.onBeforeCompile = shader => {
        shader.uniforms.crewWindows = this.windows;
        shader.uniforms.windowAspect = this.aspect;
        shader.vertexShader = `varying vec4 vTruckClip;\nvarying float vTruckDepth;\n${shader.vertexShader}`
          .replace('#include <project_vertex>', '#include <project_vertex>\nvTruckClip = gl_Position;\nvTruckDepth = -mvPosition.z;');
        shader.fragmentShader = `uniform vec4 crewWindows[${MAX_CIRCLES}];\nuniform float windowAspect;\nvarying vec4 vTruckClip;\nvarying float vTruckDepth;\n${shader.fragmentShader}`
          .replace('#include <opaque_fragment>', `
            vec2 windowPoint = vTruckClip.xy / vTruckClip.w;
            float shellOpacity = 1.0;
            for (int i = 0; i < ${MAX_CIRCLES}; i++) {
              vec4 circle = crewWindows[i];
              if (circle.z > 0.0 && vTruckDepth < circle.w + 0.15) {
                float radius = length((windowPoint - circle.xy) * vec2(windowAspect, 1.0));
                shellOpacity = min(shellOpacity, mix(0.08, 1.0, smoothstep(circle.z * 0.72, circle.z, radius)));
              }
            }
            diffuseColor.a *= shellOpacity;
            #include <opaque_fragment>
          `);
      };
      material.customProgramCacheKey = () => 'crew-truck-window-v1';
      material.needsUpdate = true;
    }
  }

  public update(camera: THREE.PerspectiveCamera, characters: readonly THREE.Object3D[]): void {
    camera.updateMatrixWorld();
    this.aspect.value = camera.aspect;
    this.activeCount = 0;
    const point = new THREE.Vector3();
    for (const character of characters) {
      if (!character.visible || this.activeCount === MAX_CIRCLES) continue;
      character.getWorldPosition(point);
      point.y += 1.05;
      if (!this.bounds.some(({ box, truck }) => Math.abs(truck.group.position.x) < 15 && box.containsPoint(point))) continue;
      const depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (depth <= camera.near) continue;
      point.project(camera);
      const radius = camera.projectionMatrix.elements[5] * 1.55 / depth;
      if (Math.abs(point.x) > 1 + radius / camera.aspect || Math.abs(point.y) > 1 + radius) continue;
      this.circles[this.activeCount++].set(point.x, point.y, radius, depth);
    }
    for (let index = this.activeCount; index < MAX_CIRCLES; index++) this.circles[index].set(0, 0, 0, 0);
  }
}
