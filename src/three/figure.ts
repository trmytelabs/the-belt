/**
 * The procedural figure's proportions, shared by the figure itself, its
 * poses and the seated-limb solver (and importable without the figure's
 * meshes, so node checks can lay out a figure).
 */

/** Joint heights and limb lengths, in metres at scale 1. */
export const BODY = {
  hipY: 0.9,
  hipX: 0.092,
  thigh: 0.44,
  shin: 0.4,
  shoulderY: 1.385,
  shoulderX: 0.205,
  upperArm: 0.29,
  forearm: 0.25,
  neckY: 1.5,
} as const;

/** How far the body pivot drops for the `sit` pose: a seated figure's hips sit this much under their standing height. */
export const SEATED_BODY_DROP = 0.41;
