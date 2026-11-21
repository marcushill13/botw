import { optionsOf, typeOf } from './weekly.js';

export const MOBILE_INTERVAL = 10 * 60 * 1000;
const LAST_CHECK_WINDOW = 60000;
const normalise = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const MINIGAMES = {
	'Guardians of the Rift': 'Rifts closed', 'The Gauntlet': 'The Gauntlet',
	'Corrupted Gauntlet': 'The Corrupted Gauntlet', 'Zalcano': 'Zalcano',
	'Tempoross': 'Tempoross', 'Wintertodt': 'Wintertodt'
};
const RAIDS = {
	'Chambers of Xeric': { Normal: 'Chambers of Xeric', Challenge: 'Chambers of Xeric: Challenge Mode' },
	'Theatre of Blood': { Normal: 'Theatre of Blood', Hard: 'Theatre of Blood: Hard Mode' },
	'Tombs of Amascut': { Normal: 'Tombs of Amascut', Expert: 'Tombs of Amascut: Expert Mode' },
	'The Fractured Archive': { Normal: 'The Fractured Archive' }
};
const BOSS_ALIASES = { Barrows: 'Barrows Chests', 'The Nightmare': 'Nightmare' };

export function mobileSupport(challenge)
{
	if (typeOf(challenge) === 'MINIGAME' && !MINIGAMES[challenge.boss])
		return 'This minigame has no supported Hiscores counter. Use RuneLite or ask the creator to enter your score.';
	if (typeOf(challenge) === 'RAID' && !RAIDS[challenge.boss]) return 'This raid is not supported by mobile tracking.';
	return null;
}

/** Use names, never array positions: Jagex can insert new metrics anywhere in the list. */
export function mobileSnapshot(challenge, data)
{
	if (!Array.isArray(data?.skills) || !Array.isArray(data?.activities)) throw new Error('Hiscores returned unreadable stats.');
	const values = {};
	const read = (key, rows, name, field) =>
	{
		const row = rows.find(row => normalise(row.name) === normalise(name));
		if (Number.isSafeInteger(row?.[field]) && row[field] >= 0) values[key] = row[field];
		return row;
	};
	const type = typeOf(challenge);
	if (type === 'SKILL')
	{
		const name = challenge.boss === 'Runecrafting' ? 'Runecraft' : challenge.boss;
		const row = read('xp', data.skills, name, 'xp');
		if (values.xp !== undefined && Number.isInteger(row.level) && row.level >= 1) values.level = row.level;
	}
	else if (type === 'RAID')
	{
		for (const [mode, name] of Object.entries(RAIDS[challenge.boss] ?? {})) read(mode, data.activities, name, 'score');
	}
	else
	{
		const name = type === 'CLUE' ? `Clue Scrolls (${challenge.boss})`
			: type === 'MINIGAME' ? MINIGAMES[challenge.boss] : BOSS_ALIASES[challenge.boss] ?? challenge.boss;
		read('kc', data.activities, name, 'score');
	}
	// Unknown (-1) is not zero. Otherwise the first visible total would award a lifetime of progress.
	if (!Object.keys(values).length || (type === 'SKILL' && values.level === undefined))
		throw new Error('No usable Hiscores counter for this activity yet. Log out or hop worlds, then try again. You can also ask the creator to enter your score manually.');
	return values;
}

export async function fetchMobileSnapshot(challenge, rsn, fetcher = fetch)
{
	const url = new URL('https://secure.runescape.com/m=hiscore_oldschool/index_lite.json');
	url.searchParams.set('player', rsn);
	const response = await fetcher(url.href, {
		redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' }
	});
	if (!response.ok) throw new Error(response.status === 404 ? 'Player not found on the OSRS Hiscores.' : 'OSRS Hiscores are unavailable. Your previous score has been kept.');
	return mobileSnapshot(challenge, await response.json());
}

