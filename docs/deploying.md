# Deploying a build

**The game is live at https://trmytelabs.github.io/the-belt/** (the owner turned
this on, 2026-10-23). The Pages workflow (`.github/workflows/pages.yml`)
publishes it from `main` after every merge: it builds with
`--base=/the-belt/` on the owner's PC (the `belt-pc` runner, no Actions
minutes) and deploys to GitHub Pages. The site is public to anyone with the
address; the repository itself stays private. To publish again without a
merge, run the workflow by hand from the repository's Actions tab (Pages, Run
workflow). To take the site down, turn Pages off in the repository's settings.

The game is a static site: `npm run build` writes everything it needs into
`dist/` (the page, the scripts, and `public/`'s models, textures and audio,
about 50 MB). There is no server component. The CI workflow never deploys; only
the Pages workflow publishes.

Publishing a build makes it public to anyone with the address, even though the
repository stays private. Check the build first:

```sh
npm ci
npm run build
npm run preview
```

Then open the address `npm run preview` prints, add `?mode=3d` if needed, and
play a little.

## At the root of a domain

Upload the contents of `dist/` (not the folder itself) to the site's root, so
`index.html` is at `https://example.com/index.html`. Any static host works.

## In a folder (GitHub Pages, a sub-path)

A host that serves the game from a folder, such as a GitHub Pages project
site at `https://<user>.github.io/the-belt/`, needs the build to know that
folder:

```sh
npm run build -- --base=/the-belt/
```

Every asset path then starts with `/the-belt/` (`src/three/assetBase.ts`).
Upload `dist/`'s contents into that folder. In Git Bash on Windows, write
`MSYS_NO_PATHCONV=1 npm run build -- --base=/the-belt/` so the shell does not
turn `/the-belt/` into a Windows path.

GitHub Pages can publish from a private repository on GitHub Pro, but the
site itself is public once published. Setting it up is the owner's decision; the repository's
workflows do not publish anything.

## Checking a deployed build

- The briefing appears and the depot is lit (not black). A software renderer
  draws less and slower; a computer with a graphics card is the intended way
  to play.
- The browser's console shows no 404s for `models/`, `textures/` or `audio/`
  files: a 404 there means the build's base does not match the folder.
- Sound starts after the first key press or click, as browsers require.
