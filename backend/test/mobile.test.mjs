import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../src/index.js';
import { MOBILE_INTERVAL, advanceSnapshot, mobileSnapshot, mobileSupport, mobileTotals, syncMobilePlayers } from '../src/mobile.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/005-mobile-and-firsts.sql', import.meta.url), 'utf8');
const stats = (name, score, xp = null, level = 70) => ({ skills: xp === null ? [] : [{ name, xp, level }],
	activities: xp === null ? [{ name, score }] : [] });
function app()
{
	const db = new DatabaseSync(':memory:');
	db.exec(schema);
	const DB = { prepare(sql) {
		const statement = db.prepare(sql);
		return { bind: (...args) => ({ first: async () => statement.get(...args) ?? null,
			all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: statement.run(...args) }) }) };
	}, batch: async statements => {
		db.exec('BEGIN');
		try { const result = await Promise.all(statements.map(s => s.run())); db.exec('COMMIT'); return result; }
		catch (error) { db.exec('ROLLBACK'); throw error; }
	} };
	const env = { DB };
	const now = Date.now();
	async function request(method, suffix, body, headers = {})
	{
		const response = await worker.fetch(new Request('https://test/v1/challenges' + suffix, {
			method, headers, body: body === undefined ? undefined : JSON.stringify(body)
		}), env);
		return { status: response.status, ...await response.json() };
	}
	async function create(type = 'MINIGAME', boss = 'Tempoross', extra = {})
	{
		return request('POST', '', { name: 'Test', boss, eventType: type, creatorRsn: 'Host', startsAt: now - 1000,
			endsAt: now + 3600000, kcPer: 10, kcPoints: 3,
			drops: [{ name: 'Tiny tempor', firstPrize: true, points: 0 }], ...extra });
	}
	async function tick(data, time = now + MOBILE_INTERVAL)
	{
		const original = globalThis.fetch;
		globalThis.fetch = async url => {
			assert.match(String(url), /^https:\/\/secure.runescape.com\/m=hiscore_oldschool\/index_lite.json\?player=/);
			if (data instanceof Error) throw data;
			return Response.json(data);
		};
		try
		{
			const pending = [];
			// Worker uses wall clock for due selection; advance the test's clock for this cron tick.
			const dateNow = Date.now;
			Date.now = () => time;
			try { await worker.scheduled({ cron: '* * * * *', scheduledTime: time }, env, { waitUntil: p => pending.push(p) }); await Promise.all(pending); }
			finally { Date.now = dateNow; }
		}
		finally { globalThis.fetch = original; }
	}
	async function join(code, data, rsn = 'Mobile')
	{
		const original = globalThis.fetch;
		globalThis.fetch = async () => Response.json(data);
		try { return await request('POST', '/' + code + '/mobile-join', { rsn }); }
		finally { globalThis.fetch = original; }
	}
	return { db, env, now, request, create, tick, join, board: code => request('GET', '/' + code) };
}

test('supported Hiscores map by name, including zero, every clue tier and skill aliases', () =>
{
	for (const boss of ['Tempoross', 'Wintertodt', 'Zalcano', 'The Gauntlet', 'Corrupted Gauntlet', 'Guardians of the Rift'])
	{
		const name = boss === 'Corrupted Gauntlet' ? 'The Corrupted Gauntlet' : boss === 'Guardians of the Rift' ? 'Rifts closed' : boss;
		assert.deepEqual(mobileSnapshot({ event_type: 'MINIGAME', boss }, stats(name, 0)), { kc: 0 });
	}
	for (const boss of ['Beginner', 'Easy', 'Medium', 'Hard', 'Elite', 'Master'])
		assert.deepEqual(mobileSnapshot({ event_type: 'CLUE', boss }, stats(`Clue Scrolls (${boss.toLowerCase()})`, 20)), { kc: 20 });
	for (const boss of ['Runecraft', 'Runecrafting'])
		assert.deepEqual(mobileSnapshot({ event_type: 'SKILL', boss }, stats('Runecraft', null, 500, 10)), { xp: 500, level: 10 });
	assert.throws(() => mobileSnapshot({ boss: 'Tempoross' }, stats('Tempoross', -1)), /No usable/);
	assert.throws(() => mobileSnapshot({ boss: 'Tempoross' }, { skills: [] }), /unreadable/);
	for (const boss of ['Vale Totems', 'Volcanic Mine', 'Hallowed Sepulchre'])
		assert.match(mobileSupport({ event_type: 'MINIGAME', boss }), /no supported/);
});

