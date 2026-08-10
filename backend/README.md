# Boss of the Week — the shared service

A RuneLite plugin only ever sees its own client. A leaderboard across a clan needs somewhere for
everyone's points to meet, and this is it: create a challenge, join it with a code, report what you
killed, read what everyone has.

It is a Cloudflare Worker with a D1 database behind it. At a clan's scale that sits inside the free
tier with room to spare — a hundred people killing a boss all week is a few thousand rows.

## Deploying it

You have to run these; they use your own Cloudflare login and I have no business touching that.

```bash
npm install -g wrangler
wrangler login
```

```bash
cd backend && wrangler d1 create botw
```

That prints a `database_id`. Paste it into `wrangler.toml`, replacing the placeholder, then create the
tables and deploy:

```bash
cd backend && wrangler d1 execute botw --remote --file=./schema.sql
```

```bash
cd backend && wrangler deploy
```

Deployed at **https://botw.marcushill3313.workers.dev** — that is the URL the plugin talks to.

## What it does

| | |
|---|---|
| `POST /v1/challenges` | Create one. Returns the code people join with, and a creator token. |
| `GET /v1/challenges/{code}` | The challenge and its leaderboard. |
| `PATCH /v1/challenges/{code}` | Edit it. Creator token required. |
| `POST /v1/challenges/{code}/join` | Join. Returns a participant token. |
| `POST /v1/challenges/{code}/events` | Report kills and drops. Participant token required. |
| `GET /v1/creators/{rsn}/challenges` | Everything a creator has made, for their list. |

## Two decisions worth knowing about

**Points are worked out here, not in the plugin.** The plugin reports that a Vorki dropped; it does not
get to say a Vorki is worth 500. That does not make this cheat-proof — a modified client can still
claim a drop it never got — but it keeps an honest client's numbers right and closes the obvious hole.
Worth being straight with your clan: this is trust-based, the same as trusting screenshots, just
without the admin work.

**Events are stored one at a time, not as a running total.** It costs a little space and buys three
things: a resend after a disconnect is harmless rather than double-counted, the panel can show where
each point came from, and every score can be recomputed when someone edits a points value mid-week —
which will happen, because someone always sets a number wrong.
