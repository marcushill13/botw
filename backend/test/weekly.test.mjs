import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../src/index.js';
import { hiscores } from '../src/discord.js';
import { presentation } from '../src/weekly.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/004-weekly-challenges.sql', import.meta.url), 'utf8');

function service(db = new DatabaseSync(':memory:'))
{
	db.exec(schema);
	const DB = {
		prepare(sql)
		{
			const statement = db.prepare(sql);
			return { bind: (...args) => ({
				first: async () => statement.get(...args) ?? null,
				all: async () => ({ results: statement.all(...args) }),
				run: async () => ({ meta: statement.run(...args) })
			}) };
		},
		batch: async statements => Promise.all(statements.map(statement => statement.run()))
	};
	const now = Date.now();
	async function request(method, path, body, headers = {})
	{
		const endpoint = method === 'POST' && !path && body?.eventType ? 'weekly-challenges' : 'challenges';
		const response = await worker.fetch(new Request('https://botw.test/v1/' + endpoint + path, {
			method, headers, body: body ? JSON.stringify(body) : undefined
		}), { DB });
		return { status: response.status, ...await response.json() };
	}
	async function create(target, type, options = {})
	{
		const challenge = await request('POST', '', {
			name: 'Clan event', boss: target, eventType: type, creatorRsn: 'Host',
			startsAt: now - 1000, endsAt: now + 3600000, kcPer: 2, kcPoints: 5, drops: [], ...options
		});
		assert.equal(challenge.status, 201);
		return challenge;
	}
	async function player(code, rsn)
	{
		const joined = await request('POST', '/' + code + '/join', { rsn });
		assert.equal(joined.status, 200);
		return events => request('POST', '/' + code + '/events', { events }, {
			'X-Participant-Token': joined.participantToken
		});
	}
	const event = (id, kind, amount, itemName, occurredAt = now) => ({ id, kind, amount, itemName, occurredAt });
	return { now, event, create, player, request, board: code => request('GET', '/' + code) };
}

test('skill scores count XP once and keep level gains and verified-by-staff prizes separate', async () =>
{
	const app = service();
	const { code, creatorToken } = await app.create('Slayer', 'SKILL', {
		drops: [{ name: 'Imbued heart', points: 500, firstPrize: true }]
	});
	const alice = await app.player(code, 'Alice');
	const bob = await app.player(code, 'Bob');
	const xp = app.event('xp1', 'xp', 10000, 'Slayer');
	assert.equal((await alice([xp, app.event('l1', 'level', 2, 'Slayer'),
		app.event('wrong', 'xp', 99999, 'Smithing'),
		app.event('early', 'xp', 99999, 'Slayer', app.now - 5000)])).accepted, 2);
	await alice([xp]);
	const adjustment = await app.request('PATCH', '/' + code + '/participants/Alice', { points: 10500 },
		{ 'X-Creator-Token': creatorToken });
	assert.equal(adjustment.status, 200);
	await alice([app.event('xp-after-edit', 'xp', 100, 'Slayer')]);
	await bob([app.event('xp2', 'xp', 20000, 'Slayer'), app.event('p2', 'drop', 1, 'Imbued heart', app.now + 1)]);
	await alice([app.event('p1', 'drop', 1, 'Imbued heart')]);
	const board = await app.board(code);
	assert.deepEqual(board.leaderboard.map(row => [row.rsn, row.points, row.levels]),
		[['Bob', 20000, 0], ['Alice', 10600, 2]]);
	assert.equal(board.challenge.prizeCandidates[0].rsn, 'Alice');
	const edit = await app.request('PATCH', '/' + code, { boss: 'Smithing' }, { 'X-Creator-Token': creatorToken });
	assert.equal(edit.status, 400);
});

