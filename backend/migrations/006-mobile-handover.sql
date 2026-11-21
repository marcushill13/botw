-- A one-way conversion keeps existing RuneLite events and accepts late uploads from before the hop.
CREATE TABLE IF NOT EXISTS mobile_handovers (
    challenge_code TEXT NOT NULL REFERENCES challenges(code) ON DELETE CASCADE,
    rsn TEXT NOT NULL,
    cutoff_at INTEGER NOT NULL,
    PRIMARY KEY (challenge_code, rsn),
    FOREIGN KEY (challenge_code, rsn) REFERENCES participants(challenge_code, rsn) ON DELETE CASCADE
);