test('mobile wins refresh every ten minutes, never count permits or RuneLite reports, and preserve manual points', async () =>
{
	const a = app();
	const { code, creatorToken } = await a.create();
	const join = await a.join(code, stats('Tempoross', 150));
	assert.equal(join.status, 200);
	assert.equal(join.mobilePlayer, true);
	assert.equal(a.db.prepare('SELECT next_check FROM mobile_tracking').get().next_check >= a.now + MOBILE_INTERVAL, true);
	assert.equal((await a.board(code)).leaderboard[0].points, 0);
	await a.tick(stats('Tempoross', 178), a.now + MOBILE_INTERVAL - 1);
	assert.equal((await a.board(code)).leaderboard[0].points, 0);
	await a.tick(stats('Tempoross', 178), a.now + MOBILE_INTERVAL + 1000);
	let row = (await a.board(code)).leaderboard[0];
	assert.equal(row.points, 28);
	assert.equal(row.kills, 28);
	const submission = await a.request('POST', '/' + code + '/events', {
		events: [{ id: 'duplicate-client-kc', kind: 'kc', amount: 28, occurredAt: a.now }]
	}, { 'X-Participant-Token': join.participantToken });
	assert.equal(submission.accepted, 0);
	await a.request('PATCH', '/' + code + '/participants/Mobile', { points: 33 }, { 'X-Creator-Token': creatorToken });
	await a.tick(stats('Tempoross', 180), a.now + MOBILE_INTERVAL * 2 + 2000);
	row = (await a.board(code)).leaderboard[0];
	assert.equal(row.points, 35);
	assert.equal(row.adjustment, 5);
	await a.tick(new Error('offline'), a.now + MOBILE_INTERVAL * 3 + 3000);
	assert.equal((await a.board(code)).leaderboard[0].points, 35);
	await a.tick(stats('Tempoross', 179), a.now + MOBILE_INTERVAL * 4 + 4000);
	assert.equal((await a.board(code)).leaderboard[0].points, 35);
	const rejoin = await a.request('POST', '/' + code + '/join', { rsn: 'mobile' });
	assert.equal(rejoin.participantToken, join.participantToken);
	assert.equal(rejoin.mobilePlayer, true);
	assert.equal((await a.board(code)).leaderboard.length, 1);
	await a.tick(stats('Tempoross', 1000), a.now + 3600001);
	assert.equal((await a.board(code)).leaderboard[0].points, 35);
});

test('future joins baseline at start, do not count pre-event gains, and freeze the dates', async () =>
{
	const a = app();
	const { code, creatorToken } = await a.create('MINIGAME', 'Wintertodt', { startsAt: a.now + 60000 });
	assert.equal((await a.join(code, stats('Wintertodt', 50))).status, 200);
	await a.tick(stats('Wintertodt', 60), a.now + 59000);
	assert.equal(a.db.prepare('SELECT baseline FROM mobile_tracking').get().baseline, null);
	await a.tick(stats('Wintertodt', 60), a.now + 60000);
	assert.equal((await a.board(code)).leaderboard[0].points, 0);
	await a.tick(stats('Wintertodt', 65), a.now + 60000 + MOBILE_INTERVAL);
	assert.equal((await a.board(code)).leaderboard[0].points, 5);
	const edit = await a.request('PATCH', '/' + code, { startsAt: a.now }, { 'X-Creator-Token': creatorToken });
	assert.equal(edit.status, 409);
});

