import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { boardImage } from '../src/board-image.js';
import { boardArtwork } from '../src/board-icons.js';
import { boardTheme } from '../src/board-themes.js';
import { validateWeekly } from '../src/weekly.js';
import { connectDiscord, hiscores, syncDiscordBoard, validWebhookUrl } from '../src/discord.js';

const webhook = 'https://discord.com/api/webhooks/12345/test_token';

test('accepts only Discord webhook URLs, never an arbitrary host or redirect target', () =>
{
	assert.equal(validWebhookUrl(webhook), webhook);
	for (const url of [
		'http://discord.com/api/webhooks/12345/test_token',
		'https://discord.com.evil.example/api/webhooks/12345/test_token',
		'https://discord.com/api/webhooks/12345/test_token?url=https://example.com',
		'https://discord.com/api/webhooks/12345/test_token/extra'
	])
	{
		assert.equal(validWebhookUrl(url), null);
	}
});

test('renders readable OSRS ranks without pinging Discord users', () =>
{
	const { message } = hiscores(
		{ name: 'Vorkath Week', boss: 'Vorkath', code: 'ABC234', ends_at: 1800000000000 },
		[{ rsn: 'A Hero', points: 120 }, { rsn: '@everyone', points: 35 }],
		1700000000000);
	assert.equal(message.embeds[0].image.url, 'attachment://hiscores.png');
	assert.equal(message.embeds[0].color, 0x487faf);
	assert.deepEqual(message.allowed_mentions, { parse: [] });
});

