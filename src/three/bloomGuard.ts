import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Keeps one bad pixel from blacking out the whole frame (the 3D depot's
 * high-quality renderer). The scene renders into a multisampled half-float
 * buffer; now and then a sub-sample of some sliver of geometry resolves to
 * not-a-number. On its own that is one wrong pixel, but the bloom pass blurs
 * its input down a chain of ever smaller mip levels, so a single invalid value
 * spreads to every pixel of the bloom, and the frame that adds it comes out
 * black: the flashes the owner saw on the drives. The bloom's input filter now
 * treats an invalid value as no light and caps an infinite one.
 *
 * The clamp is written as max then min because Direct3D 11, which ANGLE runs
 * WebGL on under Windows, defines both to return the valid operand when the
 * other is not-a-number, and its shader compiler drops an `isnan` test as
 * always false (it says so: "warning X3577: value cannot be NaN, isnan() may
 * not be necessary"; the first version of this guard, which used only
 * `isnan`, still let a black frame through on an RTX card). The `isnan` test
 * stays for OpenGL and Metal drivers whose min and max might propagate it.
 */
export const BLOOM_GUARD = 'texel = min( max( texel, vec4( 0.0 ) ), vec4( 1.0e4 ) ); if ( any( isnan( texel ) ) ) texel = vec4( 0.0 );';

export function guardBloom(bloom: UnrealBloomPass): void {
  const material = bloom.materialHighPassFilter;
  const fetch = 'vec4 texel = texture2D( tDiffuse, vUv );';
  if (material.fragmentShader.includes(BLOOM_GUARD)) return;
  if (!material.fragmentShader.includes(fetch)) throw new Error('The bloom high-pass shader changed; update guardBloom');
  material.fragmentShader = material.fragmentShader.replace(fetch, `${fetch}\n\t\t\t${BLOOM_GUARD}`);
  material.needsUpdate = true;
}
