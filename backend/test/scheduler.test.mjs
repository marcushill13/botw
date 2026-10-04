import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';

function scheduleAt(hour, minute)
{
	const statements = [];
	const pending = [];
	const env = { DB: { prepare(sql)
	{
		statements.push(sql);
		return {
			bind() { return this; },
			all: async () => ({ results: [] }),
			run: async () => ({ meta: { changes: 0 } })
		};
	} } };
	const event = { cron: '* * * * *', scheduledTime: Date.UTC(2026, 9, 4, hour, minute) };
	const ctx = { waitUntil(promise) { pending.push(promise); } };
	return worker.scheduled(event, env, ctx).then(async () =>
	{
		await Promise.all(pending);
		return statements;
	});
}

test('one minute trigger syncs Discord and prunes screenshots only on the 04:00 UTC tick', async () =>
{
	const before = await scheduleAt(3, 59);
	const cleanup = await scheduleAt(4, 0);
	const after = await scheduleAt(4, 1);
	assert.ok(before.some(sql => sql.includes('discord_boards')));
	assert.ok(cleanup.some(sql => sql.includes('discord_boards')));
	assert.ok(after.some(sql => sql.includes('discord_boards')));
	assert.equal(before.some(sql => sql.includes('DELETE FROM shots')), false);
	assert.equal(cleanup.filter(sql => sql.includes('DELETE FROM shots')).length, 1);
	assert.equal(after.some(sql => sql.includes('DELETE FROM shots')), false);
});
