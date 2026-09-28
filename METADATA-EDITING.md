# Editing Map Library records

HyperCities offers a small browser-based editor at `/map-editor.html`. Choose a place or search for a map, inspect its tile preview, and change the record fields. The map ID is fixed. Submitting opens a prefilled GitHub Issue because a GitHub Pages site cannot safely hold a repository write token.

After the issue is submitted, the `Publish map metadata edits` workflow checks the exact GitHub account. The allowlisted editors are `yohman` and `toddpresner`. It validates the map ID, allowed CSV columns, geographic bounds, and tile URL, then commits the change to `main`. It also regenerates `data/maps.json` from `data/maps.csv`, comments with the result, and closes a successful issue. It does not publish edits from other authors. The account allowlist is enforced in both the workflow and the processing script.

The HyperCities site fetches the public CSV directly from this repository, so its map records do not wait for a second graph extraction step. The raw GitHub CSV endpoint allows cross-origin reads and is cached for up to five minutes; the editor and site request a fresh URL when loading records. The generated JSON remains available for Map Library clients that consume it.

## Repository setup

The repository owner should confirm that GitHub Actions and Issues are enabled, that `main` accepts the workflow's `GITHUB_TOKEN` write permission, and that no branch rule blocks automated commits. The workflow requests only `contents: write` and `issues: write`, and publishes issue events authored by `yohman` or `toddpresner`. If GitHub requires changing the repository-wide workflow permission setting, do that in repository Settings → Actions → General → Workflow permissions.

The editor is intentionally a public static page; the write boundary is GitHub's sign-in plus the workflow's account allowlist. Do not add a personal access token to the site or commit one into this repository.

## Local validation

```sh
node --check scripts/apply-map-edit.mjs
node --check scripts/build-maps-json.mjs
node scripts/build-maps-json.mjs
```

The final command rewrites `data/maps.json`; review its diff before committing when using it manually.
