import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardImage } from '../src/board-image.js';
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
	assert.equal(message.embeds[0].color, 0x9f7839);
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
		assert.deepEqual(calls.map(call => call.method), ['POST', 'PATCH', 'GET', 'PATCH', 'GET']);
	}
	finally
	{
		globalThis.fetch = originalFetch;
	}
});
