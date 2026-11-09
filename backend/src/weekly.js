const RAID_MODES = {
	'Chambers of Xeric': ['Normal', 'Challenge'],
	'Theatre of Blood': ['Entry', 'Normal', 'Hard'],
	'Tombs of Amascut': ['Entry', 'Normal', 'Expert'],
	'The Fractured Archive': ['Normal']
};
const SKILLS = new Set(('Attack Defence Strength Hitpoints Ranged Prayer Magic Cooking Woodcutting '
	+ 'Fletching Fishing Firemaking Crafting Smithing Mining Herblore Agility Thieving Slayer Farming '
	+ 'Runecraft Hunter Construction Sailing').split(' '));

export function typeOf(challenge)
{
	return challenge.event_type ?? 'BOSS';
}

export function optionsOf(challenge)
{
	return JSON.parse(challenge.event_options ?? '{}');
}

export function validateWeekly(body)
{
	const type = body.eventType ?? 'BOSS';
	const target = String(body.boss ?? '').trim();
	if (type === 'BOSS') return null;
	if (type === 'SKILL') return SKILLS.has(target) ? null : 'Choose a skill';
	if (type === 'CLUE')
	{
		return ['Beginner', 'Easy', 'Medium', 'Hard', 'Elite', 'Master'].includes(target) ? null : 'Choose a clue tier';
	}
	if (type === 'MINIGAME') return target === 'Guardians of the Rift' ? null : 'Choose a supported minigame';
	if (type !== 'RAID' || !Object.hasOwn(RAID_MODES, target)) return 'Choose a supported raid';
	if (body.raidByPoints !== undefined && typeof body.raidByPoints !== 'boolean') return 'Choose a raid ranking';
	const weights = body.raidPoints ?? {};
	if (typeof weights !== 'object' || Array.isArray(weights)
		|| Object.entries(weights).some(([mode, points]) => !RAID_MODES[target].includes(mode)
			|| !Number.isInteger(points) || points < 0 || points > 10000))
	{
		return 'Raid mode points must be whole numbers from 0 to 10000';
	}
	return null;
}

export function weeklyOptions(body)
{
	return body.eventType === 'RAID'
		? { raidByPoints: body.raidByPoints === true, raidPoints: body.raidPoints ?? {} } : {};
}

/** Null means this event does not belong on the challenge. */
export function eventPoints(event, challenge, drops)
{
	const type = typeOf(challenge);
	const amount = event.amount;
	const name = String(event.itemName ?? '');
	if (!Number.isSafeInteger(amount) || amount < 1) return null;
	switch (event.kind)
	{
		case 'kc':
			return ['BOSS', 'CLUE', 'MINIGAME'].includes(type) && amount <= 1000 ? 0 : null;
		case 'xp':
			return type === 'SKILL' && name === challenge.boss && amount <= 200000000 ? amount : null;
		case 'level':
			return type === 'SKILL' && name === challenge.boss && amount <= 98 ? 0 : null;
		case 'raid':
		{
			if (type !== 'RAID' || !RAID_MODES[challenge.boss]?.includes(name) || amount !== 1) return null;
			const options = optionsOf(challenge);
			return options.raidByPoints ? options.raidPoints?.[name] ?? 1 : 1;
		}
		case 'drop':
		{
			const rule = drops.find(row => row.name.toLowerCase() === name.toLowerCase());
			if (!rule || amount > 2147483647) return null;
			if (type === 'BOSS' || (type === 'RAID' && optionsOf(challenge).raidByPoints))
			{
				return rule.points * amount;
			}
			return 0;
		}
		default:
			return null;
	}
}

export function presentation(challenge)
{
	switch (typeOf(challenge))
	{
		case 'RAID': return { title: 'RAID OF THE WEEK', target: 'Raid', score: optionsOf(challenge).raidByPoints ? 'POINTS' : 'CLEARS' };
		case 'SKILL': return { title: 'SKILL OF THE WEEK', target: 'Skill', score: 'XP' };
		case 'CLUE': return { title: 'CLUE OF THE WEEK', target: 'Tier', score: 'CLUES' };
		case 'MINIGAME': return { title: 'MINIGAME OF THE WEEK', target: 'Minigame', score: 'RIFTS' };
		default: return { title: 'BOSS OF THE WEEK', target: 'Boss', score: 'POINTS' };
	}
}