test('XP, levels, boss point rules and mode-weighted raids use gains, not lifetime totals', async () =>
{
	const a = app();
	const skill = await a.create('SKILL', 'Slayer');
	await a.join(skill.code, stats('Slayer', null, 1000000, 70));
	await a.tick(stats('Slayer', null, 1025000, 71), a.now + MOBILE_INTERVAL + 1000);
	let row = (await a.board(skill.code)).leaderboard[0];
	assert.equal(row.points, 25000); assert.equal(row.levels, 1);
	const boss = await a.create('BOSS', 'Zulrah');
	await a.join(boss.code, stats('Zulrah', 100));
	await a.tick(stats('Zulrah', 124), a.now + MOBILE_INTERVAL + 1000);
	row = (await a.board(boss.code)).leaderboard[0];
	assert.equal(row.kills, 24); assert.equal(row.points, 6);
	await a.request('PATCH', '/' + boss.code, { kcPoints: 5 }, { 'X-Creator-Token': boss.creatorToken });
	assert.equal((await a.board(boss.code)).leaderboard[0].points, 10);
	const raid = await a.create('RAID', 'Tombs of Amascut', { raidByPoints: true, raidPoints: { Normal: 2, Expert: 5 } });
	const raidStats = (normal, expert) => ({ skills: [], activities: [
		{ name: 'Tombs of Amascut', score: normal }, { name: 'Tombs of Amascut: Expert Mode', score: expert }] });
	await a.join(raid.code, raidStats(100, 20));
	await a.tick(raidStats(102, 23), a.now + MOBILE_INTERVAL + 1000);
	row = (await a.board(raid.code)).leaderboard[0];
	assert.equal(row.points, 19); assert.equal(row.kills, 5); assert.deepEqual(row.raidModes, { Normal: 2, Expert: 3 });
	await a.request('PATCH', '/' + raid.code, { raidByPoints: false }, { 'X-Creator-Token': raid.creatorToken });
	assert.equal((await a.board(raid.code)).leaderboard[0].points, 5);
});

test('missing counters establish a baseline when first visible, and lower snapshots cannot award twice', () =>
{
	let state = advanceSnapshot({ Normal: 100 }, { Normal: 101 }, { Normal: 99, Expert: 3 });
	assert.deepEqual(state, { baseline: { Normal: 100, Expert: 3 }, latest: { Normal: 101, Expert: 3 } });
	state = advanceSnapshot(state.baseline, state.latest, { Normal: 102, Expert: 4 });
	const total = mobileTotals({ event_type: 'RAID', boss: 'Tombs of Amascut' }, {
		baseline: JSON.stringify(state.baseline), latest: JSON.stringify(state.latest) });
	assert.equal(total.kills, 3);
});

test('mobile rejects unsupported activities, missing baselines and changing an existing tracking mode', async () =>
{
	const a = app();
	const unsupported = await a.create('MINIGAME', 'Vale Totems');
	assert.equal((await a.join(unsupported.code, stats('Vale Totems', 20))).status, 400);
	const { code } = await a.create();
	assert.equal((await a.join(code, stats('Tempoross', -1))).status, 503);
	assert.equal((await a.board(code)).leaderboard.length, 0);
	await a.request('POST', '/' + code + '/join', { rsn: 'Desktop' });
	assert.equal((await a.join(code, stats('Tempoross', 20), 'Desktop')).status, 409);
});

