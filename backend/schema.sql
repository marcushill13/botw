-- Boss of the Week storage.
--
-- Events are kept individually rather than as a running total per player. It costs a little more
-- space and buys three things: the "where did my points come from" breakdown the panel shows, an
-- idempotent resubmit (the plugin can send the same kill twice after a disconnect without it
-- counting twice), and the ability to recompute every score if a challenge's points are edited
-- mid-week — which will happen, because someone always sets a number wrong.

CREATE TABLE IF NOT EXISTS challenges (
	code           TEXT PRIMARY KEY,
	name           TEXT NOT NULL,
	boss           TEXT NOT NULL,

	-- Epoch milliseconds. The timezone is stored alongside only so the panel can show the creator
	-- the wall-clock time they chose; every comparison is done in UTC.
	starts_at      INTEGER NOT NULL,
	ends_at        INTEGER NOT NULL,
	timezone       TEXT NOT NULL,

	-- How many kills earn kc_points. Both sides are the creator's choice.
	kc_per         INTEGER NOT NULL,
	kc_points      INTEGER NOT NULL,

	-- The drop list, as JSON: [{ "name": "Vorki", "itemId": 21992, "points": 20 }]
	drops          TEXT NOT NULL,

	-- Proves whoever is editing is the person who made it. Never sent to participants.
	creator_token  TEXT NOT NULL,
	creator_rsn    TEXT NOT NULL,

	created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
	challenge_code TEXT NOT NULL REFERENCES challenges(code) ON DELETE CASCADE,
	rsn            TEXT NOT NULL,
	token          TEXT NOT NULL,
	joined_at      INTEGER NOT NULL,

	-- Running totals, kept alongside the events rather than derived from them on every read.
	--
	-- The leaderboard is the most-read thing here and summing the event table to build it means
	-- reading every kill anyone has logged, every time anyone looks. A week of fifty people at a
	-- thousand kills is fifty thousand rows per glance, which burns through a day's read allowance in
	-- an afternoon. These three columns make that read cost one row per participant instead.
	--
	-- The events remain the source of truth: these are rebuilt from them whenever points change.
	points         INTEGER NOT NULL DEFAULT 0,
	kills          INTEGER NOT NULL DEFAULT 0,
	drops          INTEGER NOT NULL DEFAULT 0,

	PRIMARY KEY (challenge_code, rsn)
);

CREATE TABLE IF NOT EXISTS events (
	-- Made by the plugin, so a resend after a disconnect lands on the same row rather than a second
	-- one. This is the whole idempotency story.
	id             TEXT PRIMARY KEY,

	challenge_code TEXT NOT NULL REFERENCES challenges(code) ON DELETE CASCADE,
	rsn            TEXT NOT NULL,

	-- 'kc' or 'drop'.
	kind           TEXT NOT NULL,

	-- Null for a kill count event.
	item_name      TEXT,

	-- Kills for a 'kc' event, quantity for a 'drop'.
	amount         INTEGER NOT NULL,

	-- Worked out here from the challenge's own configuration, never taken from the client. The plugin
	-- reports what happened; what it is worth is not its decision.
	points         INTEGER NOT NULL,

	occurred_at    INTEGER NOT NULL,
	recorded_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS events_by_challenge ON events (challenge_code, rsn);
CREATE INDEX IF NOT EXISTS challenges_by_creator ON challenges (creator_rsn);

-- Evidence.
--
-- The clan already verifies drops with screenshots sent to Discord, so the same pictures are kept
-- here instead — organised by challenge and by player, and gathered without anyone having to remember
-- to press a key at the moment a pet drops.
--
-- Stored as a downscaled JPEG inline rather than in object storage. A scoring drop is a rare event —
-- a unique or a pet, not every kill — so a week of a fifty-person clan is a few hundred images at
-- around two hundred kilobytes. That fits here comfortably and saves running a second service.
--
-- Two hundred rather than the forty it began at, because at forty the game's own writing could not be
-- read, and reading it is the whole point: a clan spots a faked drop by the drop message that is not
-- there, or by a script's text sitting where the mouse tooltip belongs.
--
-- The full-resolution original never leaves the player's machine; this is the readable copy.
CREATE TABLE IF NOT EXISTS shots (
	-- The event it belongs to, so an upload that is retried replaces rather than duplicates.
	event_id       TEXT PRIMARY KEY,

	challenge_code TEXT NOT NULL REFERENCES challenges(code) ON DELETE CASCADE,
	rsn            TEXT NOT NULL,
	item_name      TEXT NOT NULL,
	occurred_at    INTEGER NOT NULL,
	uploaded_at    INTEGER NOT NULL,

	-- base64 JPEG.
	image          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS shots_by_challenge ON shots (challenge_code, rsn);
