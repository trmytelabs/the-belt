# Deploying a build

**The game is live at https://thebelt.patchnotes.ca**, the owner's own server,
and mirrored at https://trmytelabs.github.io/the-belt/ (GitHub Pages). Both are
public to anyone with the address, as is the repository since 2026-10-26.

## The server (thebelt.patchnotes.ca)

`.github/workflows/deploy.yml` runs on GitHub-hosted runners:

1. **Site bundle and container image**, on every pull request and every push
   to `main`: `npm ci --ignore-scripts` and `npm run build` for the root of a
   domain (the default base, unlike the Pages build), then a bundle of the
   `Dockerfile`, `deploy/container.Caddyfile` and `dist/` as one gzipped tar.
   The job builds the image from that bundle (Caddy serving `dist/` on port
   8080 as an unprivileged user, with `/version.txt` holding the commit), runs
   it as production does (read-only, every Linux capability dropped) and checks
   `/health`, `/version.txt`, the page, `?mode=3d`, the security headers and a
   model, texture and track from `public/`.
2. **Deploy to production**, on `main` only: the bundle is streamed over SSH
   to the server's `deploy` user. That user's key for this project is forced
   to one command, `the-belt <commit sha>` (`deploy/server/deploy-the-belt-gate`),
   which hands the stream to `deploy-the-belt` as root: `docker build` the
   same image there, replace the running container on `127.0.0.1:8081`, wait
   for its health check and confirm it serves that commit; if not, the
   previous image goes back and the deploy fails. The workflow then waits
   until `https://thebelt.patchnotes.ca/version.txt`, read through Cloudflare,
   reports the commit, and checks the page and `?mode=3d`.

The merge to `main` was already gated by CI, so the deploy does not re-run the
suites. A failed deploy leaves the previous build live. No registry is
involved: the server builds the image from the bundle it receives.

`deploy/container.Caddyfile` holds the Content-Security-Policy, the other
security headers and the caching rules, versioned with the code: if the game
ever talks to a new outside origin (today only Google Fonts and PeerJS's public
service for PLAY ONLINE), add it there or the browser blocks it.

### Setting the server up (once)

The server already runs Docker, Caddy and the `deploy` user for Next Level.
Copy `deploy/server/` there and run, as root:

```sh
DEPLOY_PUBKEY="$(cat thebelt_deploy.pub)" bash setup.sh --dry-run
DEPLOY_PUBKEY="$(cat thebelt_deploy.pub)" bash setup.sh
```

It installs the two scripts under `/usr/local/bin`, a sudo rule so `deploy`
can run `deploy-the-belt` (and nothing else) as root, the deploy key forced to
the gate, and a Caddy site block for `thebelt.patchnotes.ca` cloned from Next
Level's (same TLS, Cloudflare-only rule and logging) that proxies to port 8081.
`--dry-run` prints every change first. Then:

- At Cloudflare, add a proxied `A` record `thebelt` pointing at the server.
- On the owner's PC, `deploy\set-github-secrets.cmd` stores `DEPLOY_HOST`
  (the server's own address, since SSH does not go through Cloudflare),
  `DEPLOY_USER`, `DEPLOY_SSH_KEY` (`~/.ssh/thebelt_deploy`, generated on that
  PC; the private half never leaves it) and `DEPLOY_KNOWN_HOSTS` in the
  repository's `production` environment.
- Merge to `main`, or run "Deploy to the server" from the Actions tab.

To redeploy or roll back by hand, run the workflow from the Actions tab on
`main` or on an earlier tag (`v1.1.0`); on the server, `deploy-the-belt <sha>`
with a site bundle on stdin does the same.

## GitHub Pages mirror

**The mirror is at https://trmytelabs.github.io/the-belt/** (the owner turned
this on, 2026-10-23). The Pages workflow (`.github/workflows/pages.yml`)
publishes it from `main` after every merge: it builds with
`--base=/the-belt/` on a GitHub-hosted runner and deploys to GitHub Pages. The site is public to anyone with the
address. To publish again without a
merge, run the workflow by hand from the repository's Actions tab (Pages, Run
workflow). To take the site down, turn Pages off in the repository's settings.

CI does not re-test an ordinary merge. A pull request merges only after both checks pass on a branch that is up to date
with `main`, so when it merges with a merge commit (the usual way here), that
commit's tree is exactly the tree the checks just passed. CI's first job on a
push to `main` compares the merge commit's tree with its second parent's (the
pull request's head) and, when they match, skips the build and browser jobs;
they show as skipped. Pull request checks
always run in full. A direct push, a squash or rebase merge, or a merge whose
tree differs still runs every check on `main`. The skip relies on `main`'s
ruleset requiring both checks on up-to-date branches; remove it if that rule
ever changes.

The game is a static site: `npm run build` writes everything it needs into
`dist/` (the page, the scripts, and `public/`'s models, textures and audio,
about 100 MB). There is no server component. The CI workflow never deploys; the
deploy workflow ships the server image and the Pages workflow publishes the mirror.

Publishing a build makes it public to anyone with the address. Check the build
first:

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

GitHub Pages can publish from a private repository on GitHub Pro too, but the
site itself is public once published. Setting it up is the owner's decision; the repository's
workflows do not publish anything.

## Checking a deployed build

- The briefing appears and the depot is lit (not black). A software renderer
  draws less and slower; a computer with a graphics card is the intended way
  to play.
- The browser's console shows no 404s for `models/`, `textures/` or `audio/`
  files: a 404 there means the build's base does not match the folder.
- Sound starts after the first key press or click, as browsers require.
