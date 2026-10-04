/** The Discord message is owned by the service, so it keeps updating while RuneLite is closed. */

const DISCORD_COLOUR = 0x9f7839;
const MAX_ROWS = 100;
const POSTING = '__posting__';

export function validWebhookUrl(value)
{
	if (typeof value !== 'string')
	{
		return null;
	}

	try
	{
		const url = new URL(value.trim());
		if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port
			|| url.username || url.password || url.search || url.hash
			|| !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url.pathname))
		{
			return null;
		}

		return url.href;
	}
	catch
	{
		return null;
	}
}

function safeText(value)
{
	return String(value ?? '').replace(/[\\*_~`|<>@]/g, '\\$&');
}

export function hiscores(challenge, leaderboard, now = Date.now())
{
	const ranked = leaderboard.slice(0, MAX_ROWS);
	const lines = ['RANK  ADVENTURER       PTS'];
	for (let i = 0; i < ranked.length; i++)
	{
		const name = String(ranked[i].rsn ?? '').replace(/[^A-Za-z0-9 -]/g, '').slice(0, 12);
		const points = String(ranked[i].points ?? 0);
		lines.push(`${String(i + 1).padStart(3)}   ${name.padEnd(12)}  ${points.padStart(7)}`);
	}
	if (!ranked.length)
	{
		lines.push('      Awaiting challengers...');
	}
	if (leaderboard.length > MAX_ROWS)
	{
		lines.push(`      +${leaderboard.length - MAX_ROWS} more in the plugin`);
	}

	const state = JSON.stringify({
		name: challenge.name,
		boss: challenge.boss,
		code: challenge.code,
		endsAt: challenge.ends_at,
		rows: leaderboard.map(row => [row.rsn, row.points])
	});
	const description = `**${safeText(challenge.name).slice(0, 120)}**\n`
		+ `Boss: **${safeText(challenge.boss).slice(0, 120)}**  •  Code: \`${safeText(challenge.code)}\`\n\n`
		+ `\`\`\`text\n${lines.join('\n')}\n\`\`\`\n`
		+ `⏳ Ends <t:${Math.floor(challenge.ends_at / 1000)}:R>`;

	return {
		state,
		message: {
			embeds: [{
				title: '⚔️ BOSS OF THE WEEK · HISCORES',
				description,
				color: DISCORD_COLOUR,
				footer: { text: `One board, always current · Last score change ${new Date(now).toISOString()}` }
			}],
			allowed_mentions: { parse: [] }
		}
	};
}

async function discordRequest(url, method, message)
{
	const response = await fetch(url, {
		method,
		headers: message ? { 'Content-Type': 'application/json' } : undefined,
		body: message ? JSON.stringify(message) : undefined,
		redirect: 'error'
	});
	if (!response.ok)
	{
		throw new Error(`Discord returned ${response.status}`);
	}
	return method === 'DELETE' ? null : response.json();
}

export async function connectDiscord(code, webhookUrl, creatorToken, env, leaderboardFor)
{
	const url = validWebhookUrl(webhookUrl);
	if (!url)
	{
		return { status: 400, error: 'Paste a Discord channel webhook URL from discord.com' };
	}

	const challenge = await env.DB.prepare('SELECT creator_token FROM challenges WHERE code = ?')
		.bind(code).first();
	if (!challenge)
	{
		return { status: 404, error: 'No challenge with that code' };
	}
	if (!creatorToken || creatorToken !== challenge.creator_token)
	{
		return { status: 403, error: 'Only the creator can connect Discord' };
	}

	const previous = await env.DB.prepare('SELECT webhook_url FROM discord_boards WHERE challenge_code = ?')
		.bind(code).first();
	if (previous && previous.webhook_url !== url)
	{
		return { status: 409, error: 'Remove the existing Discord leaderboard before changing channels' };
	}

	// Validate the token with Discord before saving it. Never return or log the URL.
	try
	{
		await discordRequest(url, 'GET');
	}
	catch
	{
		return { status: 400, error: 'Discord did not accept that webhook URL' };
	}

	if (!previous)
	{
		await env.DB.prepare(
			'INSERT INTO discord_boards (challenge_code, webhook_url) VALUES (?, ?)')
			.bind(code, url).run();
	}

	try
	{
		await syncDiscordBoard(code, env, leaderboardFor);
		return { status: 200, enabled: true };
	}
	catch
	{
		// Keep the configuration: a temporary Discord failure can be retried by the next schedule.
		return { status: 502, error: 'Discord is connected, but the first update failed. It will retry shortly.' };
	}
}

export async function removeDiscord(code, creatorToken, env)
{
	const challenge = await env.DB.prepare('SELECT creator_token FROM challenges WHERE code = ?')
		.bind(code).first();
	if (!challenge)
	{
		return { status: 404, error: 'No challenge with that code' };
	}
	if (!creatorToken || creatorToken !== challenge.creator_token)
	{
		return { status: 403, error: 'Only the creator can remove Discord' };
	}
	const board = await env.DB.prepare('SELECT webhook_url, message_id FROM discord_boards WHERE challenge_code = ?')
		.bind(code).first();
	if (board?.message_id && board.message_id !== POSTING)
	{
		try
		{
			await discordRequest(`${board.webhook_url}/messages/${board.message_id}`, 'DELETE');
		}
		catch
		{
			// A revoked webhook cannot delete its old message. Stop updates regardless.
		}
	}
	await env.DB.prepare('DELETE FROM discord_boards WHERE challenge_code = ?').bind(code).run();
	return { status: 200, enabled: false };
}

export async function syncDiscordBoard(code, env, leaderboardFor)
{
	const board = await env.DB.prepare(
		`SELECT b.webhook_url, b.message_id, b.last_state,
		        c.code, c.name, c.boss, c.ends_at
		   FROM discord_boards b JOIN challenges c ON c.code = b.challenge_code
		  WHERE b.challenge_code = ?`)
		.bind(code).first();
	if (!board)
	{
		return;
	}
	if (board.message_id === POSTING)
	{
		return;
	}

	const { state, message } = hiscores(board, await leaderboardFor(code, env));
	if (board.message_id && board.last_state === state)
	{
		return;
	}

	if (!board.message_id)
	{
		// Claim the first post atomically. The minute cron and a creator click may run together;
		// only one of them may create the message.
		const claim = await env.DB.prepare(
			'UPDATE discord_boards SET message_id = ? WHERE challenge_code = ? AND message_id IS NULL')
			.bind(POSTING, code).run();
		if (claim.meta?.changes !== 1)
		{
			return;
		}
		try
		{
			const result = await discordRequest(`${board.webhook_url}?wait=true`, 'POST', message);
			await env.DB.prepare(
				'UPDATE discord_boards SET message_id = ?, last_state = ? WHERE challenge_code = ?')
				.bind(result.id, state, code).run();
		}
		catch (error)
		{
			await env.DB.prepare(
				'UPDATE discord_boards SET message_id = NULL WHERE challenge_code = ? AND message_id = ?')
				.bind(code, POSTING).run();
			throw error;
		}
		return;
	}

	await discordRequest(`${board.webhook_url}/messages/${board.message_id}`, 'PATCH', message);
	await env.DB.prepare(
		'UPDATE discord_boards SET last_state = ? WHERE challenge_code = ? AND message_id = ?')
		.bind(state, code, board.message_id).run();
}

export async function syncDiscordBoards(env, leaderboardFor)
{
	const rows = await env.DB.prepare(
		`SELECT b.challenge_code FROM discord_boards b
		 JOIN challenges c ON c.code = b.challenge_code WHERE c.ends_at >= ?`)
		.bind(Date.now() - 120000).all();
	for (const row of rows.results ?? [])
	{
		try
		{
			await syncDiscordBoard(row.challenge_code, env, leaderboardFor);
		}
		catch (error)
		{
			console.error(`Discord board ${row.challenge_code}: ${error.message}`);
		}
	}
}
