import { typeOf } from './weekly.js';

export function firstKeys(challenge)
{
	return new Set([
		...(typeOf(challenge) === 'RAID' ? ['clear', 'purple'] : []),
		...JSON.parse(challenge.drops).filter(rule => rule.firstPrize).map(rule => 'drop:' + rule.name.toLowerCase())
	]);
}

export async function firstOverrides(code, env)
{
	const rows = await env.DB.prepare('SELECT prize_key, rsn FROM first_prize_overrides WHERE challenge_code = ?')
		.bind(code).all();
	return Object.fromEntries((rows.results ?? []).map(row => [row.prize_key, row.rsn]));
}

async function applyFirstOverrides(challenge, candidates, env)
{
	const overrides = await firstOverrides(challenge.code, env);
	let result = candidates;
	for (const [key, rsn] of Object.entries(overrides))
	{
		if (!firstKeys(challenge).has(key)) continue;
		result = result.filter(row => key.startsWith('drop:')
			? ('drop:' + row.itemName.toLowerCase() !== key || ['clear', 'purple'].includes(row.category)) : row.category !== key);
		result.push({ category: key.startsWith('drop:') ? 'drop' : key,
			itemName: key.startsWith('drop:') ? key.slice(5) : 'Manual claim', rsn, occurredAt: 0, manual: true });
	}
	return result;
}

export async function prizeCandidates(challenge, env)
{
	const rules = JSON.parse(challenge.drops).filter(rule => rule.firstPrize);
	const candidates = [];
	if (typeOf(challenge) === 'RAID')
	{
		const clear = await env.DB.prepare(
			`SELECT 'clear' AS category, item_name AS itemName, rsn, occurred_at AS occurredAt
			   FROM events WHERE challenge_code = ? AND kind IN ('raid', 'claim_raid')
			  ORDER BY occurred_at, recorded_at, id LIMIT 1`).bind(challenge.code).first();
		if (clear) candidates.push(clear);
	}
	if (typeOf(challenge) === 'RAID')
	{
		const purples = JSON.parse(challenge.drops).filter(rule => rule.purple).map(rule => rule.name);
		const purple = await env.DB.prepare(
			`SELECT 'purple' AS category, item_name AS itemName, rsn, occurred_at AS occurredAt
			 FROM events WHERE challenge_code = ? AND kind IN ('drop', 'claim_drop')
			 AND item_name COLLATE NOCASE IN (SELECT value FROM json_each(?))
			 ORDER BY occurred_at, recorded_at, id LIMIT 1`)
			.bind(challenge.code, JSON.stringify(purples)).first();
		if (purple) candidates.push(purple);
	}
	if (!rules.length) return applyFirstOverrides(challenge, candidates, env);
	const rows = await env.DB.prepare(
		`WITH prizes AS (
		  SELECT item_name AS itemName, rsn, occurred_at AS occurredAt,
		         ROW_NUMBER() OVER (
		           PARTITION BY item_name COLLATE NOCASE
		           ORDER BY occurred_at, recorded_at, id
		         ) AS position
		    FROM events WHERE challenge_code = ? AND kind IN ('drop', 'claim_drop')
		     AND item_name COLLATE NOCASE IN (SELECT value FROM json_each(?))
		)
		SELECT itemName, rsn, occurredAt FROM prizes WHERE position = 1 ORDER BY occurredAt`)
		.bind(challenge.code, JSON.stringify(rules.map(rule => rule.name))).all();
	return applyFirstOverrides(challenge, candidates.concat(rows.results ?? []), env);
}


/** The same first-prize results used by the RuneLite panel, including creator overrides. */
export function firstPrizeRows(challenge, candidates = [])
{
 const drops = typeof challenge.drops === 'string' ? JSON.parse(challenge.drops) : challenge.drops ?? [];
 const rules = [
  ...(typeOf(challenge) === 'RAID' ? [
   { key: 'clear', name: 'First clear' },
   { key: 'purple', name: 'First purple', itemId: drops.find(rule => rule.purple)?.itemId }
  ] : []),
  ...drops.filter(rule => rule.firstPrize).map(rule => ({ ...rule, key: 'drop:' + rule.name.toLowerCase() }))
 ];
 return rules.map(rule => {
  const winner = candidates.find(row => rule.key.startsWith('drop:')
   ? !['clear', 'purple'].includes(row.category) && row.itemName?.toLowerCase() === rule.name.toLowerCase()
   : row.category === rule.key);
  return { key: rule.key, name: rule.name, itemId: rule.itemId ?? null, prize: rule.prize ?? '', rsn: winner?.rsn || null };
 });
}
