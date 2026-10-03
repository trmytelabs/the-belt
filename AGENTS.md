# Repository editing rules

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
