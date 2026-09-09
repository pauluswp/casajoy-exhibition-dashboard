# Local development

This repository is the source-only development copy of the CasaJoy Cloudflare deployment. Customer rows, scan images, credentials, and private exports remain outside the repository.

## Before changing code

Start from an up-to-date `main` branch and create a feature branch:

```text
git switch main
git pull --ff-only
git switch -c codex/short-change-name
```

Do not work directly against the production D1 database during local development.

## Safe checks

Run JavaScript syntax checks:

```text
npm run check
```

Initialize or update the local D1 database, then load only the committed synthetic fixture:

```text
npm run check:local-d1
```

The local D1 state is stored under `.wrangler/local-qa/`, which is ignored by Git. The fixture is deliberately synthetic and must never be replaced with a customer export.

## Local application testing

Run the Worker locally with Wrangler and local bindings when testing API behavior. Use Pages development separately for the static dashboard and proxy shell. Keep production bindings disabled for local work; do not use `--remote`.

Before opening a pull request, inspect the diff, run `npm run check`, test the affected dashboard flows with synthetic data, and confirm that no private or generated files are staged.