test('creators can override firsts, mark unclaimed and restore automatic results without changing scores', async () =>
{
	const a = app();
	const { code, creatorToken } = await a.create();
	const desktop = await a.request('POST', '/' + code + '/join', { rsn: 'Desktop' });
	await a.request('POST', '/' + code + '/events', { events: [
		{ id: 'pet', kind: 'drop', itemName: 'Tiny tempor', amount: 1, occurredAt: a.now }
	] }, { 'X-Participant-Token': desktop.participantToken });
	const set = (winners, token = creatorToken) => a.request('PUT', '/' + code + '/firsts', { winners }, { 'X-Creator-Token': token });
	assert.equal((await set({ 'drop:tiny tempor': 'Mobile' }, 'bad-token')).status, 403);
	assert.equal((await set({ 'drop:fake item': 'Mobile' })).status, 400);
	assert.equal((await set({ 'drop:tiny tempor': 'Too long a player name' })).status, 400);
	let result = await set({ 'drop:tiny tempor': 'Mobile' });
	assert.equal(result.challenge.prizeCandidates[0].rsn, 'Mobile');
	assert.equal(result.challenge.prizeCandidates[0].manual, true);
	assert.equal(result.leaderboard[0].points, 0);
	result = await set({ 'drop:tiny tempor': '' });
	assert.equal(result.challenge.prizeCandidates[0].rsn, '');
	result = await set({ 'drop:tiny tempor': null });
	assert.equal(result.challenge.prizeCandidates[0].rsn, 'Desktop');
	assert.deepEqual(result.challenge.firstPrizeOverrides, {});
	const raid = await a.create('RAID', 'Tombs of Amascut');
	result = await a.request('PUT', '/' + raid.code + '/firsts', { winners: { clear: 'Mobile', purple: 'Desktop' } },
		{ 'X-Creator-Token': raid.creatorToken });
	assert.equal(result.challenge.prizeCandidates.find(p => p.category === 'clear').rsn, 'Mobile');
	assert.equal(result.challenge.prizeCandidates.find(p => p.category === 'purple').rsn, 'Desktop');
});

test('migration is repeatable and keeps existing scores and Discord message IDs', () =>
{
	const a = app();
	a.db.exec("INSERT INTO challenges (code,name,boss,starts_at,ends_at,timezone,kc_per,kc_points,drops,creator_token,creator_rsn,created_at) VALUES ('ABC123','Live','Zulrah',0,10000,'UTC',10,1,'[]','secret','Host',0)");
	a.db.exec("INSERT INTO participants (challenge_code,rsn,token,joined_at,points) VALUES ('ABC123','Player','token',0,75)");
	a.db.exec("INSERT INTO discord_boards (challenge_code,webhook_url,message_id) VALUES ('ABC123','secret','original')");
	a.db.exec(migration); a.db.exec(migration);
	assert.equal(a.db.prepare('SELECT points FROM participants').get().points, 75);
	assert.equal(a.db.prepare('SELECT message_id FROM discord_boards').get().message_id, 'original');
});


