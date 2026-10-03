# Contributing

This is a private development repository. Pull the latest changes, work on a
focused branch and open a pull request against `main`. The owner reviews and
merges changes. Describe the behavior changed and the checks you ran.

Use Node 24 and the committed npm lockfile:

```sh
npm ci
npm run build
```

Run `npm run dev` to check affected gameplay and controls in the browser. There is
currently no test script; do not describe the production build as a gameplay test.
Keep game changes separate from dependency updates where practical.

Do not commit `dist/`, `node_modules/`, recovered Git metadata, local settings,
credentials or personal screenshots. Use synthetic data in examples and checks.
