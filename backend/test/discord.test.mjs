import assert from 'node:assert/strict';
import { test } from 'node:test';
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
	assert.match(message.embeds[0].description, /1   A Hero\s+120/);
	assert.match(message.embeds[0].description, /2   everyone\s+35/);
	assert.equal(message.embeds[0].color, 0x9f7839);
	assert.deepEqual(message.allowed_mentions, { parse: [] });
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

test('posts once, edits the same message after a score change, then stays quiet', async () =>
{
	const row = {
		webhook_url: webhook,
		message_id: null,
		last_state: null,
		code: 'ABC234', name: 'Vorkath Week', boss: 'Vorkath', ends_at: 1800000000000
	};
	const env = { DB: { prepare(sql)
	{
		let args;
		return {
			bind(...values) { args = values; return this; },
			async first() { return { ...row }; },
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
		const leaderboard = async () => [{ rsn: 'A Hero', points }];
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(row.message_id, 'message123');
		assert.equal(calls[0].method, 'POST');
		assert.equal(calls[0].url, `${webhook}?wait=true`);
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(calls.length, 1);
		points = 25;
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(calls[1].method, 'PATCH');
		assert.equal(calls[1].url, `${webhook}/messages/message123`);
		await syncDiscordBoard('ABC234', env, leaderboard);
		assert.equal(calls.length, 2);
	}
	finally
	{
		globalThis.fetch = originalFetch;
	}
});
