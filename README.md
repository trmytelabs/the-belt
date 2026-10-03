# The Belt

The Belt is a browser game built with Phaser, TypeScript and Vite. Players switch
between workers, pick up packages and sort them to the appropriate dock. The game
includes keyboard, mouse and touch controls.

This private repository contains the current development snapshot (`0.0.0`). It
has a working production build, but no automated gameplay test suite or published
release. Review playability in the browser when changing game behavior.

## Run locally

Install Node.js 24 (with npm), then run from the repository root:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Press Enter or tap the title screen to start.
Use Tab or right-click to switch workers, and Space or left-click to grab or drop
a package. Touch controls are available on mobile screens.

Node 24 is recorded in `.node-version` and used by CI. The locked Vite dependency
requires Node `^20.19.0 || >=22.12.0`; use the documented Node version so local and
CI checks agree.

## Build and preview

```sh
npm run build
npm run preview
```

The build runs TypeScript checking and then creates the production bundle in
`dist/`. Preview serves that bundle locally. Generated output and dependency
folders are ignored; the GitHub workflow only installs from `package-lock.json`
and runs the build. It does not deploy or publish a release.

The page references Google Fonts when a network connection is available.
Browser behavior, touch input and gameplay still need manual checks after relevant
changes; a successful build does not verify those interactions.

## Source and history

The source was recovered from a local checkout originally associated with
[`RecursiveDelete/thebelt`](https://github.com/RecursiveDelete/thebelt). Its old
Git metadata could not resolve the recorded HEAD and was preserved locally in
ignored `.git-recovery-backup/`. This repository starts with a reviewed snapshot
of the current source, rather than reconstructing that unavailable history.
The old remote remains recorded as `upstream` for provenance.

No license has been established for this snapshot. Repository privacy does not
grant permission to redistribute the source or its assets.

See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and
[SECURITY.md](SECURITY.md) for private security reporting.
