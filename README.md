# Boss of the Week

Run a clan Boss of the Week competition without the admin.

Someone sets up a challenge, a boss, a week, and what things are worth, and shares a code. Everyone
else pastes the code in. From then on the plugin counts kills and drops by itself and keeps a
leaderboard everyone can see. No screenshots to send, no spreadsheet to maintain, no password to
remember.

## Setting one up

1. Select **Create a challenge**, then **Boss challenge**. Name it and pick the start and end times in your own timezone
2. Search for the boss. Its uniques and its pet fill themselves in, each with a points box and an X if
   you do not want it counted
3. Add anything else by searching for it
4. Say what a kill count is worth "every 10 kills = 1 point", or whatever you like
5. Share the code it gives you

To join any event, select **Join a challenge** and enter its code.

## Weekly events

Select **Create a challenge** on the main screen, then choose the event type. All event types use the same kind of join code,
dates, creator controls, evidence and Discord leaderboard controls.

| Event | Main leaderboard | Extra rankings and prizes |
| --- | --- | --- |
| Boss | Configured kill and drop points | Existing boss rules |
| Raid | Most clears or editable points per mode and per drop | Clears, clears by difficulty, purples, first recorded clear and first drop candidates |
| Skill | XP gained in one selected skill | Levels gained and optional first drop candidates |
| Clue | Opened caskets of one selected tier | Five editable first prize presets per tier, including Ranger boots for Medium |
| Minigame | Completions for the chosen activity | Optional first prize candidates from its reward table |

Raid presets cover Chambers of Xeric, Theatre of Blood, Tombs of Amascut and The Fractured Archive.
Points mode starts at one point per clear and zero per item. Set the actual values for your clan
when creating the event. First prize candidates are separate from rankings unless you explicitly
assign a drop points in raid Points mode. Clan staff still decide which claim qualifies, including
first solo or team clears, and award prizes themselves.

| Minigame | What scores |
| --- | --- |
| Guardians of the Rift | Successful rift closes |
| Vale Totems | One reward roll per 100 offerings rummaged, including banked offerings |
| Volcanic Mine | Runs that pay the Mining XP bonus on exit |
| Hallowed Sepulchre | Each completed floor |
| The Gauntlet / Corrupted Gauntlet | Clears in the selected mode |
| Zalcano | Kills credited to the player |
| Tempoross | Successful rounds |

Participants join the challenge on the character they play and keep RuneLite open with BOTW
enabled. Enable RuneLite's Loot Tracker for chest drops and caskets. XP is counted as the plugin
sees it in game, not imported from Wise Old Man, so mobile or offline progress needs a creator
adjustment. The client cannot verify a clan's no-stacking or first-screenshot rules. Loot or a
named collection log notification can identify a pet; keep screenshots for pets the plugin cannot
identify by name.

## Discord hiscores

The creator can add a webhook for a Discord channel in the BOTW plugin settings, open a challenge,
and select **Post to Discord**. The service posts an original parchment-style Hiscores image with
**Rank / Name / Score** (XP, clears, points, or the activity’s count) and edits the same message when ranks or scores change,
checking about once a minute. The parchment, pixel crest and Discord accent reflect the selected
boss, raid, skill, clue tier or minigame. It keeps working while the creator's RuneLite client is closed.
Use **Discord ranks** to choose how many names appear on the image (1–25, default 25).
If there are more players, the image shows how many are left with “+N more in RuneLite”.
To change the limit after posting, edit the number and click **Update Discord**. The full leaderboard
is available in RuneLite.

The creator can pin the message in the channel. **Remove Discord** stops updates and removes the
message. Keep the webhook URL private; anyone with the URL can post to that channel. The plugin sends
it only to the BOTW service, and participants do not receive it in challenge responses.

See [the staging instructions](backend/README.md#testing-discord-without-updating-the-live-service)
to try it with a separate Worker and database before changing the live service.

## Players who cannot run the plugin

Mobile has no plugins, so those kills can never be counted. They do not have to sit the competition
out: the creator can add someone to the leaderboard by hand and set their points from the screenshots
they send in, the way the clan already does it. Those rows are marked *Manual / Mobile*, so a total
that was typed in is never passed off as one that was counted.

The same edit works on everyone else, for docking points or fixing a mistake. A tracked player's own
kills keep counting underneath it — the change is kept alongside their score rather than replacing
it, so it does not come undone at their next kill.

## What you see

A countdown to the start, which becomes a countdown to the end. The boss, the full points list, and a
leaderboard that keeps itself up to date. Your own points, and what they are made of.

## Pets

Pets are counted, and it does not matter where yours ends up. A pet is the one drop the game never
puts on the floor — it hands it to you directly, so it is not part of the loot and cannot be read like
the rest of it. The plugin reads the message instead, which covers all three endings: following you
home, into your inventory, or straight to the bank because your inventory was full and you already had
one out.

The message says a pet dropped without saying which, so the plugin takes it to be the pet your
challenge counts, and only when a kill of that boss happened within the minute. A Beaver on a Vorkath
week is not Vorki.

Duplicates count. The fiftieth Vorki scores what the first did, the same as a second visage would.

## What this sends, and to whom

The plugin talks to a small service so that everyone in a challenge can see the same leaderboard. A
RuneLite plugin only ever sees its own client, so there is no way to do that locally.

**Sent when you join a challenge, and only for challenges you have joined:**

- your RuneScape name, so the leaderboard has something to call you
- each kill of that challenge's boss, and any of its drops that the challenge counts
- a screenshot of each scoring drop, if you leave that setting on

**Not sent:** anything about accounts, anything from challenges you have not joined, anything at all
before you join one, and any kill of any other monster.

**Screenshots.** A scoring drop is photographed and saved on your own machine, under
`.runelite/botw/screenshots`, in a folder named after the challenge. A downscaled copy is sent to
whoever runs the challenge so they can verify it — this is what the clan would otherwise be asking
you to post in Discord. Only the creator can see them; other participants cannot. The full-size
original never leaves your machine. Both behaviours have their own setting and can be turned off.

**Screenshots are not kept for ever.** The shared copies are deleted a month after a challenge ends,
and deleting a challenge removes them straight away. Results are kept — an old leaderboard can still
be looked up — so it is only the pictures that expire, and the creator can export them as a zip at
any point before then.

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
