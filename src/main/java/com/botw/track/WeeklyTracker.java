package com.botw.track;

import com.botw.data.Challenge;
import com.botw.data.ChallengeType;
import com.botw.data.WeeklyTargets;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.inject.Inject;
import javax.inject.Singleton;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.api.Experience;
import net.runelite.api.GameState;
import net.runelite.api.Skill;
import net.runelite.api.events.ChatMessage;
import net.runelite.api.events.GameTick;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.util.Text;

@Singleton
public class WeeklyTracker
{
	private static final long XP_BATCH_MS = 60_000;
	private static final Pattern COMPLETION = Pattern.compile(
		"^Your (?:completion count for |completed )?(.+?) (?:(?:kill|completion) )?(?:count )?is: *([0-9,]+)\\.?$",
		Pattern.CASE_INSENSITIVE);
	private static final Pattern RIFTS = Pattern.compile(
		"^Amount of Rifts you have closed: ([0-9,]+)\\.$", Pattern.CASE_INSENSITIVE);

	private final Client client;
	private final ChallengeStore challenges;
	private final Outbox outbox;
	private final Map<String, XpBatch> xp = new HashMap<>();

	@Inject
	WeeklyTracker(Client client, ChallengeStore challenges, Outbox outbox)
	{
		this.client = client;
		this.challenges = challenges;
		this.outbox = outbox;
	}

	@Subscribe
	public void onGameTick(GameTick tick)
	{
		if (client.getGameState() != GameState.LOGGED_IN || client.getLocalPlayer() == null)
		{
			return;
		}
		if (!WeeklyTargets.tracksWorld(client))
		{
			reset();
			return;
		}
		long now = System.currentTimeMillis();
		Set<String> running = new HashSet<>();
		List<PendingEvent> recorded = new ArrayList<>();
		for (Challenge challenge : challenges.joined())
		{
			if (challenge.getEventType() != ChallengeType.SKILL || !challenge.isRunning(now))
			{
				continue;
			}
			Skill skill = WeeklyTargets.skill(challenge.getBoss());
			if (skill == null) continue;
			int current = client.getSkillExperience(skill);
			if (current < 0) continue;
			String code = challenge.getCode();
			running.add(code);
			XpBatch batch = xp.get(code);
			if (batch == null || batch.skill != skill || batch.previous > current
				|| batch.lastObserved < challenge.getStartsAt() || batch.lastObserved > challenge.getEndsAt())
			{
				if (batch != null) batch.drain(code, recorded);
				xp.put(code, new XpBatch(skill, current, now));
				continue;
			}
			batch.lastObserved = now;
			if (current > batch.previous)
			{
				if (batch.gain == 0) batch.firstGain = now;
				batch.gain += current - batch.previous;
				batch.levels += realLevel(current) - realLevel(batch.previous);
				batch.previous = current;
				batch.lastGain = now;
			}
			if (batch.gain > 0 && now - batch.firstGain >= XP_BATCH_MS)
			{
				batch.drain(code, recorded);
			}
		}
		Iterator<Map.Entry<String, XpBatch>> entries = xp.entrySet().iterator();
		while (entries.hasNext())
		{
			Map.Entry<String, XpBatch> entry = entries.next();
			if (!running.contains(entry.getKey()))
			{
				entry.getValue().drain(entry.getKey(), recorded);
				entries.remove();
			}
		}
		if (!recorded.isEmpty()) outbox.add(recorded);
	}

	/** Flush XP before a login can replace the account's outbox. */
	public void reset()
	{
		List<PendingEvent> recorded = new ArrayList<>();
		xp.forEach((code, batch) -> batch.drain(code, recorded));
		xp.clear();
		if (!recorded.isEmpty()) outbox.add(recorded);
	}

	@Subscribe
	public void onChatMessage(ChatMessage event)
	{
		if (event.getType() != ChatMessageType.GAMEMESSAGE && event.getType() != ChatMessageType.SPAM)
		{
			return;
		}
		String message = Text.removeTags(event.getMessage());
		Matcher raid = completionMessage(event.getMessage());
		Matcher rift = RIFTS.matcher(message);
		boolean completion = raid.matches();
		boolean riftClosed = rift.matches();
		if ((!completion && !riftClosed) || client.getLocalPlayer() == null || !WeeklyTargets.tracksWorld(client)) return;

		long now = System.currentTimeMillis();
		List<PendingEvent> recorded = new ArrayList<>();
		for (Challenge challenge : challenges.joined())
		{
			if (!challenge.isRunning(now)) continue;
			if (completion && challenge.getEventType() == ChallengeType.RAID)
			{
				String mode = WeeklyTargets.raidMode(challenge.getBoss(), raid.group(1));
				if (mode != null) recorded.add(count(challenge, "raid", mode, raid.group(2), now));
			}
			else if (riftClosed && challenge.getEventType() == ChallengeType.MINIGAME)
			{
				recorded.add(count(challenge, "kc", null, rift.group(1), now));
			}
		}
		if (!recorded.isEmpty()) outbox.add(recorded);
	}

	static Matcher completionMessage(String message)
	{
		return COMPLETION.matcher(Text.removeTags(message));
	}

	static int realLevel(int xp)
	{
		return Math.min(Experience.MAX_REAL_LEVEL, Experience.getLevelForXp(xp));
	}

	/** The lifetime total identifies a single completion, even if its message is repeated. */
	private PendingEvent count(Challenge challenge, String kind, String mode, String lifetime, long now)
	{
		String key = challenge.getCode() + ":" + client.getAccountHash() + ":" + kind + ":" + mode
			+ ":" + lifetime.replace(",", "");
		String id = UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
		return new PendingEvent(challenge.getCode(), id, kind, mode, 1, now);
	}

	private static final class XpBatch
	{
		private final Skill skill;
		private int previous;
		private int gain;
		private int levels;
		private long lastObserved;
		private long firstGain;
		private long lastGain;

		private XpBatch(Skill skill, int previous, long now)
		{
			this.skill = skill;
			this.previous = previous;
			this.lastObserved = now;
		}

		private void drain(String code, List<PendingEvent> recorded)
		{
			if (gain == 0) return;
			recorded.add(new PendingEvent(code, UUID.randomUUID().toString(), "xp", skill.getName(), gain, lastGain));
			if (levels > 0)
			{
				recorded.add(new PendingEvent(code, UUID.randomUUID().toString(), "level", skill.getName(), levels, lastGain));
			}
			gain = 0;
			levels = 0;
		}
	}
}
