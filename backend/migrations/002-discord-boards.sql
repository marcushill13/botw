CREATE TABLE IF NOT EXISTS discord_boards (
	challenge_code TEXT PRIMARY KEY REFERENCES challenges(code) ON DELETE CASCADE,
	webhook_url    TEXT NOT NULL,
	message_id     TEXT,
	last_state     TEXT
);
