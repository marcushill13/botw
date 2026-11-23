/**
 * Challenge of the Week — the small service the plugins share.
 *
 * A RuneLite plugin only ever sees its own client, so a leaderboard across a clan needs somewhere for
 * everyone's points to meet. That is all this is: create a challenge, join it with a code, report what
 * you killed, read what everyone has.
 *
 * Two decisions worth stating, because they are the ones that matter:
 *
 * Points are worked out here, from the challenge's own configuration. The plugin reports that a Vorki
 * dropped; it does not get to say a Vorki is worth 500. That does not make the thing cheat-proof — a
 * modified client can still claim a drop it never got — but it keeps an honest client's numbers right
 * and stops the obvious abuse.
 *
 * Events are stored one by one rather than as a running total. That is what makes a resend after a
 * disconnect harmless, gives the panel its "where did these points come from" breakdown, and lets
 * every score be recomputed when the creator inevitably fixes a points value mid-week.
 */

import { fetchMobileSnapshot, mobileSupport, mobileTotals, nextMobileCheck, syncMobilePlayers } from './mobile.js';
import { firstKeys, firstOverrides, prizeCandidates } from './firsts.js';
import { connectDiscord, removeDiscord, syncDiscordBoards } from './discord.js';
import { eventPoints, minigameDropRules, optionsOf, typeOf, validateWeekly, weeklyOptions } from './weekly.js';

/** Codes people read aloud in Discord, so no O/0 or I/1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Long enough that guessing one is not worth anyone's time. */
const TOKEN_BYTES = 24;

/** One request cannot carry more than this many events. Keeps a bad client from flooding the table. */
const MAX_EVENTS_PER_REQUEST = 50;

/** About 700KB of base64, which is far more than a downscaled screenshot needs. */
const MAX_IMAGE_CHARS = 900000;

/**
 * How long a challenge's screenshots are kept after it finishes.
 *
 * Only the pictures expire. The results — who joined, what they killed, what they scored — are a few
 * hundred bytes a head and are kept for good, so a clan can still look up who won a competition from
 * two years ago. The screenshots are the only part large enough to matter, and they are evidence for
 * an argument, which is a thing with a short life: a month after a week-long competition is long past
 * anyone disputing it, and the creator can export a zip at any point before then.
 *
 * Without this the service only ever grows, because a challenge nobody bothers to delete keeps its
 * pictures for ever.
 */
const SHOT_RETENTION_DAYS = 30;

export default {
	/**
	 * Runs the Discord sync every minute and clears expired screenshots at 04:00 UTC.
	 *
	 * Keyed on when the challenge ended rather than when each picture was taken, so a long competition
	 * never has its early evidence deleted while it is still being played.
	 */
	async scheduled(event, env, ctx)
	{
		if (event.cron === '* * * * *')
		{
			// Share one Cron Trigger: Workers Free allows only five per account.
			// scheduledTime is the intended tick, even if Cloudflare starts the handler late.
			const scheduled = new Date(event.scheduledTime);
			if (scheduled.getUTCHours() === 4 && scheduled.getUTCMinutes() === 0)
			{
				ctx.waitUntil(pruneShots(env));
			}
			ctx.waitUntil((async () => {
				await syncMobilePlayers(env, refreshTotals);
				await syncDiscordBoards(env, leaderboardFor);
			})());
		}
	},

	async fetch(request, env)
	{
		try
		{
			return await route(request, env);
		}
		catch (error)
		{
			// Never leak internals to the client; the plugin only needs to know it failed.
			console.error(error);
			return json({ error: 'Something went wrong' }, 500);
		}
	}
};

async function route(request, env)
{
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, '');

	if (request.method === 'OPTIONS')
	{
		return withCors(new Response(null, { status: 204 }));
	}

	if ((path === '/v1/challenges' || path === '/v1/weekly-challenges') && request.method === 'POST')
	{
		return withCors(await createChallenge(request, env));
	}

	const byCode = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)$/);
	if (byCode && request.method === 'GET')
	{
		return withCors(await readChallenge(byCode[1].toUpperCase(), env));
	}

	if (byCode && request.method === 'PATCH')
	{
		return withCors(await updateChallenge(byCode[1].toUpperCase(), request, env));
	}

	if (byCode && request.method === 'DELETE')
	{
		return withCors(await deleteChallenge(byCode[1].toUpperCase(), request, env));
	}

	const discord = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/discord$/);
	if (discord && request.method === 'PUT')
	{
		const body = await readJson(request);
		const result = await connectDiscord(discord[1].toUpperCase(), body?.webhookUrl,
			request.headers.get('X-Creator-Token'), env, leaderboardFor, body?.rankLimit);
		return withCors(json(result.error ? { error: result.error } : { enabled: true }, result.status));
	}
	if (discord && request.method === 'DELETE')
	{
		const result = await removeDiscord(discord[1].toUpperCase(),
			request.headers.get('X-Creator-Token'), env);
		return withCors(json(result.error ? { error: result.error } : { enabled: false }, result.status));
	}

	const firsts = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/firsts$/);
	if (firsts && request.method === 'PUT')
	{
		return withCors(await setFirsts(firsts[1].toUpperCase(), request, env));
	}

	const mobileSwitch = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/mobile$/);
	if (mobileSwitch && request.method === 'PUT')
	{
		return withCors(await switchToMobile(mobileSwitch[1].toUpperCase(), request, env));
	}

	const mobileJoin = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/mobile-join$/);
	if (mobileJoin && request.method === 'POST')
	{
		return withCors(await joinChallenge(mobileJoin[1].toUpperCase(), request, env, true));
	}

	const join = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/join$/);
	if (join && request.method === 'POST')
	{
		return withCors(await joinChallenge(join[1].toUpperCase(), request, env));
	}

	const events = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/events$/);
	if (events && request.method === 'POST')
	{
		return withCors(await submitEvents(events[1].toUpperCase(), request, env));
	}

	const shots = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/shots$/);
	if (shots && request.method === 'POST')
	{
		return withCors(await uploadShot(shots[1].toUpperCase(), request, env));
	}

	if (shots && request.method === 'GET')
	{
		return withCors(await listShots(shots[1].toUpperCase(), request, env));
	}

	const shot = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/shots\/([^/]+)$/);
	if (shot && request.method === 'GET')
	{
		return withCors(await readShot(shot[1].toUpperCase(), decodeURIComponent(shot[2]), request, env));
	}

	const participants = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/participants$/);
	if (participants && request.method === 'POST')
	{
		return withCors(await addParticipant(participants[1].toUpperCase(), request, env));
	}

	const participant = path.match(/^\/v1\/challenges\/([A-Za-z0-9]+)\/participants\/([^/]+)$/);
	if (participant && request.method === 'PATCH')
	{
		return withCors(await setParticipantPoints(
			participant[1].toUpperCase(), decodeURIComponent(participant[2]), request, env));
	}

	if (participant && request.method === 'DELETE')
	{
		return withCors(await removeParticipant(
			participant[1].toUpperCase(), decodeURIComponent(participant[2]), request, env));
	}

	const mine = path.match(/^\/v1\/creators\/([^/]+)\/challenges$/);
	if (mine && request.method === 'GET')
	{
		return withCors(await challengesCreatedBy(decodeURIComponent(mine[1]), env));
	}

	return withCors(json({ error: 'No such endpoint' }, 404));
}

