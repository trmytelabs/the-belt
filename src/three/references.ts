import { MESA as LEGACY_MESA } from '../game/slice/DepotReferences.ts';

/** The current depot keeps a caught theft playable. Legacy dialogue is retained separately. */
export const MESA = {
  ...LEGACY_MESA,
  body: "Vic says he'll throw it in the back of his SUV.\n1 IN 5 SHAN O MAC CATCHES YOU BOTH.\nIf he does, you lose up to 500 points and get back to work.",
};
