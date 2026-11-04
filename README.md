# Verify Release Tag

[![CI](https://github.com/jfrz38/verify-release-tag/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jfrz38/verify-release-tag/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/jfrz38/verify-release-tag?display_name=tag)](https://github.com/jfrz38/verify-release-tag/releases)
[![GitHub Marketplace](https://img.shields.io/badge/marketplace-verify--release--tag-blue?logo=githubactions)](https://github.com/marketplace/actions/verify-release-tag)
[![License](https://img.shields.io/github/license/jfrz38/verify-release-tag)](LICENSE)

A read-only GitHub Action that verifies whether a release tag is consistent
with a version declared in a JSON manifest and, optionally, with an expected
Git commit.

## What it checks

The Action:

- reads a top-level string `version` from a JSON file;
- derives the expected tag from an exact prefix and that version;
- validates an explicitly requested tag when provided;
- inspects the exact local Git tag reference;
- resolves lightweight and annotated tags to commits;
- optionally compares the tag commit with another Git revision;
- applies an explicit tag-existence policy.

It never creates, moves, deletes, fetches, or pushes Git references, and it
does not call the GitHub API.

## Usage

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@<commit-sha>
    with:
      fetch-depth: 0

  - id: release-tag
    uses: jfrz38/verify-release-tag@v0
    with:
      version-file: package.json
      tag-prefix: v
      expected-commit: ${{ github.sha }}
      policy: allow-missing
```

This configuration allows the tag to be absent, but requires an existing tag
to point to the workflow commit. The `v0` alias follows the latest compatible
`0.x` release; `v0.1.0` identifies the first exact release. For the strongest
supply-chain guarantee, pin Actions to immutable commit SHAs.

## Inputs

| Input             | Default         | Description                                                        |
| ----------------- | --------------- | ------------------------------------------------------------------ |
| `version-file`    | `package.json`  | JSON file containing a top-level non-empty string `version`.       |
| `tag-prefix`      | `v`             | Exact string prepended to the version; it may be explicitly empty. |
| `tag`             | —               | Explicit tag that must exactly match the derived tag.              |
| `expected-commit` | —               | Git revision that must resolve to a commit before comparison.      |
| `policy`          | `allow-missing` | Tag-existence policy to apply.                                     |

Input values are compared exactly. Tag names and prefixes are not trimmed,
case-folded, or otherwise normalized.

## Policies

| Policy             | Tag absent | Tag present | Present at expected commit | Present at another commit |
| ------------------ | ---------: | ----------: | -------------------------: | ------------------------: |
| `allow-missing`    |       Pass |        Pass |                       Pass |                      Fail |
| `require-existing` |       Fail |        Pass |                       Pass |                      Fail |
| `require-missing`  |       Pass |        Fail |             Not applicable |            Not applicable |

`expected-commit` cannot be combined with `require-missing`.

## Outputs

| Output            | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `version`         | Original version read from the manifest.                    |
| `tag`             | Derived and validated release tag.                          |
| `tag-exists`      | Whether the exact local tag reference exists.               |
| `tag-commit`      | Full commit ID resolved from the tag, or empty when absent. |
| `expected-commit` | Full resolved expected commit ID, or empty when omitted.    |
| `commit-matches`  | Comparison result, or empty when no comparison occurred.    |
| `policy`          | Policy applied by the Action.                               |

Reliable outputs discovered before a validation failure are still published.

## Repository requirements

The Action inspects only the local checkout. Use a complete checkout so all
relevant tags are available:

```yaml
- uses: actions/checkout@<commit-sha>
  with:
    fetch-depth: 0
```

Shallow repositories are rejected. A local check cannot prove that an unseen
remote tag does not exist or prevent another process from changing a tag after
verification.

Both lightweight and annotated tags are supported. A tag that exists but does
not resolve to a commit is reported as invalid rather than absent.

## Development

GNU Make is the project's operational entry point. Run `make` or `make help`
to list the available commands. A typical local setup is:

```sh
make install
make validate
```

Use `make format` to apply formatting and `make test` to run the complete test
suite. The existing `pnpm` scripts remain as compatibility wrappers around the
same Make targets. On Windows, use an environment that provides GNU Make and
`awk`, such as Git Bash with those tools installed.

## Release flow

Releases use the version declared in `package.json` as their source of truth.
Run the `Bump Version` workflow to prepare a reviewed version pull request
against `develop`, then promote `develop` to `main`. After the complete CI
workflow succeeds on `main`, the release workflow:

1. verifies the exact `vX.Y.Z` tag against the validated commit;
2. creates the immutable exact tag when it is absent;
3. updates the matching major alias, such as `v0`;
4. creates the GitHub Release if it does not already exist.

Repeating the workflow for the same commit is safe. A reused version that
already points to another commit fails before the major alias can move.

## License

[MIT](LICENSE)