/** Missing/new counters get their own baseline; decreases never subtract or re-award gains. */
export function advanceSnapshot(baseline, latest, incoming)
{
	const base = { ...baseline };
	const high = { ...latest };
	for (const [key, value] of Object.entries(incoming))
	{
		if (base[key] === undefined) base[key] = value;
		high[key] = Math.max(high[key] ?? value, value);
	}
	return { baseline: base, latest: high };
}

export function mobileTotals(challenge, row)
{
	const total = { points: 0, kills: 0, levels: 0, raidModes: {} };
	if (!row?.baseline) return total;
	const baseline = JSON.parse(row.baseline);
	const latest = JSON.parse(row.latest);
	const gain = key => Math.max(0, (latest[key] ?? baseline[key] ?? 0) - (baseline[key] ?? latest[key] ?? 0));
	switch (typeOf(challenge))
	{
		case 'SKILL': total.points = gain('xp'); total.levels = gain('level'); break;
		case 'RAID':
			for (const mode of Object.keys(RAIDS[challenge.boss] ?? {}))
			{
				const count = gain(mode);
				total.raidModes[mode] = count;
				total.kills += count;
				const options = optionsOf(challenge);
				total.points += count * (options.raidByPoints ? options.raidPoints?.[mode] ?? 1 : 1);
			}
			break;
		default:
			total.kills = gain('kc');
			total.points = typeOf(challenge) === 'BOSS'
				? Math.trunc(total.kills / challenge.kc_per) * challenge.kc_points : total.kills;
	}
	return total;
}

export function nextMobileCheck(challenge, now)
{
	return Math.max(now + 60000, Math.min(now + MOBILE_INTERVAL, challenge.ends_at - LAST_CHECK_WINDOW));
}

/** A bounded queue shares the existing minute cron. It does not need another Cron Trigger. */
export async function syncMobilePlayers(env, refreshTotals, now = Date.now(), fetcher = fetch)
{
	const due = await env.DB.prepare(
		`SELECT m.*, c.* FROM mobile_tracking m JOIN challenges c ON c.code = m.challenge_code
		 WHERE m.next_check <= ? AND c.starts_at <= ? AND c.ends_at >= ?
		 ORDER BY m.next_check LIMIT 20`).bind(now, now, now).all();
	for (const row of due.results ?? [])
	{
		// Lease prevents two cron invocations applying an older response over a newer one.
		const lease = await env.DB.prepare(
			`UPDATE mobile_tracking SET next_check = ?
			 WHERE challenge_code = ? AND rsn = ? AND next_check = ?`)
			.bind(now + 5 * 60000, row.code, row.rsn, row.next_check).run();
		if (lease.meta?.changes !== 1) continue;
		try
		{
			const incoming = await fetchMobileSnapshot(row, row.rsn, fetcher);
			// Never import a Hiscores response collected after the event deadline.
			const checkedAt = Date.now();
			if (checkedAt > row.ends_at) continue;
			const { baseline, latest } = advanceSnapshot(JSON.parse(row.baseline ?? '{}'), JSON.parse(row.latest ?? '{}'), incoming);
			await env.DB.prepare(
				`UPDATE mobile_tracking SET baseline = ?, latest = ?, last_checked = ?, next_check = ?, status = ?
				 WHERE challenge_code = ? AND rsn = ? AND next_check = ?`)
				.bind(JSON.stringify(baseline), JSON.stringify(latest), checkedAt, nextMobileCheck(row, checkedAt),
					'Hiscores checked. Log out or hop worlds to publish new progress.', row.code, row.rsn, now + 5 * 60000).run();
			await refreshTotals(row.code, row.rsn, env, row);
		}
		catch
		{
			await env.DB.prepare(
				`UPDATE mobile_tracking SET next_check = ?, status = ?
				 WHERE challenge_code = ? AND rsn = ? AND next_check = ?`)
				.bind(nextMobileCheck(row, now), 'Hiscores unavailable or counter missing. Previous score kept; retrying.',
					row.code, row.rsn, now + 5 * 60000).run();
		}
	}
}
