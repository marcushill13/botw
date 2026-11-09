ALTER TABLE challenges ADD COLUMN event_type TEXT NOT NULL DEFAULT 'BOSS';
ALTER TABLE challenges ADD COLUMN event_options TEXT NOT NULL DEFAULT '{}';
ALTER TABLE participants ADD COLUMN levels INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN purples INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN raid_modes TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS events_by_prize
	ON events (challenge_code, kind, item_name COLLATE NOCASE, occurred_at, recorded_at);

-- XP arrives frequently. Apply an XP batch once when its unique event ID is inserted.
-- A retry is ignored by the INSERT, so the trigger cannot pay the same XP twice.
CREATE TRIGGER IF NOT EXISTS weekly_xp_totals AFTER INSERT ON events
WHEN NEW.kind IN ('xp', 'level')
BEGIN
	UPDATE participants SET
		points = points + CASE WHEN NEW.kind = 'xp' THEN NEW.points ELSE 0 END,
		levels = levels + CASE WHEN NEW.kind = 'level' THEN NEW.amount ELSE 0 END
	WHERE challenge_code = NEW.challenge_code AND rsn = NEW.rsn;
END;
