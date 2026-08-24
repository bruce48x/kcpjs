# Repository Instructions

These instructions apply to the entire repository.

## Development

- Keep source changes in `src/` and tests in `tests/`.
- Run `npm test` before committing. It compiles TypeScript and runs the lifecycle and protocol regression tests.
- Run the relevant TypeScript, ESLint, and Prettier checks when changing examples or build configuration.
- Files under `dist/` are tracked build outputs. Include regenerated files only when their source files changed.
- Preserve backward compatibility unless the requested change explicitly requires a protocol or API break. Document any wire-format incompatibility.

## Releases

- Releases are made only from the `main` branch.
- For a normal release, change only the `version` field in `package.json`, run `npm test`, commit the version change, and push it to `main`.
- Pushing to `main` automatically runs the `Publish npm package` GitHub Actions workflow. It publishes only when the version does not already exist on npm.
- Do not run `npm publish` locally and do not add or use a long-lived `NPM_TOKEN` unless explicitly requested.
- Confirm that the target version does not already exist on npm before creating the release commit.
