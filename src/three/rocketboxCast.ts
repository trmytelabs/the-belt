/**
 * The crew's imported models: people from the Microsoft Rocketbox avatar
 * library (MIT licence), matched to each character's hair, beard, clothes and
 * role. `tools/rocketbox` converts each source into
 * `public/models/characters/<file>.glb`; see docs/character-models.md.
 */
export interface RocketboxCasting {
  /** The GLB's file name, without extension. */
  file: string;
  /** The avatar's folder under Assets/Avatars in the Rocketbox repository. */
  source: string;
  /** Character names (as in each `CharacterSpec`) that use this model. */
  names: string[];
  /** Largest texture edge in pixels; the closer-framed workers get more detail. */
  textureSize: 512 | 1024;
  /** A walk other than the crew's ordinary one: `formal`, the manager's upright stride (a Quaternius clip). */
  walk?: 'formal';
  /**
   * Wear on the source's look (characterModels.ts): `clothes` fades the clothing on the body material and stains it
   * with that colour, leaving the skin; `greyHair` turns the hair grey, the cards and the hair painted on the head.
   */
  wear?: { clothes?: number; greyHair?: boolean };
  /**
   * Changes baked into the GLB when tools/rocketbox converts it: `paint`, the body texels on triangles wholly between two
   * heights (fractions of the standing height) painted a colour with their light and shade kept, only those of one
   * `hue` range (degrees, red at 0) and `minSaturation` when given, with a fine `weave` for denim.
   */
  restyle?: {
    paint?: { from: number; to: number; color: number; hue?: [number, number]; minSaturation?: number; weave?: boolean }[];
  };
}

/** The Rocketbox commit the models were converted from. */
export const ROCKETBOX_COMMIT = '0943055db6ec570bcef9f2c8b41c9e5467c808f9';

export const ROCKETBOX_CAST: RocketboxCasting[] = [
  // Termite (the owner's, 2026-10-22): a white guy in a polo and jeans, not the bearded lumberjack in a beanie he was.
  // The striped polo's khaki shorts and bare shins become jeans.
  { file: 'termite', source: 'Adults/Male_Adult_01', names: ['TERMITE', 'TRMYTE'], textureSize: 1024,
    restyle: { paint: [{ from: 0.045, to: 0.495, color: 0x3d5675, weave: true },
      // The waistband under the polo's hem: only its khaki.
      { from: 0.44, to: 0.62, hue: [32, 62], minSaturation: 0.2, color: 0x3d5675, weave: true }] } },
  // Skanky (the owner's, 2026-10-22): a rocker with Bruce Banner's messy, wavy hair (his own) and his red henley black.
  { file: 'skanky', source: 'Adults/Male_Adult_06', names: ['SKANKY'], textureSize: 1024,
    restyle: { paint: [{ from: 0.4, to: 0.88, hue: [-25, 14], minSaturation: 0.32, color: 0x1f1f23 }] } },
  { file: 'shan', source: 'Professions/Business_Male_07', names: ["SHAN O'MAC"], textureSize: 1024, walk: 'formal' },
  { file: 'kylie', source: 'Adults/Male_Adult_10', names: ['KYLIE'], textureSize: 1024 },
  // The owner's Vic is an old Asian man in dirty clothes: Rocketbox has no older Asian man, so its East Asian man, greyed.
  { file: 'vic', source: 'Adults/Male_Adult_09', names: ['VIC'], textureSize: 1024, wear: { clothes: 0x5a4630, greyHair: true } },
  { file: 'john-rushton', source: 'Adults/Male_Adult_08', names: ['JOHN RUSHTON'], textureSize: 1024 },
  { file: 'hussan', source: 'Adults/Male_Adult_17', names: ['HUSSAN'], textureSize: 1024 },
  { file: 'aj', source: 'Adults/Male_Adult_14', names: ['AJ'], textureSize: 512 },
  { file: 'ben', source: 'Adults/Male_Adult_02', names: ['BEN'], textureSize: 512 },
  { file: 'bannerman', source: 'Adults/Male_Adult_13', names: ['BANNERMAN'], textureSize: 512 },
  { file: 'fruit-loop', source: 'Adults/Male_Adult_11', names: ['FRUIT LOOP'], textureSize: 1024 },
  { file: 'doris', source: 'Adults/Female_Adult_04', names: ['DORIS'], textureSize: 1024 },
  { file: 'brian', source: 'Professions/Gardener_Male_01', names: ['BRIAN'], textureSize: 1024 },
  { file: 'donna', source: 'Adults/Female_Adult_15', names: ['DONNA'], textureSize: 512 },
  { file: 'paula-abdul', source: 'Adults/Female_Adult_05', names: ['PAULA ABDUL'], textureSize: 512 },
  { file: 'ralph', source: 'Professions/Wood_Male_01', names: ['RALPH'], textureSize: 512 },
  { file: 'gunman', source: 'Adults/Male_Adult_18', names: ['GUNMAN'], textureSize: 512 },
  { file: 'donnas-husband', source: 'Adults/Male_Adult_07', names: ["DONNA'S HUSBAND"], textureSize: 512 },
  { file: 'cashier', source: 'Adults/Male_Adult_12', names: ['CASHIER'], textureSize: 512 },
  { file: 'clerk', source: 'Adults/Female_Adult_11', names: ['CLERK'], textureSize: 512 },
  { file: 'unloader', source: 'Professions/Construction_Male_08', names: ['UNLOADER'], textureSize: 512 },
  { file: 'driver', source: 'Adults/Male_Adult_16', names: ['DRIVER'], textureSize: 512 },
  { file: 'dockhand', source: 'Adults/Male_Adult_04', names: ['DOCKHAND'], textureSize: 512 },
];
