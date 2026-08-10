/**
 * Builds the bundled boss list with each boss's unique drops.
 *
 * The create screen has to offer a boss and pre-fill its uniques without the player typing them out,
 * so that list has to come from somewhere. Nothing publishes it directly:
 *
 *   - osrsbox-db has the right shape but has been unmaintained for years. It is missing Vorkath,
 *     Cerberus, the Alchemical Hydra and Nex, which rules it out for a plugin about killing bosses.
 *   - The wiki has no Cargo or Ask endpoint exposed.
 *
 * What the wiki does have is the drop tables themselves, written as {{DropsLine}} templates in the
 * page source. Those are parseable, complete and current, so this reads them at build time and bundles
 * the result. Nothing hits the wiki while the plugin is running.
 *
 * "Unique" is a judgement the wiki does not make for us, so it is inferred: anything rarer than
 * 1/RARITY_FLOOR, minus the shared rare drop table, which is the same handful of gems on every boss
 * and has nothing to do with the boss itself. The list is editable in the plugin anyway — the point is
 * to save typing, not to be the final word.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIKI = 'https://oldschool.runescape.wiki/api.php';

/** Politeness, and the wiki asks for a contactable agent. */
const USER_AGENT = 'BotW RuneLite plugin data generator (github.com/marcushill13/botw)';

/** A drop rarer than one in this many is treated as a unique. */
const RARITY_FLOOR = 200;

/**
 * A drop shared by more bosses than this is not a unique. Godsword shards are dropped by all four God
 * Wars generals and are genuinely their uniques, so the line has to sit above four.
 */
const SHARED_BY_AT_MOST = 6;

/** The shared table every boss rolls. Its contents say nothing about which boss you killed. */
const SHARED_SECTIONS = ['rare drop table', 'gem drop table', 'universal', 'tertiary drops'];

const OUT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'..', 'src', 'main', 'resources', 'com', 'botw', 'boss-drops.json');

async function wikitextOf(page)
{
	const url = `${WIKI}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json`;
	const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

	if (!response.ok)
	{
		throw new Error(`${page}: HTTP ${response.status}`);
	}

	const body = await response.json();
	if (body.error)
	{
		return null;
	}

	return body.parse?.wikitext?.['*'] ?? null;
}

/**
 * One in how many? Returns null for anything that is not a plain fraction — "Always", "Varies" and
 * the like are not uniques and should not be guessed at.
 */
function oneIn(rarity)
{
	const cleaned = rarity.trim().toLowerCase();
	if (!cleaned.includes('/'))
	{
		return null;
	}

	const [numerator, denominator] = cleaned.split('/');
	const top = Number.parseFloat(numerator.replace(/[^0-9.]/g, ''));
	const bottom = Number.parseFloat(denominator.replace(/[^0-9.]/g, ''));

	if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= 0)
	{
		return null;
	}

	return bottom / top;
}

/**
 * Pulls the {{DropsLine}} templates out of one line of wikitext.
 *
 * Written with a brace counter rather than a regex because these templates nest. A rarity footnote is
 * itself a template with its own name field, and a regex that stops at the first closing brace reads
 * that inner name as the item's — which is how the magma mutagen came out of here called "muta".
 */
function dropsLinesIn(line)
{
	const found = [];
	const marker = '{{DropsLine|';

	for (let start = line.indexOf(marker); start !== -1; start = line.indexOf(marker, start + 1))
	{
		let depth = 0;
		let end = -1;

		for (let i = start; i < line.length - 1; i++)
		{
			if (line.startsWith('{{', i))
			{
				depth++;
				i++;
			}
			else if (line.startsWith('}}', i))
			{
				depth--;
				i++;

				if (depth === 0)
				{
					end = i + 1;
					break;
				}
			}
		}

		if (end === -1)
		{
			continue;
		}

		found.push(fieldsOf(line.slice(start + marker.length, end - 2)));
	}

	return found;
}

/**
 * Splits template arguments on the pipes that belong to this template, ignoring any inside a nested
 * one. First value wins, so a footnote cannot overwrite a field the template already set.
 */
