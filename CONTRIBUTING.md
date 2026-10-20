# Contributing

This is a private development repository. Pull the latest changes, work on a
focused branch and open a pull request against `main`. The owner reviews and
merges changes. Describe the behavior changed and the checks you ran.

New gameplay and presentation work targets only the 3D depot, the default game
and `?mode=3d`. Keep the classic game (`?mode=classic`) as a legacy version.
Preserve its behavior when editing shared code; do not extend it for new 3D
requests.
Carry this scope into future implementation plans and pull requests unless the
owner explicitly requests another version. See [AGENTS.md](AGENTS.md).

Use Node 24 and the committed npm lockfile:

```sh
npm ci
npm run build
npx playwright install chromium
npm run test:browser
```

Run `npm run dev` to check affected gameplay and controls in the browser. There is
also a browser smoke test for keyboard/touch start, controls, results and restart.
It uses the production bundle and isolated synthetic state. It does not cover
every timed event or verify audible sound on a physical device.
Keep game changes separate from dependency updates where practical.

Do not commit `dist/`, `node_modules/`, recovered Git metadata, local settings,
credentials or personal screenshots. Use synthetic data in examples and checks.

## Git and version workflow

1. Check for local changes before starting; preserve them and confirm their scope.
2. With a clean working tree, switch to `main` and run `git pull --ff-only`.
3. Create a focused branch such as `fix/short-description` or `docs/short-description`.
4. Make small commits, inspect the staged diff, and run the checks above.
5. Push the branch and open a pull request. Review the full diff and wait for all
   applicable GitHub checks before merging. Never force-push `main` or rewrite
   published history. Required human/product approvals still apply.
6. After merge, switch to `main`, pull with `--ff-only`, and delete the merged
   task branch. Start the next change from that updated `main`.

Use the repository's existing version and changelog rules for releases. For a
versioned component, use a patch for compatible fixes, a minor for compatible
features, and a major for breaking changes; update all linked version fields.
A dependency major upgrade needs a separate compatibility review. Commit source
and lockfiles, and keep generated builds, private configuration and credentials
out of Git. GitHub's paid-plan restrictions may prevent enforcing checks on a
private branch, so the review/check sequence remains required even when the
service cannot enforce it.
