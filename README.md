# HackerFab Tracker

The HackerFab team's task tracker, at **https://tracker.hackerfabiitb.org**.
Tasks live in projects, projects live in groups, and each group gets its own
kanban-style board split by priority.

## Stack

- SvelteKit 2 with Svelte 5 runes, built by Vite
- Hosted on Vercel (free Hobby plan) via `@sveltejs/adapter-vercel`
- Data in Upstash Redis (free tier), same setup as the inventory app

## Data model

```
group            e.g. "Lithography" -- id is a slug of the name, used in board URLs
  └── project    e.g. "Mask aligner" -- id is a UUID
        └── task title, priority, due, notifyAt, createdAt, completed, notes
```

Priority is one of `urgent`, `high`, or `low`. A task is done when `completed`
holds an ISO timestamp, and open when it is `null`.

The whole tree is one JSON document in Redis under `tracker:data`, with a
counter in `tracker:version`. Every write is a compare-and-set against that
counter (a small Lua script in `src/lib/server/store.js`), so two people saving
at the same moment never overwrite each other. The loser retries on fresh data.

## How state flows

The server loads the full tree in `src/routes/+layout.server.js` and hands it to
the client, where `src/lib/data-store.svelte.js` holds it. Pages update that
copy at once and send the change to the JSON API in the background, so the UI
never waits on a round trip. The tree is reloaded whenever the tab comes back
into view, which is how you see other people's changes.

## Auth

Everyone logs in with an email and password listed in the `USERS` environment
variable. There is no sign-up and no password reset. To add or remove someone,
edit `USERS` in Vercel and redeploy. Removing an email logs that person out on
their next request.

The session cookie holds the email, an expiry, and an HMAC of both, so no
session state is kept on the server. Sessions last 90 days and the cookie is
reissued on every request.

## Configuration

See `.env.example`. On Vercel these go in Project → Settings → Environment
Variables; locally they go in `.env`.

| Variable | What |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash database REST credentials |
| `REDIS_PREFIX` | Optional key prefix, default `tracker:` |
| `USERS` | JSON object of email → password |
| `SESSION_SECRET` | Signs cookies. Changing it logs everyone out |

## Running locally

```sh
npm install
cp .env.example .env   # then fill it in
npm run dev
```

Local dev talks to whichever Redis database `.env` points at. If that is the
production database, you are editing the real data.

## Deploying

One-time setup:

1. **Redis.** In the Upstash console, create a Redis database (free tier).
   Copy the REST URL and token. (Sharing the inventory app's database also
   works, because every key here starts with `tracker:`.)
2. **Vercel.** Push this folder to a GitHub repo and import it in Vercel. The
   SvelteKit preset is detected automatically. Add the environment variables
   above, then deploy.
3. **Domain.** In Vercel, go to Project → Settings → Domains and add
   `tracker.hackerfabiitb.org`. In Squarespace, go to Domains →
   hackerfabiitb.org → DNS → Custom records and add the record Vercel shows,
   usually:

   | Host | Type | Data |
   | --- | --- | --- |
   | `tracker` | CNAME | `cname.vercel-dns.com` |

   Vercel issues the HTTPS certificate once DNS resolves.

After that, every push to the main branch redeploys.

## Backups

The "⬇ backup" button downloads the whole tree as `data-<timestamp>.json`.
Download one now and then. The Redis database is the only other copy.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Every task across all groups, sortable, with a hide-done toggle |
| `/board/[groupId]` | One group's board, columns per project, rows per priority |
| `/add` | Quick-add form for a single task |
| `/login`, `/logout` | Session |
| `GET /api/data` | The whole tree |
| `GET /api/backup` | The whole tree as a file download |
| `POST /api/groups`, `/api/projects`, `/api/tasks` | Create |
| `PATCH`, `DELETE /api/{groups,projects,tasks}/[id]` | Update, delete |