test('raid weights distinguish modes and only marked purples count toward the purple board', async () =>
{
	const app = service();
	const { code, creatorToken } = await app.create('Tombs of Amascut', 'RAID', {
		raidByPoints: true, raidPoints: { Normal: 2, Expert: 5 },
		drops: [{ name: 'Lightbearer', points: 3, purple: true, firstPrize: true },
			{ name: "Tumeken's guardian", points: 10, firstPrize: true }]
	});
	const send = await app.player(code, 'Raider');
	await send([app.event('r1', 'raid', 1, 'Expert'), app.event('r2', 'raid', 1, 'Normal'),
		app.event('r3', 'raid', 1, 'Hard'), app.event('r4', 'drop', 1, 'Lightbearer'),
		app.event('r5', 'drop', 1, "Tumeken's guardian")]);
	const raidBoard = await app.board(code);
	assert.equal(raidBoard.challenge.prizeCandidates.find(row => row.category === 'clear').itemName, 'Expert');
	let row = raidBoard.leaderboard[0];
	assert.equal(row.points, 20);
	assert.equal(row.kills, 2);
	assert.deepEqual(row.raidModes, { Expert: 1, Normal: 1 });
	assert.equal(row.purples, 1);
	const update = await app.request('PATCH', '/' + code, { raidByPoints: false }, { 'X-Creator-Token': creatorToken });
	assert.equal(update.status, 200);
	row = (await app.board(code)).leaderboard[0];
	assert.equal(row.points, 2);
	assert.equal(row.purples, 1);
	const display = hiscores({ boss: 'Tombs of Amascut', event_type: 'RAID', ends_at: app.now }, [row]);
	assert.match(display.message.embeds[0].title, /RAID OF THE WEEK/);
	assert.equal(display.message.embeds.length, 1);
});

test('clues and minigames rank by completions while old boss rules still apply', async () =>
{
	const app = service();
	for (const [target, type] of [['Medium', 'CLUE'], ['Guardians of the Rift', 'MINIGAME'], ['Zulrah', undefined]])
	{
		const { code } = await app.create(target, type, {
			drops: [{ name: 'Bonus item', points: 4, firstPrize: true }]
		});
		const send = await app.player(code, 'Member');
		await send([app.event(target + '1', 'kc', 3), app.event(target + '2', 'drop', 1, 'Bonus item')]);
		const board = await app.board(code);
		assert.equal(board.leaderboard[0].points, type ? 3 : 9);
		assert.equal(board.leaderboard[0].kills, 3);
	}
});

test('migration adds weekly columns while keeping existing boss participants and ranks', () =>
{
	const db = new DatabaseSync(':memory:');
	const previous = schema
		.replace(/,\n\tevent_type[^\n]+\n\tevent_options[^\n]+/, '')
		.replace(/\n\tlevels[^\n]+\n\tpurples[^\n]+\n\traid_modes[^\n]+/, '')
		.replace(/CREATE INDEX IF NOT EXISTS events_by_prize[\s\S]*?CREATE INDEX IF NOT EXISTS events_by_challenge/,
			'CREATE INDEX IF NOT EXISTS events_by_challenge');
	db.exec(previous);
	db.exec("INSERT INTO challenges VALUES ('ABC234','Boss week','Zulrah',0,10000,'UTC',10,1,'[]','owner','Host',0);");
	db.exec("INSERT INTO participants (challenge_code, rsn, token, joined_at, points) VALUES ('ABC234','Member','player',1,77);");
	db.exec("INSERT INTO discord_boards (challenge_code, webhook_url, message_id, rank_limit) VALUES ('ABC234','test','message123',20);");
	db.exec(migration);
	assert.equal(db.prepare('SELECT event_type FROM challenges').get().event_type, 'BOSS');
	assert.equal(db.prepare('SELECT points FROM participants').get().points, 77);
	assert.equal(db.prepare('SELECT message_id FROM discord_boards').get().message_id, 'message123');
	assert.equal(db.prepare('SELECT rank_limit FROM discord_boards').get().rank_limit, 20);
});

test('new minigames use their own leaderboard units and track prizes separately from scores', async () =>
{
	const app = service();
	for (const [target, unit] of [
		['Vale Totems', 'ROLLS'], ['Volcanic Mine', 'RUNS'], ['Hallowed Sepulchre', 'FLOORS'],
		['The Gauntlet', 'CLEARS'], ['Corrupted Gauntlet', 'CLEARS'], ['Zalcano', 'KILLS'], ['Tempoross', 'WINS'], ['Wintertodt', 'WINS']
	])
	{
		const { code } = await app.create(target, 'MINIGAME', {
			drops: [{ name: 'Prize item', points: 10, firstPrize: true }]
		});
		const send = await app.player(code, 'Competitor');
		const score = app.event(target + '-run', 'kc', 3);
		assert.equal((await send([score, app.event(target + '-prize', 'drop', 1, 'Prize item')])).accepted, 2);
		await send([score]);
		const { challenge, leaderboard } = await app.board(code);
		assert.equal(leaderboard[0].points, 3);
		assert.equal(challenge.prizeCandidates[0].itemName, 'Prize item');
		assert.equal(presentation({ event_type: 'MINIGAME', boss: challenge.boss }).score, unit);
	}
});
