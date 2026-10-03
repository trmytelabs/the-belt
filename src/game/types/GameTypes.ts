export type PackageDestination =
  | 'HERES_UR_SOVICE'
  | 'PAYTMAN'
  | 'BULK'
  | 'MISSED';

export type PackageSize =
  | 'small_envelope'
  | 'small_box'
  | 'medium_box'
  | 'large_box'
  | 'long_box'
  | 'mesa_boogie'
  | 'quad_bike'
  | 'goji_berries'
  | 'live_lobsters';

export type BeltEventState =
  | 'idle'
  | 'vicPathing'
  | 'vicPressing'
  | 'beltStopped'
  | 'shanEntering'
  | 'shanPressing'
  | 'mesaVicApproaching'
  | 'mesaChoice'
  | 'mesaCaught'
  | 'cooldown';

export type GameOverData = {
  title?: string;
  subtitle?: string;
  detail?: string;
};

export type PlayerId = 'termite' | 'skanky';

export type Direction = 'down' | 'up' | 'left' | 'right';
