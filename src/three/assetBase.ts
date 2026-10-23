/**
 * Where the game's own files (public/: models, audio, textures) are served from: the build's base path, so a build
 * made with `vite build --base=/some/folder/` works in that folder (GitHub Pages serves a project from one) as well
 * as at a domain's root. Outside Vite (the model tests run in Node) there is no base, and paths start at the root.
 */
export const ASSET_BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** `path` (under public/, with or without a leading slash) as the build serves it. */
export const assetUrl = (path: string): string => `${ASSET_BASE}${path.replace(/^\/+/, '')}`;