test('renders a valid parchment PNG with the current scores', async () =>
{
	const image = await boardImage(
		{ name: 'Vorkath Week', boss: 'Vorkath', code: 'ABC234' },
		[{ rsn: 'A Hero', points: 120 }, { rsn: 'Clan Mate', points: 35 }]);
	assert.deepEqual([...image.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
	assert.ok(image.length > 1000);
});

function decodeBoard(image)
{
	const view = new DataView(image.buffer, image.byteOffset, image.length);
	const width = view.getUint32(16);
	const height = view.getUint32(20);
	let palette;
	const data = [];
	for (let pos = 8; pos < image.length;)
	{
		const size = view.getUint32(pos);
		const kind = Buffer.from(image.subarray(pos + 4, pos + 8)).toString();
		const bytes = image.subarray(pos + 8, pos + 8 + size);
		if (kind === 'PLTE') palette = bytes;
		if (kind === 'IDAT') data.push(bytes);
		pos += size + 12;
	}
	const pixels = inflateSync(Buffer.concat(data));
	const indexAt = (x, y) => pixels[y * (width + 1) + x + 1];
	return {
		height,
		colourAt(x, y)
		{
			const offset = indexAt(x, y) * 3;
			return palette[offset] << 16 | palette[offset + 1] << 8 | palette[offset + 2];
		},
		indices(x, y, wide, tall)
		{
			return Array.from({ length: wide * tall }, (_, i) => indexAt(x + i % wide, y + Math.floor(i / wide)));
		},
		spriteColours(x, y, wide, tall, basePaletteSize)
		{
			return new Set(this.indices(x, y, wide, tall).filter(index => index >= basePaletteSize)
				.map(index => palette[index * 3] << 16 | palette[index * 3 + 1] << 8 | palette[index * 3 + 2]));
		}
	};
}

test('renders the original sprite colours and Discord accent without changing scores', () =>
{
	const leaderboard = [{ rsn: 'A Hero', points: 1234567 }];
	const base = { name: 'Clan week', code: 'ABC234', ends_at: 1800000000000 };
	const ice = { ...base, boss: 'Vorkath' };
	const clue = { ...base, boss: 'Medium', event_type: 'CLUE' };
	const mage = { ...base, boss: 'Magic', event_type: 'SKILL' };
	const mine = { ...base, boss: 'Volcanic Mine', event_type: 'MINIGAME' };
	const rendered = [ice, clue, mage, mine].map(event =>
	{
		const png = decodeBoard(boardImage(event, leaderboard));
		const { state, message } = hiscores(event, leaderboard);
		assert.equal(message.embeds[0].color, png.colourAt(41, 175));
		assert.deepEqual(JSON.parse(state).rows, [['A Hero', 1234567]]);
		assert.deepEqual(png.spriteColours(198, 66, 44, 44, 19),
			new Set(boardArtwork(event).colours.map(([r, g, b]) => r << 16 | g << 8 | b)));
		assert.match(message.embeds[0].footer.text, /© Jagex/);
		return png;
	});
	assert.equal(new Set(rendered.map(png => png.colourAt(41, 175))).size, rendered.length);
	assert.equal(new Set(rendered.map(png => png.indices(202, 70, 36, 36).join())).size, rendered.length);
	assert.notDeepEqual(rendered[0].indices(110, 72, 16, 34), rendered[1].indices(110, 72, 16, 34));
	assert.deepEqual(rendered[0].indices(117, 206, 72, 14), rendered[1].indices(117, 206, 72, 14));
});

test('covers the full challenge catalogue and has a stable fallback for future bosses', () =>
{
	const { bosses } = JSON.parse(readFileSync(new URL('../../src/main/resources/com/botw/boss-drops.json', import.meta.url)));
	const targets = {
		BOSS: bosses.map(boss => boss.name),
		RAID: ['Chambers of Xeric', 'Theatre of Blood', 'Tombs of Amascut', 'The Fractured Archive'],
		CLUE: ['Beginner', 'Easy', 'Medium', 'Hard', 'Elite', 'Master'],
		SKILL: 'Attack Defence Strength Hitpoints Ranged Prayer Magic Cooking Woodcutting Fletching Fishing Firemaking Crafting Smithing Mining Herblore Agility Thieving Slayer Farming Runecraft Hunter Construction Sailing'.split(' '),
		MINIGAME: ['Guardians of the Rift', 'Vale Totems', 'Volcanic Mine', 'Hallowed Sepulchre',
			'The Gauntlet', 'Corrupted Gauntlet', 'Zalcano', 'Tempoross']
	};
	const combatIcon = boardArtwork({ boss: 'A future boss' });
	for (const [eventType, names] of Object.entries(targets))
	{
		const styles = names.map(boss =>
		{
			assert.equal(validateWeekly({ boss, eventType }), null);
			const challenge = { boss, event_type: eventType };
			const theme = boardTheme(challenge);
			// Unknown names use the boss fallback regardless of their category.
			assert.notDeepEqual(theme, { ...boardTheme({ boss, event_type: 'unknown' }), clue: eventType === 'CLUE' }, boss);
			assert.deepEqual(boardTheme({ ...challenge, boss: boss.toUpperCase() }), theme);
			const sprite = boardArtwork(challenge);
			assert.notDeepEqual(sprite, combatIcon, boss);
			assert.equal(sprite.runs.reduce((length, run) => length + (run >>> 6) + 1, 0),
				sprite.width * sprite.height, boss);
			assert.ok(sprite.runs.every(run => (run & 63) <= sprite.colours.length), boss);
			return theme.colour;
		});
		assert.equal(new Set(styles).size, names.length, eventType);
	}
	assert.deepEqual(boardTheme({ boss: ' New Boss ' }), boardTheme({ boss: 'new boss' }));
});

test('keeps one embed when there are more players than the Discord rank limit', () =>
{
	const leaderboard = Array.from({ length: 27 }, (_, i) => ({ rsn: `Player ${i + 1}`, points: 100 - i }));
	const { message } = hiscores(
		{ name: 'Vorkath Week', boss: 'Vorkath', code: 'ABC234', ends_at: 1800000000000 },
		leaderboard);
	assert.equal(message.embeds.length, 1);
});

test('reports Discord status without exposing the webhook token', async () =>
{
	const env = { DB: { prepare(sql)
	{
		return { bind() { return this; }, first: async () =>
			sql.includes('creator_token') ? { creator_token: 'creator' } : null };
	} } };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => ({ ok: false, status: 403 });
	try
	{
		const result = await connectDiscord('ABC234', webhook, 'creator', env, async () => []);
		assert.equal(result.status, 400);
		assert.match(result.error, /HTTP 403/);
		assert.doesNotMatch(result.error, /test_token/);
	}
	finally
	{
		globalThis.fetch = originalFetch;
	}
});

test('uses Worker-supported manual redirects and rejects a redirect response', async () =>
{
	const env = { DB: { prepare(sql)
	{
		return { bind() { return this; }, first: async () =>
			sql.includes('creator_token') ? { creator_token: 'creator' } : null };
	} } };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (url, options) =>
	{
		assert.equal(options.redirect, 'manual');
		return { ok: false, status: 302 };
	};
	try
	{
		const result = await connectDiscord('ABC234', webhook, 'creator', env, async () => []);
		assert.equal(result.status, 400);
		assert.match(result.error, /HTTP 302/);
	}
	finally
	{
		globalThis.fetch = originalFetch;
	}
});

test('posts once and updates the same message when the score or rank limit changes', async () =>
{
	const row = {
		webhook_url: webhook,
		message_id: null,
		last_state: null,
		rank_limit: 25,
		code: 'ABC234', name: 'Vorkath Week', boss: 'Vorkath', ends_at: 1800000000000
	};
	const env = { DB: { prepare(sql)
	{
		let args;
		return {
			bind(...values) { args = values; return this; },
			async first() { return { ...row, creator_token: 'creator' }; },
			async run()
			{
				if (sql.includes('message_id IS NULL'))
				{
					if (row.message_id !== null) return { meta: { changes: 0 } };
					row.message_id = args[0];
				}
				else if (sql.includes('SET message_id = ?, last_state'))
				{
					[row.message_id, row.last_state] = args;
				}
				else if (sql.includes('SET last_state')) row.last_state = args[0];
				else if (sql.includes('SET rank_limit')) row.rank_limit = args[0];
				return { meta: { changes: 1 } };
			}
		};
	} } };
	let points = 10;
	const calls = [];
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (url, options) =>
	{
		calls.push({ url, ...options });
		return { ok: true, json: async () => ({ id: 'message123' }) };
	};
	try
	{
		const leaderboard = async () => Array.from({ length: 29 }, (_, i) =>
			({ rsn: `Player ${i + 1}`, points: i === 0 ? points : 0 }));
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(row.message_id, 'message123');
		assert.equal(calls[0].method, 'POST');
		assert.equal(calls[0].url, `${webhook}?wait=true`);
		assert.ok(calls[0].body instanceof FormData);
		assert.equal(JSON.parse(calls[0].body.get('payload_json')).attachments[0].filename, 'hiscores.png');
		assert.ok(calls[0].body.get('files[0]').size > 1000);
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(calls.length, 1);
		points = 25;
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(calls[1].method, 'PATCH');
		assert.equal(calls[1].url, `${webhook}/messages/message123`);
		assert.equal(JSON.parse(calls[1].body.get('payload_json')).attachments[0].id, 0);
		assert.notDeepEqual(
			new Uint8Array(await calls[0].body.get('files[0]').arrayBuffer()),
			new Uint8Array(await calls[1].body.get('files[0]').arrayBuffer()));
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(calls.length, 2);

		const invalid = await connectDiscord('ABC234', undefined, 'creator', env, leaderboard, 26);
		assert.equal(invalid.status, 400);
		assert.equal(row.rank_limit, 25);
		const denied = await connectDiscord('ABC234', undefined, 'not-creator', env, leaderboard, 20);
		assert.equal(denied.status, 403);
		assert.equal(calls.length, 2);

		const update = await connectDiscord('ABC234', undefined, 'creator', env, leaderboard, 20);
		assert.equal(update.status, 200);
		assert.equal(row.rank_limit, 20);
		assert.equal(row.message_id, 'message123');
		assert.equal(calls[2].method, 'GET');
		assert.equal(calls[3].method, 'PATCH');
		assert.equal(calls[3].url, `${webhook}/messages/message123`);
		const payload = JSON.parse(calls[3].body.get('payload_json'));
		assert.equal(payload.embeds.length, 1);
		const before = new DataView(await calls[1].body.get('files[0]').arrayBuffer());
		const after = new DataView(await calls[3].body.get('files[0]').arrayBuffer());
		// PNG height is at byte 20. The scroll is five rows shorter, 21px per row.
		assert.equal(before.getUint32(20) - after.getUint32(20), 5 * 21);

		const legacy = await connectDiscord('ABC234', webhook, 'creator', env, leaderboard);
		assert.equal(legacy.status, 200);
		assert.equal(row.rank_limit, 20);
		row.last_state = JSON.stringify({ ...JSON.parse(row.last_state), style: 4 });
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(calls.at(-1).url, `${webhook}/messages/message123`);
		assert.deepEqual(calls.map(call => call.method), ['POST', 'PATCH', 'GET', 'PATCH', 'GET', 'PATCH']);
	}
	finally
	{
		globalThis.fetch = originalFetch;
	}
});
