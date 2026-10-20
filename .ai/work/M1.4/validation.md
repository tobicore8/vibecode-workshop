# M1.4 validation — HTTP API

Base SHA: `d47b76e`
Coder: this session, acting for the whole team at the human's direction (see note below).

## What I built

Extended `server.mjs` to `createApp({ revision, store })`: `POST /api/picnics`, `GET /api/picnics/:id`, `POST .../items/:itemId/claim`, `POST .../items/:itemId/unclaim`, plus the asset map gained `/create.js`, `/picnic.js`, `/background.jpg`, and a dynamic `/p/:id` route serving `picnic.html` for any id (the id itself is never used to build a filesystem path). `/api/health` unchanged.

## How I tested

`test/app.test.mjs`, 11 cases, all passing (`node --test test/app.test.mjs`): existing page/CSS/health/HEAD/405/repository-file-blocking tests still pass unmodified; added new UI assets + `/p/:id` served, create returns `201`, missing name/no items returns `400`, oversized body returns `413`, non-JSON body returns `400`, unknown picnic returns `404`, claim conflict returns `409` with the current picnic attached, wrong-name unclaim returns `409`, claim/unclaim without a name returns `400`.

Also ran a manual end-to-end smoke test of the real (non-test) server with a real temp-dir store: create → `/p/:id` loads → claim → re-fetch shows the claim → `/background.jpg` serves. See commands in the session transcript; not saved as a script.

## Limitations

No independent reviewer. `npm test` (full suite) is 39/40 passing; the one failure (`test/deploy.test.mjs`, "flock is missing") is pre-existing, caused by this Mac not having `flock` installed, and unrelated to this change — expected to pass on the actual Linux guest.
