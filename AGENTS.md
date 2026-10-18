# Repository editing rules

## Active game version

Only update the 3D depot (`?mode=3d`, the default game) going forward. The 2D
depot and classic game are retained as legacy versions. Do not change their
gameplay, visuals, controls or tests to implement new 3D requests. Keep new 3D
rules and layout separate; changes to shared code must preserve legacy behavior.
Apply this scope to future plans, implementation instructions and pull requests
unless the owner explicitly requests work on another version.

Read CONTRIBUTING.md, README.md and SECURITY.md before changes. The private
GitHub repository's `main` is the source of truth. Follow the Git and version
workflow in CONTRIBUTING.md: preserve existing work, update a clean `main` with
a fast-forward pull, use a focused branch, and submit a checked pull request.
Never force-push `main` or discard unrelated work. Merge only with the owner's
authorization and all applicable checks passing. Keep credentials, private
configuration, dependencies and generated output out of commits.

Use synthetic fixtures. Report checks actually run and any remaining manual
verification. Follow the repository-specific safety and release rules; a green
source/build check does not approve hardware actions, deployment or publication.