async function createChallenge(request, env)
{
	const body = await readJson(request);
	const problem = validateChallenge(body);
	if (problem)
	{
		return json({ error: problem }, 400);
	}

	const code = await unusedCode(env);
	const creatorToken = randomToken();
	const now = Date.now();

	await env.DB.prepare(
		`INSERT INTO challenges
			(code, name, boss, starts_at, ends_at, timezone, kc_per, kc_points, drops,
			 creator_token, creator_rsn, created_at, event_type, event_options)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		.bind(
			code,
			body.name.trim(),
			body.boss.trim(),
			body.startsAt,
			body.endsAt,
			body.timezone ?? 'UTC',
			body.kcPer,
			body.kcPoints,
			JSON.stringify(normaliseDrops(body.drops, body.eventType)),
			creatorToken,
			body.creatorRsn.trim(),
			now,
			body.eventType ?? 'BOSS',
			JSON.stringify(weeklyOptions(body)))
		.run();

	// The creator is not entered automatically. Running a challenge and competing in it are separate
	// things: someone may be organising it for other people, and joining is how a client gets the token
	// it needs to report kills — so it has to be a deliberate act rather than something done on their
	// behalf on a machine that may not even be the one they play on.

	const challenge = await loadChallenge(code, env);
	return json({ code, creatorToken, challenge: publicChallenge(challenge), leaderboard: [] }, 201);
}

async function readChallenge(code, env)
{
	const challenge = await env.DB.prepare(
		`SELECT c.*, b.rank_limit AS discord_rank_limit
		   FROM challenges c LEFT JOIN discord_boards b ON b.challenge_code = c.code
		  WHERE c.code = ?`).bind(code).first();
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	return json({
		challenge: {
			...publicChallenge(challenge),
			prizeCandidates: await prizeCandidates(challenge, env),
			firstPrizeOverrides: await firstOverrides(challenge.code, env)
		},
		leaderboard: await leaderboardFor(code, env),
		discordRankLimit: challenge.discord_rank_limit
	});
}

async function updateChallenge(code, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
	{
		return json({ error: 'Only the creator can change this challenge' }, 403);
	}

	const body = await readJson(request);
	const updatedRules = { ...publicChallenge(challenge), ...body, creatorRsn: challenge.creator_rsn };
	if (updatedRules.eventType !== typeOf(challenge)
		|| (typeOf(challenge) !== 'BOSS' && String(updatedRules.boss).trim() !== challenge.boss))
	{
		return json({ error: 'The event type and target cannot be changed after creation' }, 400);
	}
	const mobileEntry = await env.DB.prepare('SELECT rsn FROM mobile_tracking WHERE challenge_code = ? LIMIT 1').bind(code).first();
	if (mobileEntry && (updatedRules.boss !== challenge.boss || updatedRules.startsAt !== challenge.starts_at
		|| updatedRules.endsAt !== challenge.ends_at))
		return json({ error: 'The target and dates cannot change after a mobile player joins. Create a new challenge instead.' }, 409);
	const problem = validateChallenge(updatedRules);
	if (problem)
	{
		return json({ error: problem }, 400);
	}

	// Older clients do not send prize labels. Preserve them unless explicitly edited.
	const previousDrops = JSON.parse(challenge.drops);
	const drops = normaliseDrops(updatedRules.drops.map(drop => !drop || Object.hasOwn(drop, 'prize') ? drop : {
		...drop, prize: previousDrops.find(previous => previous.name.toLowerCase() === String(drop.name).toLowerCase())?.prize ?? ''
	}), updatedRules.eventType);
	await env.DB.prepare(
		`UPDATE challenges
		    SET name = ?, boss = ?, starts_at = ?, ends_at = ?, timezone = ?,
		        kc_per = ?, kc_points = ?, drops = ?, event_options = ?
		  WHERE code = ?`)
		.bind(
			(body.name ?? challenge.name).trim(),
			(body.boss ?? challenge.boss).trim(),
			body.startsAt ?? challenge.starts_at,
			body.endsAt ?? challenge.ends_at,
			body.timezone ?? challenge.timezone,
			body.kcPer ?? challenge.kc_per,
			body.kcPoints ?? challenge.kc_points,
			JSON.stringify(drops),
			JSON.stringify(weeklyOptions(updatedRules)),
			code)
		.run();

	// Changing what a drop is worth has to change what it was already worth, or the leaderboard
	// silently disagrees with the rules everyone can see.
	if (typeOf(challenge) === 'BOSS' || typeOf(challenge) === 'RAID')
	{
		await recomputePoints(code, env);
	}
	else if (typeOf(challenge) === 'MINIGAME'
		&& !sameMinigameDropPoints(JSON.parse(challenge.drops), drops))
	{
		await recomputePoints(code, env, true);
	}

	const updated = await loadChallenge(code, env);
	return json({
		challenge: publicChallenge(updated),
		leaderboard: await leaderboardFor(code, env)
	});
}

/**
 * Removes a challenge and everything under it.
 *
 * The rows are deleted explicitly rather than left to the foreign keys, because D1 does not enforce
 * them by default and a challenge that disappears while its events and screenshots linger would leave
 * the database quietly filling up with things nothing can reach.
 */
async function deleteChallenge(code, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
	{
		return json({ error: 'Only the creator can delete this challenge' }, 403);
	}

	// Removing the challenge also retires its Discord message.
	await removeDiscord(code, challenge.creator_token, env);
	await env.DB.batch([
		env.DB.prepare('DELETE FROM shots WHERE challenge_code = ?').bind(code),
		env.DB.prepare('DELETE FROM events WHERE challenge_code = ?').bind(code),
		env.DB.prepare('DELETE FROM mobile_handovers WHERE challenge_code = ?').bind(code),
		env.DB.prepare('DELETE FROM mobile_tracking WHERE challenge_code = ?').bind(code),
		env.DB.prepare('DELETE FROM first_prize_overrides WHERE challenge_code = ?').bind(code),
		env.DB.prepare('DELETE FROM participants WHERE challenge_code = ?').bind(code),
		env.DB.prepare('DELETE FROM challenges WHERE code = ?').bind(code)
	]);

	return json({ deleted: true });
}

async function joinChallenge(code, request, env, mobile = false)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	const body = await readJson(request);
	const rsn = String(body?.rsn ?? '').replace(/\u00a0/g, ' ').trim();
	if (!/^[A-Za-z0-9 _-]{1,12}$/.test(rsn))
	{
		return json({ error: 'Enter a valid RuneScape name (1–12 characters)' }, 400);
	}

	const existing = await env.DB.prepare(
		`SELECT p.token, p.manual, p.rsn, m.rsn AS mobile_rsn FROM participants p
		 LEFT JOIN mobile_tracking m ON m.challenge_code = p.challenge_code AND m.rsn = p.rsn
		 WHERE p.challenge_code = ? AND p.rsn = ? COLLATE NOCASE`)
		.bind(code, rsn)
		.first();

	if (mobile && existing && !existing.mobile_rsn)
	{
		return json({ error: 'You have already joined. Open the challenge and use Switch to mobile tracking to keep your existing score.' }, 409);
	}
	let snapshot = null;
	if (mobile && !existing)
	{
		const problem = mobileSupport(challenge);
		if (problem) return json({ error: problem }, 400);
		if (Date.now() >= challenge.ends_at) return json({ error: 'This challenge has finished' }, 400);
		try { snapshot = await fetchMobileSnapshot(challenge, rsn); }
		catch (error) { return json({ error: error.message }, 503); }
	}

	// Rejoining is not an error. People reinstall, hop accounts, and join twice by accident.
	const token = existing ? existing.token : randomToken();
	if (!existing)
	{
		const now = Date.now();
		if (mobile && now >= challenge.ends_at) return json({ error: 'This challenge has finished' }, 400);
		const statements = [env.DB.prepare(
			'INSERT INTO participants (challenge_code, rsn, token, joined_at) VALUES (?, ?, ?, ?)')
			.bind(code, rsn, token, now)];
		if (mobile)
		{
			const active = now >= challenge.starts_at;
			statements.push(env.DB.prepare(
				`INSERT INTO mobile_tracking (challenge_code, rsn, baseline, latest, last_checked, next_check, status)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`)
				.bind(code, rsn, active ? JSON.stringify(snapshot) : null, active ? JSON.stringify(snapshot) : null,
					active ? now : null, active ? nextMobileCheck(challenge, now) : challenge.starts_at,
					active ? 'Starting Hiscores saved. Checks every 10 minutes.' : 'Waiting for the challenge to start.'));
		}
		await env.DB.batch(statements);
	}
	else if (existing.manual === 1)
	{
		// Someone entered by hand has now joined from a client of their own — a mobile player on a
		// desktop, or staff who added them before they got round to it. From here their kills count
		// themselves, so the "Manual" tag comes off. Whatever the creator gave them stays as an
		// adjustment, because those points were for kills that happened and were never tracked.
		await env.DB.prepare(
			'UPDATE participants SET manual = 0 WHERE challenge_code = ? AND rsn = ?')
			.bind(code, existing.rsn)
			.run();
	}

	return json({
		mobilePlayer: Boolean(mobile || existing?.mobile_rsn),
		participantToken: token,
		challenge: publicChallenge(challenge),
		leaderboard: await leaderboardFor(code, env)
	});
}

async function switchToMobile(code, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge) return json({ error: 'No challenge with that code' }, 404);
	const participant = await env.DB.prepare(
		`SELECT p.rsn, m.rsn AS mobile_rsn FROM participants p
		 LEFT JOIN mobile_tracking m ON m.challenge_code = p.challenge_code AND m.rsn = p.rsn
		 WHERE p.challenge_code = ? AND p.token = ?`)
		.bind(code, request.headers.get('X-Participant-Token')).first();
	if (!participant) return json({ error: 'Join this challenge before switching your tracking mode' }, 403);
	// Retrying a successful request must not replace its baseline.
	if (participant.mobile_rsn) return readChallenge(code, env);
	const now = Date.now();
	if (now >= challenge.ends_at) return json({ error: 'This challenge has finished' }, 400);
	const problem = mobileSupport(challenge);
	if (problem) return json({ error: problem }, 400);
	const body = await readJson(request);
	const cutoff = body?.publishedAt;
	if (!Number.isSafeInteger(cutoff) || cutoff > now - 10000 || cutoff < now - 300000)
		return json({ error: 'Hop worlds, wait 15 seconds, then switch to mobile tracking. This lets Hiscores catch up before the handover.' }, 400);
	let snapshot;
	try { snapshot = await fetchMobileSnapshot(challenge, participant.rsn); }
	catch (error) { return json({ error: error.message }, 503); }
	const checked = Date.now();
	if (checked >= challenge.ends_at) return json({ error: 'This challenge has finished' }, 400);
	const active = checked >= challenge.starts_at;
	// The guard is evaluated atomically with the insert. A live progress upload racing the lookup
	// either makes this switch fail, or is handled using the stored cutoff in submitEvents.
	await env.DB.batch([
		env.DB.prepare(
			`INSERT OR IGNORE INTO mobile_tracking
			 (challenge_code, rsn, baseline, latest, last_checked, next_check, status)
			 SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
			 SELECT 1 FROM events WHERE challenge_code = ? AND rsn = ?
			 AND occurred_at > ? AND kind IN ('kc', 'raid', 'xp', 'level'))`)
			.bind(code, participant.rsn, active ? JSON.stringify(snapshot) : null,
				active ? JSON.stringify(snapshot) : null, active ? checked : null,
				active ? nextMobileCheck(challenge, checked) : challenge.starts_at,
				active ? 'Switched to Hiscores. Existing scores kept; checks every 10 minutes.' : 'Waiting for the challenge to start.',
				code, participant.rsn, cutoff),
		env.DB.prepare(
			`INSERT OR IGNORE INTO mobile_handovers (challenge_code, rsn, cutoff_at)
			 SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM mobile_tracking WHERE challenge_code = ? AND rsn = ?)`)
			.bind(code, participant.rsn, cutoff, code, participant.rsn)
	]);
	const switched = await env.DB.prepare('SELECT rsn FROM mobile_tracking WHERE challenge_code = ? AND rsn = ?')
		.bind(code, participant.rsn).first();
	if (!switched) return json({ error: 'You gained RuneLite progress after your last hop. Hop again and switch before continuing to play. Your existing score is unchanged.' }, 409);
	return readChallenge(code, env);
}

async function submitEvents(code, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	const token = request.headers.get('X-Participant-Token');
	const participant = await env.DB.prepare(
		`SELECT p.rsn, m.rsn AS mobile_rsn, h.cutoff_at FROM participants p
		 LEFT JOIN mobile_tracking m ON m.challenge_code = p.challenge_code AND m.rsn = p.rsn
		 LEFT JOIN mobile_handovers h ON h.challenge_code = p.challenge_code AND h.rsn = p.rsn
		 WHERE p.challenge_code = ? AND p.token = ?`)
		.bind(code, token)
		.first();

	if (!participant)
	{
		return json({ error: 'Join the challenge before sending anything' }, 403);
	}


	const body = await readJson(request);
	const submitted = Array.isArray(body?.events) ? body.events : [];
	if (submitted.length > MAX_EVENTS_PER_REQUEST)
	{
		return json({ error: `No more than ${MAX_EVENTS_PER_REQUEST} events at a time` }, 400);
	}

	const drops = JSON.parse(challenge.drops);
	const now = Date.now();
	const statements = [];

	for (const event of submitted)
	{
		if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 120)
		{
			continue;
		}

		const occurredAt = Number(event.occurredAt);
		if (!Number.isFinite(occurredAt))
		{
			continue;
		}

		// Anything outside the window is discarded rather than clamped. A kill before the start is not
		// worth fewer points, it is worth none, and silently counting it would be the bug.
		if (occurredAt < challenge.starts_at || occurredAt > challenge.ends_at || occurredAt > now + 60000)
		{
			continue;
		}

		const points = eventPoints(event, challenge, drops);
		if (points === null) continue;
		const rule = drops.find(rule => rule.name.toLowerCase() === String(event.itemName ?? '').toLowerCase());
		const claimKind = event.kind === 'drop' && rule
			&& (rule.firstPrize || (typeOf(challenge) === 'RAID' && rule.purple)) ? 'claim_drop'
			: event.kind === 'raid' ? 'claim_raid' : null;
		if (participant.mobile_rsn && (participant.cutoff_at == null || occurredAt > participant.cutoff_at) && !claimKind) continue;

		// Decide the scoring mode inside the INSERT, not just from the earlier participant read.
		// A request already in flight when the handover commits must obey the new cutoff too.
		statements.push(env.DB.prepare(
			`WITH mode AS (SELECT EXISTS (
			 SELECT 1 FROM mobile_tracking m LEFT JOIN mobile_handovers h
			 ON h.challenge_code = m.challenge_code AND h.rsn = m.rsn
			 WHERE m.challenge_code = ? AND m.rsn = ? AND (h.cutoff_at IS NULL OR ? > h.cutoff_at)
			) AS claims_only)
			 INSERT OR IGNORE INTO events
			 (id, challenge_code, rsn, kind, item_name, amount, points, occurred_at, recorded_at)
			 SELECT ?, ?, ?, CASE WHEN claims_only THEN ? ELSE ? END, ?, ?,
			 CASE WHEN claims_only THEN 0 ELSE ? END, ?, ? FROM mode
			 WHERE claims_only = 0 OR ? IS NOT NULL`)
			.bind(code, participant.rsn, occurredAt, event.id, code, participant.rsn, claimKind, event.kind,
				event.kind === 'kc' ? null : String(event.itemName ?? ''), event.amount, points, occurredAt, now, claimKind));
	}

	if (statements.length > 0)
	{
		await env.DB.batch(statements);
		if (typeOf(challenge) !== 'SKILL' || participant.mobile_rsn) await refreshTotals(code, participant.rsn, env, challenge);
	}

	if (typeOf(challenge) !== 'BOSS')
	{
		// The sender only needs acknowledgement. Do not read every participant for every XP batch.
		return json({ accepted: statements.length });
	}

	return json({
		accepted: statements.length,
		you: await scoreFor(code, participant.rsn, env),
		leaderboard: await leaderboardFor(code, env)
	});
}

/**
 * Keeps the picture that goes with a scoring drop.
 *
 * Keyed on the event, so an upload retried after a timeout replaces rather than duplicates — the same
 * reasoning as the events themselves.
 */
async function uploadShot(code, request, env)
{
	const participant = await participantFor(code, request, env);
	if (!participant)
	{
		return json({ error: 'Join the challenge before sending anything' }, 403);
	}

	const body = await readJson(request);
	if (!body || typeof body.eventId !== 'string' || typeof body.image !== 'string')
	{
		return json({ error: 'An event and an image are required' }, 400);
	}

	// A downscaled JPEG is tens of kilobytes. Anything approaching a megabyte is either a mistake or
	// somebody filling the database, and neither should be stored.
	if (body.image.length > MAX_IMAGE_CHARS)
	{
		return json({ error: 'That image is too large' }, 413);
	}

	await env.DB.prepare(
		`INSERT OR REPLACE INTO shots
			(event_id, challenge_code, rsn, item_name, occurred_at, uploaded_at, image)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`)
		.bind(
			body.eventId,
			code,
			participant.rsn,
			String(body.itemName ?? '').slice(0, 120),
			Number(body.occurredAt) || Date.now(),
			Date.now(),
			body.image)
		.run();

	return json({ stored: true });
}

/**
 * What evidence exists, without the images themselves.
 *
 * Only the creator sees this. It is the list they would otherwise be asking Discord for, and sending
 * every participant everyone else's screenshots would be a different thing entirely.
 */
async function listShots(code, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
	{
		return json({ error: 'Only the creator can see the evidence' }, 403);
	}

	const rows = await env.DB.prepare(
		`SELECT event_id AS eventId, rsn, item_name AS itemName, occurred_at AS occurredAt
		   FROM shots
		  WHERE challenge_code = ?
		  ORDER BY rsn ASC, occurred_at DESC`)
		.bind(code)
		.all();

	return json({ shots: rows.results ?? [] });
}

/**
 * One image. Fetched only when the creator opens it, because a hundred thumbnails in one response
 * would be several megabytes for a screen most of which is never looked at.
 */
async function readShot(code, eventId, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
	{
		return json({ error: 'Only the creator can see the evidence' }, 403);
	}

	const row = await env.DB.prepare(
		'SELECT image, item_name AS itemName, rsn FROM shots WHERE challenge_code = ? AND event_id = ?')
		.bind(code, eventId)
		.first();

	if (!row)
	{
		return json({ error: 'No such screenshot' }, 404);
	}

	return json(row);
}

/** Adds a participant for manual scoring from screenshots. */
async function addParticipant(code, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
	{
		return json({ error: 'Only the creator can add players' }, 403);
	}

	const body = await readJson(request);
	const rsn = String(body?.rsn ?? '').trim();
	if (!rsn)
	{
		return json({ error: 'A name is required' }, 400);
	}

	const existing = await env.DB.prepare(
		'SELECT rsn FROM participants WHERE challenge_code = ? AND rsn = ?')
		.bind(code, rsn)
		.first();

	if (existing)
	{
		return json({ error: `${rsn} is already on this leaderboard` }, 409);
	}

	const points = Number.isFinite(body?.points) ? Math.trunc(body.points) : 0;

	await env.DB.prepare(
		`INSERT INTO participants (challenge_code, rsn, token, joined_at, points, adjustment, manual)
		 VALUES (?, ?, ?, ?, ?, ?, 1)`)
		.bind(code, rsn, randomToken(), Date.now(), points, points)
		.run();

	return json({
		challenge: publicChallenge(challenge),
		leaderboard: await leaderboardFor(code, env)
	});
}

/**
 * Sets what someone is on, whatever they got there by.
 *
 * The creator types a total, not a difference — "put them on 40" is the thought, and asking for the
 * change instead would mean doing the subtraction in their head. The subtraction happens here: what
 * is stored is the gap between that total and what the player's own kills come to, so their tracked
 * points keep accruing underneath and the creator's correction rides on top of them.
 */
async function setParticipantPoints(code, rsn, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
	{
		return json({ error: 'Only the creator can change points' }, 403);
	}

	const existing = await env.DB.prepare(
		'SELECT rsn FROM participants WHERE challenge_code = ? AND rsn = ?')
		.bind(code, rsn)
		.first();

	if (!existing)
	{
		return json({ error: 'Nobody by that name is on this leaderboard' }, 404);
	}

	const body = await readJson(request);
	if (!Number.isFinite(body?.points))
	{
		return json({ error: 'A points total is required' }, 400);
	}

	const wanted = Math.trunc(body.points);

	await env.DB.prepare(
		'UPDATE participants SET adjustment = ? - (points - adjustment), points = ? WHERE challenge_code = ? AND rsn = ?')
		.bind(wanted, wanted, code, existing.rsn)
		.run();

	return json({
		challenge: publicChallenge(challenge),
		leaderboard: await leaderboardFor(code, env)
	});
}

/**
 * Takes someone off the leaderboard.
 *
 * Here because adding a name by hand means eventually adding it wrong, and a typo that cannot be
 * removed would sit at the bottom of the board for the whole competition.
 *
 * Their events go too. A player who is removed and then rejoins from their own client starts again,
 * which is the honest reading of having been removed.
 */
async function removeParticipant(code, rsn, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge)
	{
		return json({ error: 'No challenge with that code' }, 404);
	}

	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
	{
		return json({ error: 'Only the creator can remove players' }, 403);
	}

	await env.DB.batch([
		env.DB.prepare('DELETE FROM shots WHERE challenge_code = ? AND rsn = ?').bind(code, rsn),
		env.DB.prepare('DELETE FROM events WHERE challenge_code = ? AND rsn = ?').bind(code, rsn),
		env.DB.prepare('DELETE FROM mobile_handovers WHERE challenge_code = ? AND rsn = ?').bind(code, rsn),
		env.DB.prepare('DELETE FROM mobile_tracking WHERE challenge_code = ? AND rsn = ?').bind(code, rsn),
		env.DB.prepare('DELETE FROM participants WHERE challenge_code = ? AND rsn = ?').bind(code, rsn)
	]);

	return json({
		challenge: publicChallenge(challenge),
		leaderboard: await leaderboardFor(code, env)
	});
}

/**
 * Deletes the screenshots belonging to challenges that finished more than {@link SHOT_RETENTION_DAYS}
 * ago, and nothing else.
 *
 * The challenge itself, its participants and its events all stay. Someone looking up an old
 * competition still sees the full leaderboard; what they no longer get is the pictures.
 *
 * Deleting a challenge from the plugin already takes its screenshots with it, by way of the foreign
 * key. This is for the ones nobody ever gets round to deleting.
 */
async function pruneShots(env)
{
	const cutoff = Date.now() - SHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

	const result = await env.DB.prepare(
		`DELETE FROM shots
		 WHERE challenge_code IN (SELECT code FROM challenges WHERE ends_at < ?)`)
		.bind(cutoff)
		.run();

	// Worth logging: it is the only way to see this ran, and the only warning if it ever starts
	// removing far more than expected.
	console.log(`Pruned ${result.meta?.changes ?? 0} screenshots from challenges ended before ${new Date(cutoff).toISOString()}`);

	return result.meta?.changes ?? 0;
}

async function participantFor(code, request, env)
{
	return env.DB.prepare('SELECT rsn FROM participants WHERE challenge_code = ? AND token = ?')
		.bind(code, request.headers.get('X-Participant-Token'))
		.first();
}

async function challengesCreatedBy(rsn, env)
{
	const rows = await env.DB.prepare(
		'SELECT * FROM challenges WHERE creator_rsn = ? ORDER BY starts_at DESC')
		.bind(rsn)
		.all();

	return json({ challenges: (rows.results ?? []).map(publicChallenge) });
}

function sameMinigameDropPoints(before, after)
{
	const scores = rules => new Map(minigameDropRules(rules).map(rule => [rule.name.toLowerCase(), rule.points]));
	const oldScores = scores(before);
	const newScores = scores(after);
	return oldScores.size === newScores.size && [...oldScores].every(([name, points]) => newScores.get(name) === points);
}

/**
 * Rewrites every event's points against the current configuration. Called when the creator edits a
 * challenge, so that what the leaderboard says and what the rules say cannot drift apart.
 */
async function recomputePoints(code, env, dropsOnly = false)
{
	const challenge = await loadChallenge(code, env);
	const drops = JSON.parse(challenge.drops);

	const rows = await env.DB.prepare(
		`SELECT id, kind, item_name, amount FROM events WHERE challenge_code = ?${dropsOnly ? " AND kind = 'drop'" : ""}`)
		.bind(code)
		.all();

	const statements = [];
	for (const row of rows.results ?? [])
	{
		const points = eventPoints(
			{ kind: row.kind, itemName: row.item_name, amount: row.amount }, challenge, drops);

		statements.push(env.DB.prepare('UPDATE events SET points = ? WHERE id = ?')
			.bind(points ?? 0, row.id));
	}

	if (statements.length > 0)
	{
		await env.DB.batch(statements);
	}

	// Every participant's total has just changed underneath them.
	const participants = await env.DB.prepare(
		'SELECT rsn FROM participants WHERE challenge_code = ?').bind(code).all();

	for (const participant of participants.results ?? [])
	{
		await refreshTotals(code, participant.rsn, env, challenge);
	}
}

/**
 * The leaderboard, read from the running totals rather than summed from the events.
 *
 * This is the most-read thing in the service and the cheapest it can be: one row per participant.
 * Summing the event table instead would mean reading every kill anyone has logged every time anyone
 * glances at the panel, which is how a free tier's read allowance disappears in an afternoon.
 */
async function leaderboardFor(code, env)
{
	const rows = await env.DB.prepare(
		`SELECT p.rsn, p.points, p.kills, p.drops, p.adjustment, p.manual, p.levels, p.purples, p.raid_modes,
		        m.rsn IS NOT NULL AS mobilePlayer, m.last_checked AS mobileLastChecked, m.status AS mobileStatus
		   FROM participants p LEFT JOIN mobile_tracking m ON m.challenge_code = p.challenge_code AND m.rsn = p.rsn
		  WHERE p.challenge_code = ?
		  ORDER BY p.points DESC, p.kills DESC, p.rsn ASC`)
		.bind(code)
		.all();

	// SQLite has no booleans, and the plugin should not have to know that.
	return (rows.results ?? []).map(({ raid_modes, ...row }) => ({
		...row, mobilePlayer: row.mobilePlayer === 1, manual: row.manual === 1, raidModes: JSON.parse(raid_modes ?? '{}')
	}));
}

/**
 * Rebuilds one participant's totals from their events. Called after anything is written, so the
 * totals can never drift from the events they came from.
 */
async function refreshTotals(code, rsn, env, challenge = null)
{
	const rules = challenge ?? await loadChallenge(code, env);
	const totals = await eventTotals(code, rsn, env, rules);
	const mobile = await env.DB.prepare('SELECT baseline, latest FROM mobile_tracking WHERE challenge_code = ? AND rsn = ?')
		.bind(code, rsn).first();
	const external = mobileTotals(rules, mobile);
	totals.points = typeOf(rules) === 'BOSS'
		? Math.trunc((totals.kc + external.kills) / rules.kc_per) * rules.kc_points + totals.eventPoints
		: totals.points + external.points;
	totals.kills += external.kills;
	totals.levels += external.levels;
	for (const [mode, count] of Object.entries(external.raidModes)) totals.raidModes[mode] = (totals.raidModes[mode] ?? 0) + count;
	await env.DB.prepare(
		`UPDATE participants
		    SET points = ? + adjustment, kills = ?, drops = ?, levels = ?, purples = ?, raid_modes = ?
		  WHERE challenge_code = ? AND rsn = ?`)
		.bind(totals.points, totals.kills, totals.drops, totals.levels, totals.purples,
			JSON.stringify(totals.raidModes), code, rsn).run();
}

async function eventTotals(code, rsn, env, challenge)
{
	const rules = challenge ?? await loadChallenge(code, env);
	const totals = await env.DB.prepare(
		`SELECT COALESCE(SUM(CASE WHEN kind IN ('kc', 'raid') THEN amount ELSE 0 END), 0) AS kills,
		        COALESCE(SUM(CASE WHEN kind = 'kc' THEN amount ELSE 0 END), 0) AS kc,
		        COALESCE(SUM(points), 0) AS eventPoints,
		        COALESCE(SUM(CASE WHEN kind IN ('drop', 'claim_drop') THEN 1 ELSE 0 END), 0) AS drops,
		        COALESCE(SUM(CASE WHEN kind = 'level' THEN amount ELSE 0 END), 0) AS levels
		   FROM events WHERE challenge_code = ? AND rsn = ?`)
		.bind(code, rsn).first();

	let purples = 0;
	const raidModes = {};
	if (typeOf(rules) === 'RAID')
	{
		const names = new Set(JSON.parse(rules.drops).filter(rule => rule.purple)
			.map(rule => rule.name.toLowerCase()));
		const rows = await env.DB.prepare(
			`SELECT kind, item_name, SUM(amount) AS amount FROM events
			  WHERE challenge_code = ? AND rsn = ? AND kind IN ('raid', 'drop', 'claim_drop')
			  GROUP BY kind, item_name`).bind(code, rsn).all();
		for (const row of rows.results ?? [])
		{
			if (row.kind === 'raid') raidModes[row.item_name] = row.amount;
			else if (names.has(row.item_name.toLowerCase())) purples += row.amount;
		}
	}

	const countPoints = ['CLUE', 'MINIGAME'].includes(typeOf(rules)) ? totals.kc
		: Math.trunc(totals.kc / rules.kc_per) * rules.kc_points;
	return { ...totals, points: countPoints + totals.eventPoints, purples, raidModes };
}

async function setFirsts(code, request, env)
{
	const challenge = await loadChallenge(code, env);
	if (!challenge) return json({ error: 'No challenge with that code' }, 404);
	if (request.headers.get('X-Creator-Token') !== challenge.creator_token)
		return json({ error: 'Only the creator can edit first prizes' }, 403);
	const body = await readJson(request);
	if (!body?.winners || typeof body.winners !== 'object' || Array.isArray(body.winners))
		return json({ error: 'First prize winners are required' }, 400);
	const allowed = firstKeys(challenge);
	const statements = [];
	for (const [key, value] of Object.entries(body.winners))
	{
		if (!allowed.has(key)) return json({ error: 'Choose a first prize from this challenge' }, 400);
		if (value === null)
		{
			statements.push(env.DB.prepare('DELETE FROM first_prize_overrides WHERE challenge_code = ? AND prize_key = ?').bind(code, key));
			continue;
		}
		if (typeof value !== 'string' || (value.trim() && !/^[A-Za-z0-9 _-]{1,12}$/.test(value.trim())))
			return json({ error: 'Winner names must be valid RuneScape names (up to 12 characters)' }, 400);
		statements.push(env.DB.prepare(
			`INSERT INTO first_prize_overrides (challenge_code, prize_key, rsn, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(challenge_code, prize_key) DO UPDATE SET rsn = excluded.rsn, updated_at = excluded.updated_at`)
			.bind(code, key, value.trim(), Date.now()));
	}
	if (statements.length) await env.DB.batch(statements);
	return readChallenge(code, env);
}

/**
 * One participant's total and the events behind it, which is what the panel shows under "your points".
 */
async function scoreFor(code, rsn, env)
{
	const rows = await env.DB.prepare(
		`SELECT kind, item_name AS itemName, amount, points, occurred_at AS occurredAt
		   FROM events
		  WHERE challenge_code = ? AND rsn = ?
		  ORDER BY occurred_at DESC
		  LIMIT 100`)
		.bind(code, rsn)
		.all();

	const events = rows.results ?? [];

	// Taken from the participant row rather than summed from the events, because the events are only
	// half the story once a creator has been at it. Someone who sees "40" on the leaderboard and a
	// breakdown adding to 30 would reasonably think one of them was broken.
	const row = await env.DB.prepare(
		'SELECT points, adjustment FROM participants WHERE challenge_code = ? AND rsn = ?')
		.bind(code, rsn)
		.first();

	return {
		rsn,
		points: row?.points ?? events.reduce((total, event) => total + event.points, 0),
		adjustment: row?.adjustment ?? 0,
		events
	};
}

async function loadChallenge(code, env)
{
	return env.DB.prepare('SELECT * FROM challenges WHERE code = ?').bind(code).first();
}

/** Everything a participant is allowed to see. The creator token is not in here on purpose. */
function publicChallenge(row)
{
	if (!row)
	{
		return null;
	}

	return {
		code: row.code,
		name: row.name,
		boss: row.boss,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		timezone: row.timezone,
		kcPer: row.kc_per,
		kcPoints: row.kc_points,
		drops: JSON.parse(row.drops),
		creatorRsn: row.creator_rsn,
		eventType: typeOf(row),
		...optionsOf(row)
	};
}

function validateChallenge(body)
{
	if (!body || typeof body !== 'object')
	{
		return 'Missing body';
	}

	if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120)
	{
		return 'A name is required';
	}

	if (typeof body.boss !== 'string' || !body.boss.trim() || body.boss.length > 120)
	{
		return 'A challenge target is required';
	}

	if (typeof body.creatorRsn !== 'string' || !body.creatorRsn.trim())
	{
		return 'A creator name is required';
	}

	if (!Number.isFinite(body.startsAt) || !Number.isFinite(body.endsAt))
	{
		return 'A start and end time are required';
	}

	if (body.endsAt <= body.startsAt)
	{
		return 'The end time must be after the start time';
	}

	if (!Number.isFinite(body.kcPer) || body.kcPer < 1)
	{
		return 'Kill count threshold must be at least 1';
	}

	if (!Number.isFinite(body.kcPoints) || body.kcPoints < 0)
	{
		return 'Kill count points cannot be negative';
	}

	if (!Array.isArray(body.drops) || body.drops.length > 100)
	{
		return 'The drop list must contain at most 100 items';
	}

	if (body.drops.some(drop => drop?.prize != null && (typeof drop.prize !== 'string'
		|| drop.prize.trim().length > 12 || !/^[A-Za-z0-9 .,+()/-]*$/.test(drop.prize.trim()))))
		return 'Prize labels must be up to 12 characters (for example 5M or 5M GP)';
	return validateWeekly(body);
}

function normaliseDrops(drops, type)
{
	return (drops ?? [])
		.filter((drop) => drop && String(drop.name ?? '').trim())
		.map((drop) => {
			const pointsEnabled = type === 'MINIGAME' && drop.pointsEnabled === true;
			return {
				name: String(drop.name).trim(),
				itemId: Number.isFinite(drop.itemId) ? drop.itemId : -1,
				points: type === 'MINIGAME' && !pointsEnabled ? 0
					: Math.min(100000, Math.max(pointsEnabled ? 1 : 0, Math.trunc(Number(drop.points) || 0))),
				...(drop.firstPrize === true ? { firstPrize: true } : {}),
				...(drop.firstPrize === true && String(drop.prize ?? '').trim() ? { prize: String(drop.prize).trim() } : {}),
				...(pointsEnabled ? { pointsEnabled: true } : {}),
				...(drop.purple === true ? { purple: true } : {})
			};
		});
}

/**
 * A code nobody is already using. Collisions are vanishingly unlikely at a clan's scale, but "already
 * unlikely" is not the same as handled.
 */
async function unusedCode(env)
{
	for (let attempt = 0; attempt < 10; attempt++)
	{
		const code = randomCode();
		const taken = await env.DB.prepare('SELECT 1 FROM challenges WHERE code = ?').bind(code).first();

		if (!taken)
		{
			return code;
		}
	}

	throw new Error('Could not find an unused challenge code');
}

function randomCode()
{
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
	return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function randomToken()
{
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request)
{
	try
	{
		return await request.json();
	}
	catch
	{
		return null;
	}
}

function json(body, status = 200)
{
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function withCors(response)
{
	response.headers.set('Access-Control-Allow-Origin', '*');
	response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Participant-Token, X-Creator-Token');
	response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	return response;
}
