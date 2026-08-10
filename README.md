# Boss of the Week

Run a clan Boss of the Week competition without the admin.

Someone sets up a challenge, a boss, a week, and what things are worth, and shares a code. Everyone
else pastes the code in. From then on the plugin counts kills and drops by itself and keeps a
leaderboard everyone can see. No screenshots to send, no spreadsheet to maintain, no password to
remember.

## Setting one up

1. **Create a challenge**, name it, and pick the start and end times in your own timezone
2. Search for the boss. Its uniques and its pet fill themselves in, each with a points box and an X if
   you do not want it counted
3. Add anything else by searching for it
4. Say what a kill count is worth "every 10 kills = 1 point", or whatever you like
5. Share the code it gives you

Joining is that code and a button.

## What you see

A countdown to the start, which becomes a countdown to the end. The boss, the full points list, and a
leaderboard that keeps itself up to date. Your own points, and what they are made of.

## What this sends, and to whom

The plugin talks to a small service so that everyone in a challenge can see the same leaderboard. A
RuneLite plugin only ever sees its own client, so there is no way to do that locally.

**Sent when you join a challenge, and only for challenges you have joined:**

- your RuneScape name, so the leaderboard has something to call you
- each kill of that challenge's boss, and any of its drops that the challenge counts
- a screenshot of each scoring drop, if you leave that setting on

**Not sent:** anything about accounts, anything from challenges you have not joined, anything at all
before you join one, and any kill of any other monster.

**Screenshots.** A scoring drop is photographed and saved to your own screenshots folder, under the
challenge's name. A downscaled copy is sent to whoever runs the challenge so they can verify it,
this is what the clan would otherwise be asking you to post in Discord. Only the creator can see them;
other participants cannot. The full-size original never leaves your machine. Both behaviours have
their own setting and can be turned off.

**Points are worked out on the server**, not here. The plugin reports that a pet dropped; what a pet
is worth is the challenge's business.

The service is a Cloudflare Worker, and its source is in `backend/` in this repository. A clan that
would rather run its own can deploy it and change the address in the plugin's settings.

## Honest about cheating

This is trust based, in the same way that screenshots posted to Discord are trust based.

RuneLite works out what a monster dropped by watching for items appearing as it dies, which cannot
tell your loot from something you dropped at that moment. That affects the Loot Tracker too. 

The screenshots make it visible, a faked drop has no drop message and no collection log entry anmd will be shown in a screenshot.

It is not proof. It is the same evidence a clan already asks for, gathered automatically and organised
by challenge and by player.

## Data

Boss drop tables come from the [OSRS Wiki](https://oldschool.runescape.wiki), used under CC BY-NC-SA
3.0. They are read at build time by `scripts/generate-boss-drops.mjs` and bundled, so the plugin never
calls the wiki while it is running.