test('mobile RuneLite firsts and evidence never award points, including after rescoring and rejoining', async () =>
{
	const a = app();
	const rules = [
		{ name: 'Tiny tempor', firstPrize: true, pointsEnabled: true, points: 50 },
		{ name: 'Tome of water (empty)', pointsEnabled: true, points: 5 }
	];
	const { code, creatorToken } = await a.create('MINIGAME', 'Tempoross', { drops: rules });
	const join = await a.join(code, stats('Tempoross', 150));
	const headers = { 'X-Participant-Token': join.participantToken };
	const send = events => a.request('POST', '/' + code + '/events', { events }, headers);
	const pet = { id: 'mobile-live-pet', kind: 'drop', itemName: 'Tiny tempor', amount: 1, occurredAt: a.now };
	const result = await send([pet,
		{ id: 'mobile-live-wins', kind: 'kc', amount: 3, occurredAt: a.now },
		{ id: 'mobile-nonfirst-drop', kind: 'drop', itemName: 'Tome of water (empty)', amount: 1, occurredAt: a.now },
		{ id: 'mobile-forged-claim', kind: 'claim_drop', itemName: 'Tiny tempor', amount: 1, occurredAt: a.now }
	]);
	assert.equal(result.accepted, 1);
	await send([pet]);
	const shot = await a.request('POST', '/' + code + '/shots', {
		eventId: pet.id, itemName: pet.itemName, occurredAt: a.now, image: 'screenshot-test'
	}, headers);
	assert.equal(shot.status, 200);
	assert.equal(a.db.prepare('SELECT kind, points FROM events').get().kind, 'claim_drop');
	assert.equal(a.db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
	assert.equal(a.db.prepare('SELECT COUNT(*) AS count FROM shots').get().count, 1);
	let board = await a.board(code);
	assert.equal(board.challenge.prizeCandidates[0].rsn, 'Mobile');
	assert.equal(board.leaderboard[0].points, 0);
	assert.equal(board.leaderboard[0].kills, 0);
	await a.tick(stats('Tempoross', 153), a.now + MOBILE_INTERVAL + 1000);
	assert.equal((await a.board(code)).leaderboard[0].points, 3);
	// Unticking by rejoining, then ticking again, must keep the token and original 150 baseline.
	for (const suffix of ['join', 'mobile-join'])
	{
		const rejoin = await a.request('POST', '/' + code + '/' + suffix, { rsn: 'Mobile' });
		assert.equal(rejoin.participantToken, join.participantToken);
		assert.equal(rejoin.mobilePlayer, true);
	}
	await a.request('PATCH', '/' + code, { drops: rules.map(rule => ({ ...rule, points: 100 })) },
		{ 'X-Creator-Token': creatorToken });
	await a.tick(stats('Tempoross', 154), a.now + MOBILE_INTERVAL * 2 + 2000);
	board = await a.board(code);
	assert.equal(board.leaderboard[0].points, 4);
	assert.equal(board.challenge.prizeCandidates[0].rsn, 'Mobile');
	assert.equal(a.db.prepare('SELECT points FROM events').get().points, 0);
});

test('mobile raid first clear and first purple are unscored and survive rule changes', async () =>
{
	const a = app();
	const drops = [{ name: 'Lightbearer', purple: true, points: 20 }];
	const { code, creatorToken } = await a.create('RAID', 'Tombs of Amascut', {
		drops, raidByPoints: true, raidPoints: { Normal: 2, Expert: 5 }
	});
	const initial = { skills: [], activities: [{ name: 'Tombs of Amascut', score: 100 },
		{ name: 'Tombs of Amascut: Expert Mode', score: 20 }] };
	const join = await a.join(code, initial);
	await a.request('POST', '/' + code + '/events', { events: [
		{ id: 'mobile-clear', kind: 'raid', itemName: 'Expert', amount: 1, occurredAt: a.now },
		{ id: 'mobile-purple', kind: 'drop', itemName: 'Lightbearer', amount: 1, occurredAt: a.now }
	] }, { 'X-Participant-Token': join.participantToken });
	let board = await a.board(code);
	assert.equal(board.challenge.prizeCandidates.find(p => p.category === 'clear').rsn, 'Mobile');
	assert.equal(board.challenge.prizeCandidates.find(p => p.category === 'purple').rsn, 'Mobile');
	assert.equal(board.leaderboard[0].points, 0);
	assert.equal(board.leaderboard[0].kills, 0);
	assert.equal(board.leaderboard[0].purples, 1);
	await a.tick({ skills: [], activities: [{ name: 'Tombs of Amascut', score: 100 },
		{ name: 'Tombs of Amascut: Expert Mode', score: 21 }] }, a.now + MOBILE_INTERVAL + 1000);
	assert.equal((await a.board(code)).leaderboard[0].points, 5);
	await a.request('PATCH', '/' + code, { drops: [{ ...drops[0], points: 100 }], raidByPoints: false },
		{ 'X-Creator-Token': creatorToken });
	board = await a.board(code);
	assert.equal(board.leaderboard[0].points, 1);
	assert.equal(board.leaderboard[0].kills, 1);
	assert.equal(board.challenge.prizeCandidates.find(p => p.category === 'purple').rsn, 'Mobile');
});


test('switching an existing boss player keeps points, drop evidence, adjustments and late pre-hop kills', async () =>
{
	const a = app();
	const { code, creatorToken } = await a.create('BOSS', 'Zulrah', {
		startsAt: a.now - 60000, drops: [{ name: 'Jar of swamp', points: 20, firstPrize: true }]
	});
	const joined = await a.request('POST', '/' + code + '/join', { rsn: 'Desktop' });
	const headers = { 'X-Participant-Token': joined.participantToken };
	const send = events => a.request('POST', '/' + code + '/events', { events }, headers);
	const event = (id, kind, amount, itemName, occurredAt = a.now - 30000) => ({ id, kind, amount, itemName, occurredAt });
	await send([event('old-kc', 'kc', 9), event('old-drop', 'drop', 1, 'Jar of swamp')]);
	await a.request('PATCH', '/' + code + '/participants/Desktop', { points: 27 }, { 'X-Creator-Token': creatorToken });
	const original = globalThis.fetch;
	let lookups = 0;
	globalThis.fetch = async () => { lookups++; return Response.json(stats('Zulrah', 100)); };
	try
	{
		const switched = await a.request('PUT', '/' + code + '/mobile', { publishedAt: a.now - 20000 }, headers);
		assert.equal(switched.status, 200);
		assert.equal(switched.leaderboard[0].mobilePlayer, true);
		assert.equal(switched.leaderboard[0].points, 27);
		assert.equal(switched.leaderboard[0].kills, 9);
		assert.equal(switched.challenge.prizeCandidates[0].rsn, 'Desktop');
		const retry = await a.request('PUT', '/' + code + '/mobile', {}, headers);
		assert.equal(retry.status, 200);
		assert.equal(lookups, 1);
	}
	finally { globalThis.fetch = original; }
	await a.tick(stats('Zulrah', 101), a.now + MOBILE_INTERVAL + 1000);
	let row = (await a.board(code)).leaderboard[0];
	// Nine old kills plus one mobile kill complete the same 10-kill points block.
	assert.equal(row.kills, 10); assert.equal(row.points, 30); assert.equal(row.adjustment, 7);
	const late = event('late-before-hop', 'kc', 1);
	await send([late]); await send([late]);
	await send([event('after-hop', 'kc', 99, null, a.now)]);
	row = (await a.board(code)).leaderboard[0];
	assert.equal(row.kills, 11); assert.equal(row.points, 30);
	await send([event('mobile-first', 'drop', 1, 'Jar of swamp', a.now)]);
	assert.equal(a.db.prepare("SELECT kind, points FROM events WHERE id='mobile-first'").get().kind, 'claim_drop');
	await a.request('PATCH', '/' + code, { kcPoints: 6 }, { 'X-Creator-Token': creatorToken });
	assert.equal((await a.board(code)).leaderboard[0].points, 33);
	const rejoin = await a.request('POST', '/' + code + '/join', { rsn: 'Desktop' });
	assert.equal(rejoin.participantToken, joined.participantToken);
	assert.equal(rejoin.mobilePlayer, true);
});

test('switching preserves skill XP/levels and mode-specific raid scores', async () =>
{
	for (const type of ['SKILL', 'RAID'])
	{
		const a = app();
		const target = type === 'SKILL' ? 'Slayer' : 'Tombs of Amascut';
		const { code } = await a.create(type, target, { startsAt: a.now - 60000,
			raidByPoints: true, raidPoints: { Normal: 2, Expert: 5 } });
		const joined = await a.request('POST', '/' + code + '/join', { rsn: 'Desktop' });
		const headers = { 'X-Participant-Token': joined.participantToken };
		const event = (id, kind, amount, itemName) => ({ id, kind, amount, itemName, occurredAt: a.now - 30000 });
		await a.request('POST', '/' + code + '/events', { events: type === 'SKILL'
			? [event('old-xp', 'xp', 1000, 'Slayer'), event('old-level', 'level', 1, 'Slayer')]
			: [event('old-raid', 'raid', 1, 'Expert')] }, headers);
		const raidStats = (normal, expert) => ({ skills: [], activities: [
			{ name: 'Tombs of Amascut', score: normal }, { name: 'Tombs of Amascut: Expert Mode', score: expert }] });
		const original = globalThis.fetch;
		globalThis.fetch = async () => Response.json(type === 'SKILL' ? stats('Slayer', null, 10000, 50) : raidStats(10, 20));
		try { assert.equal((await a.request('PUT', '/' + code + '/mobile', { publishedAt: a.now - 20000 }, headers)).status, 200); }
		finally { globalThis.fetch = original; }
		await a.tick(type === 'SKILL' ? stats('Slayer', null, 10200, 51) : raidStats(11, 21), a.now + MOBILE_INTERVAL + 1000);
		const row = (await a.board(code)).leaderboard[0];
		if (type === 'SKILL') { assert.equal(row.points, 1200); assert.equal(row.levels, 2); }
		else { assert.equal(row.points, 12); assert.equal(row.kills, 3); assert.deepEqual(row.raidModes, { Expert: 2, Normal: 1 }); }
	}
});

test('switch requires the participant token and a recent hop, and failures keep RuneLite mode', async () =>
{
	const a = app();
	const { code, creatorToken } = await a.create('MINIGAME', 'Tempoross', { startsAt: a.now - 60000 });
	const joined = await a.request('POST', '/' + code + '/join', { rsn: 'Desktop' });
	const headers = { 'X-Participant-Token': joined.participantToken };
	const url = '/' + code + '/mobile';
	assert.equal((await a.request('PUT', url, { publishedAt: a.now - 20000 }, { 'X-Creator-Token': creatorToken })).status, 403);
	for (const publishedAt of [undefined, a.now, a.now + 10000, a.now - 360000])
		assert.equal((await a.request('PUT', url, { publishedAt }, headers)).status, 400);
	const original = globalThis.fetch;
	globalThis.fetch = async () => { throw new Error('offline'); };
	try { assert.equal((await a.request('PUT', url, { publishedAt: a.now - 20000 }, headers)).status, 503); }
	finally { globalThis.fetch = original; }
	assert.equal((await a.board(code)).leaderboard[0].mobilePlayer, false);
	await a.request('POST', '/' + code + '/events', { events: [
		{ id: 'after-hop-native', kind: 'kc', amount: 1, occurredAt: a.now - 10000 }
	] }, headers);
	globalThis.fetch = async () => Response.json(stats('Tempoross', 10));
	try { assert.equal((await a.request('PUT', url, { publishedAt: a.now - 20000 }, headers)).status, 409); }
	finally { globalThis.fetch = original; }
	assert.equal((await a.board(code)).leaderboard[0].points, 1);
	assert.equal((await a.board(code)).leaderboard[0].mobilePlayer, false);
});

test('a RuneLite request already in flight when switching cannot add overlapping progress', async () =>
{
	const a = app();
	const { code } = await a.create('MINIGAME', 'Tempoross', { startsAt: a.now - 60000 });
	const joined = await a.request('POST', '/' + code + '/join', { rsn: 'Desktop' });
	const originalBatch = a.env.DB.batch;
	a.env.DB.batch = async statements =>
	{
		a.env.DB.batch = originalBatch;
		a.db.prepare(`INSERT INTO mobile_tracking (challenge_code, rsn, baseline, latest, next_check)
		 VALUES (?, 'Desktop', '{"kc":100}', '{"kc":100}', ?)`).run(code, a.now + MOBILE_INTERVAL);
		a.db.prepare("INSERT INTO mobile_handovers VALUES (?, 'Desktop', ?)").run(code, a.now - 20000);
		return originalBatch(statements);
	};
	await a.request('POST', '/' + code + '/events', { events: [
		{ id: 'racing-kc', kind: 'kc', amount: 4, occurredAt: a.now }
	] }, { 'X-Participant-Token': joined.participantToken });
	assert.equal((await a.board(code)).leaderboard[0].points, 0);
	await a.tick(stats('Tempoross', 104), a.now + MOBILE_INTERVAL + 1000);
	assert.equal((await a.board(code)).leaderboard[0].points, 4);
});

test('handover migration can be rerun while preserving current scores', () =>
{
	const a = app();
	a.db.exec('DROP TABLE mobile_handovers');
	const migration = readFileSync(new URL('../migrations/006-mobile-handover.sql', import.meta.url), 'utf8');
	a.db.exec(migration); a.db.exec(migration);
	assert.equal(a.db.prepare('SELECT COUNT(*) AS count FROM mobile_handovers').get().count, 0);
});
