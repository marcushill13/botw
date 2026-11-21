-- Additive and safe to run again. Existing participants, events and Discord posts stay in place.
CREATE TABLE IF NOT EXISTS mobile_tracking (
    challenge_code TEXT NOT NULL REFERENCES challenges(code) ON DELETE CASCADE,
    rsn TEXT NOT NULL,
    baseline TEXT,
    latest TEXT,
    last_checked INTEGER,
    next_check INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Waiting for the challenge to start.',
    PRIMARY KEY (challenge_code, rsn),
    FOREIGN KEY (challenge_code, rsn) REFERENCES participants(challenge_code, rsn) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS mobile_tracking_due ON mobile_tracking(next_check);

-- An empty winner explicitly marks a prize unclaimed; deleting the override restores auto tracking.
CREATE TABLE IF NOT EXISTS first_prize_overrides (
    challenge_code TEXT NOT NULL REFERENCES challenges(code) ON DELETE CASCADE,
    prize_key TEXT NOT NULL,
    rsn TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (challenge_code, prize_key)
);