function fieldsOf(body)
{
	const fields = {};
	let depth = 0;
	let current = '';

	for (let i = 0; i < body.length; i++)
	{
		if (body.startsWith('{{', i))
		{
			depth++;
			current += '{{';
			i++;
			continue;
		}

		if (body.startsWith('}}', i))
		{
			depth--;
			current += '}}';
			i++;
			continue;
		}

		if (body[i] === '|' && depth === 0)
		{
			addField(fields, current);
			current = '';
			continue;
		}

		current += body[i];
	}

	addField(fields, current);
	return fields;
}

function addField(fields, part)
{
	const split = part.indexOf('=');
	if (split === -1)
	{
		return;
	}

	const key = part.slice(0, split).trim().toLowerCase();
	if (key && !(key in fields))
	{
		fields[key] = part.slice(split + 1).trim();
	}
}

function parseDrops(wikitext)
{
	const drops = [];
	let section = '';

	const lines = wikitext.split('\n');
	for (const line of lines)
	{
		const heading = line.match(/^=+\s*([^=]+?)\s*=+\s*$/);
		if (heading)
		{
			section = heading[1].trim();
			continue;
		}

		for (const fields of dropsLinesIn(line))
		{
			if (!fields.name || !fields.rarity)
			{
				continue;
			}

			drops.push({ name: fields.name, rarity: fields.rarity, section });
		}
	}

	return drops;
}

function uniquesOf(drops)
{
	const seen = new Set();
	const uniques = [];

	for (const drop of drops)
	{
		if (SHARED_SECTIONS.some((shared) => drop.section.toLowerCase().includes(shared)))
		{
			continue;
		}

		const denominator = oneIn(drop.rarity);
		if (denominator === null || denominator < RARITY_FLOOR)
		{
			continue;
		}

		// The same item can be listed once per drop version; the player only wants to see it once.
		if (seen.has(drop.name))
		{
			continue;
		}

		seen.add(drop.name);
		uniques.push({ name: drop.name, rarity: drop.rarity, oneIn: Math.round(denominator) });
	}

	return uniques;
}

async function main()
{
	const bosses = JSON.parse(
		await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'bosses.json'), 'utf8'));

	const out = [];
	let withoutUniques = 0;

	for (const boss of bosses)
	{
		process.stdout.write(`  ${boss}\r`);

		let wikitext;
		try
		{
			wikitext = await wikitextOf(boss);
		}
		catch (error)
		{
			console.warn(`\n  ${boss}: ${error.message}`);
			continue;
		}

		if (!wikitext)
		{
			console.warn(`\n  ${boss}: no wiki page`);
			continue;
		}

		const uniques = uniquesOf(parseDrops(wikitext));
		if (uniques.length === 0)
		{
			withoutUniques++;
		}

		out.push({ name: boss, uniques });

		// The wiki is a volunteer-run service; do not hammer it.
		await new Promise((resolve) => setTimeout(resolve, 150));
	}

	// An item that half the bosses in the game drop is not that boss's unique, whatever its rarity.
	// Counting across the whole set catches coins, bolt tips and uncut gems without a hand-written
	// blocklist that would go stale the moment a boss is released.
	const droppedBy = new Map();
	for (const boss of out)
	{
		for (const unique of boss.uniques)
		{
			droppedBy.set(unique.name, (droppedBy.get(unique.name) ?? 0) + 1);
		}
	}

	let culled = 0;
	for (const boss of out)
	{
		const before = boss.uniques.length;
		boss.uniques = boss.uniques.filter((unique) => droppedBy.get(unique.name) <= SHARED_BY_AT_MOST);
		culled += before - boss.uniques.length;
	}

	await fs.mkdir(path.dirname(OUT), { recursive: true });
	await fs.writeFile(OUT, JSON.stringify({
		dataVersion: 1,
		source: 'https://oldschool.runescape.wiki',
		attribution: 'Drop data from the OSRS Wiki, CC BY-NC-SA 3.0',
		generatedAt: new Date().toISOString(),
		bosses: out
	}, null, '\t') + '\n');

	console.log(`\nWrote ${out.length} bosses (${withoutUniques} with no uniques found) to ${OUT}`);
}

main().catch((error) =>
{
	console.error(error);
	process.exit(1);
});
