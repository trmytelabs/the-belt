import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

/**
 * Screen-space ambient occlusion for the 3D night: the contact shading under
 * trucks, freight, shelves and people that the merged, flat-lit geometry
 * otherwise lacks.
 *
 * Three's GTAO pass normally draws the whole scene a second time for its
 * depth and normal buffers, which doubles the draw calls. This pass reads
 * the depth the composer's own render already wrote (`depthTexture`) and
 * reconstructs normals from it, so it costs no extra scene pass. Name tags,
 * parcel tags, the pickup and delivery rings and the snow write no depth, so
 * they cast no false shadows. The occlusion itself is computed at half
 * resolution; the denoise step already softens it.
 */
export class DepotAmbientOcclusion extends GTAOPass {
  /** The fraction of the frame the occlusion buffers use on each axis. */
  public static readonly SCALE = 0.5;

  constructor(scene: THREE.Scene, camera: THREE.Camera, depthTexture: THREE.DepthTexture) {
    // Built with its own buffers first: the pass expects them to exist before an external depth texture replaces them.
    super(scene, camera, 1, 1);
    this.setGBuffer(depthTexture);
    this.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.2, thickness: 1, distanceFallOff: 1, scale: 1.1, samples: 10, screenSpaceRadius: false });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 10 });
    this.output = GTAOPass.OUTPUT.Default;
    this.blendIntensity = 0.9;
  }

  /**
   * The depth texture a composer target needs for this pass to read. Depth
   * only, no stencil: a multisampled target resolves its depth into this
   * texture with a blit, which fails (and draws nothing) unless the texture
   * matches the target's own depth-only renderbuffer.
   */
  public static depthTexture(): THREE.DepthTexture {
    const texture = new THREE.DepthTexture(1, 1);
    texture.format = THREE.DepthFormat;
    texture.type = THREE.UnsignedIntType;
    return texture;
  }

  public override setSize(width: number, height: number): void {
    super.setSize(Math.max(1, Math.round(width * DepotAmbientOcclusion.SCALE)), Math.max(1, Math.round(height * DepotAmbientOcclusion.SCALE)));
  }
}
