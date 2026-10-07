# Publishing n8n-nodes-mailmycard

Owner steps to put this package on npm and submit it for n8n verification.
Nothing here has been done yet: the package is not on npm and
`github.com/mailmycard/n8n-nodes-mailmycard` does not exist.

n8n's rule since 1 May 2026: a node submitted for verification **must be
published from GitHub Actions with an npm provenance statement**. A package
published from a laptop is refused. The workflow in `.github/workflows/publish.yml`
(n8n's own starter workflow) does this; `package.json` also blocks a plain
`npm publish` outside a release (`prepublishOnly: n8n-node prerelease`).

Sources: [Submit community nodes](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes/),
[Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines/).

## 1. Create the public GitHub repository

The npm package's `repository` must point at a **public** repo, and its owner
must match the npm maintainer (n8n checks both).

1. On GitHub, create the organisation `mailmycard` if it does not exist, then a
   **public** repository `n8n-nodes-mailmycard`, empty (no README or licence).
   If you use a different owner or name, update `repository.url` and `bugs.url`
   in `package.json` and the credential documentation URL in
   `nodes/MailMyCard/*.node.json` first.
2. Copy this folder into it as the repository root:

   ```sh
   cd integrations/n8n
   rm -rf node_modules dist *.tgz
   mkdir -p /tmp/n8n-nodes-mailmycard && cp -R . /tmp/n8n-nodes-mailmycard/
   cd /tmp/n8n-nodes-mailmycard
   git init -b main && git add -A && git commit -m "n8n-nodes-mailmycard 1.0.0"
   git remote add origin git@github.com:mailmycard/n8n-nodes-mailmycard.git
   git push -u origin main
   ```

   `.github/workflows/` only runs once it is at a repository root, which is why
   the workflows do nothing while this folder sits inside the MailMyCard repo.
3. Check the **CI** workflow passes on GitHub (lint, build, tests).

## 2. Give GitHub Actions permission to publish

npm's Trusted Publishing is configured in the package's settings, which only
exist once the package does, so the **first** publish uses a token:

1. `npm login` as the account that will own the package (use an account or npm
   org you control long-term; its name is shown as the maintainer).
2. On npmjs.com: **Access Tokens → Generate New Token → Granular Access Token**,
   permission **Read and write** for packages, short expiry (7 days is enough).
3. On GitHub: repo **Settings → Secrets and variables → Actions → New secret**,
   name `NPM_TOKEN`, paste the token.

## 3. Publish 1.0.0

`package.json` is already at `1.0.0` and `CHANGELOG.md` has its entry, so tag
that commit. The workflow runs on tags like `1.0.0` (no `v`):

```sh
git tag 1.0.0
git push origin 1.0.0
```

The **Publish** workflow runs lint and build, then `npm publish` with
`NPM_CONFIG_PROVENANCE=true`. Check afterwards:

- https://www.npmjs.com/package/n8n-nodes-mailmycard shows a **Provenance** badge
  linking to the workflow run.
- `npx @n8n/scan-community-package n8n-nodes-mailmycard` prints
  "has passed all security checks". (It checks provenance and lints the attested
  source and the published tarball; both halves passed locally before release.)

## 4. Switch to Trusted Publishing and drop the token

1. On npmjs.com: package **Settings → Trusted Publisher → GitHub Actions**:
   owner `mailmycard`, repository `n8n-nodes-mailmycard`, workflow `publish.yml`,
   environment blank.
2. Delete the `NPM_TOKEN` secret on GitHub and revoke the token on npm.
3. Optionally, in the package settings, set publishing access to
   "Require two-factor authentication and disallow tokens".

Later releases: `npm run release` on a clean, pushed `main`. It lints, builds,
asks for the version bump, regenerates `CHANGELOG.md` from the git history,
commits, tags, pushes and creates a GitHub release; the tag push publishes.

## 5. Submit for n8n verification

1. Sign in to the **n8n Creator Portal**: https://creators.n8n.io/nodes
2. Submit `n8n-nodes-mailmycard`. n8n fetches the package from npm and reviews
   it against the verification and UX guidelines.

Already true of this package: name starts `n8n-nodes-`, keyword
`n8n-community-node-package`, nodes and credential listed under `n8n` in
`package.json`, `strict` lint config unchanged, MIT licence, no runtime
dependencies, no environment or filesystem access, English only, README with
operations, credentials, compatibility and usage.

Things a reviewer might still ask for (not required by any automated check):
a **Simplify** option on Send Card / Get Order (orders have more than 10 fields),
or more operations (the API also has Get Many Orders, template create/update/delete,
and batch send).
