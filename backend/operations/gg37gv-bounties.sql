-- One-off prize labels for the existing Tempoross event. Safe to run again.
-- Changes only prize labels inside drops; does not change points, participants or first winners.
UPDATE challenges
SET drops = (
  SELECT json_group_array(json(
    CASE lower(json_extract(value, '$.name'))
      WHEN 'big harpoonfish' THEN json_set(value, '$.prize', '5M')
      WHEN 'tome of water (empty)' THEN json_set(value, '$.prize', '5M')
      WHEN 'tiny tempor' THEN json_set(value, '$.prize', '10M')
      ELSE value
    END
  )) FROM json_each(challenges.drops)
)
WHERE code = 'GG37GV' AND boss = 'Tempoross';

SELECT json_extract(value, '$.name') AS item, json_extract(value, '$.prize') AS prize
FROM challenges, json_each(challenges.drops)
WHERE code = 'GG37GV';
