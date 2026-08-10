package com.botw.track;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import net.runelite.client.config.ConfigManager;

/**
 * Everything that has happened and has not reached the service yet.
 * <p>
 * Kills are written down first and sent afterwards. That ordering is the whole point: a player is
 * regularly disconnected, offline, or logging out the moment a pet drops, and none of that should
 * cost them the points. An event survives a client restart because it is written to configuration as
 * soon as it is recorded, and leaves only once the service has confirmed it.
 * <p>
 * Every event carries an id made when it happened and never changed, so sending is always safe to
 * retry. The plugin never has to work out whether a request that timed out actually landed — it sends
 * again, and the service ignores what it already has.
 */
@Slf4j
@Singleton
public class Outbox
{
	private static final String CONFIG_GROUP = "botw";
	private static final String KEY = "outbox";

	/**
	 * The service refuses more than fifty at once. Sending in batches also means a long backlog drains
	 * steadily rather than in one request that might time out and achieve nothing.
	 */
	private static final int BATCH = 25;

	/**
	 * A backlog this long means something is badly wrong — the service unreachable for days, most
	 * likely. Older events are dropped rather than growing configuration without limit.
	 */
	private static final int MAX_PENDING = 5000;

	private final ConfigManager configManager;
	private final Gson gson;

	private final List<PendingEvent> pending = new ArrayList<>();

	@Inject
	private Outbox(ConfigManager configManager, Gson gson)
	{
		this.configManager = configManager;
		this.gson = gson;
	}

	public void load()
	{
		pending.clear();

		if (configManager.getRSProfileKey() == null)
		{
			return;
		}

		String json = configManager.getRSProfileConfiguration(CONFIG_GROUP, KEY);
		if (json == null || json.isEmpty())
		{
			return;
		}

		try
		{
			Type type = new TypeToken<List<PendingEvent>>()
			{
			}.getType();

			List<PendingEvent> stored = gson.fromJson(json, type);
			if (stored != null)
			{
				pending.addAll(stored);
			}
		}
		catch (JsonSyntaxException e)
		{
			log.warn("Could not read the pending events", e);
		}

		if (!pending.isEmpty())
		{
			log.debug("{} events still to send", pending.size());
		}
	}

	private void save()
	{
		if (configManager.getRSProfileKey() == null)
		{
			return;
		}

		configManager.setRSProfileConfiguration(CONFIG_GROUP, KEY, gson.toJson(pending));
	}

	public synchronized void add(Collection<PendingEvent> events)
	{
		pending.addAll(events);

		while (pending.size() > MAX_PENDING)
		{
			pending.remove(0);
		}

		save();
	}

	public synchronized boolean isEmpty()
	{
		return pending.isEmpty();
	}

	public synchronized int size()
	{
		return pending.size();
	}

	/**
	 * The next batch to send, grouped by the challenge it belongs to.
	 * <p>
	 * Grouped because the service takes one challenge per request, and a single kill can produce events
	 * for several challenges at once when a player has joined more than one for the same boss.
	 */
	public synchronized Map<String, List<PendingEvent>> nextBatch()
	{
		Map<String, List<PendingEvent>> byChallenge = new LinkedHashMap<>();

		for (PendingEvent event : pending)
		{
			List<PendingEvent> batch =
				byChallenge.computeIfAbsent(event.getChallengeCode(), code -> new ArrayList<>());

			if (batch.size() < BATCH)
			{
				batch.add(event);
			}
		}

		return byChallenge;
	}

	/**
	 * Forgets events the service has confirmed.
	 * <p>
	 * Only called after a successful response. Anything else — a timeout, a refused connection, a
	 * server error — leaves the events exactly where they are, to be tried again.
	 */
	public synchronized void confirm(Collection<PendingEvent> sent)
	{
		List<String> ids = new ArrayList<>();
		for (PendingEvent event : sent)
		{
			ids.add(event.getId());
		}

		pending.removeIf(event -> ids.contains(event.getId()));
		save();
	}

	/**
	 * Drops everything belonging to a challenge, for when it is left or deleted. There is nobody left
	 * to report to.
	 */
	public synchronized void forget(String challengeCode)
	{
		pending.removeIf(event -> event.getChallengeCode().equalsIgnoreCase(challengeCode));
		save();
	}

	public synchronized List<PendingEvent> all()
	{
		return Collections.unmodifiableList(new ArrayList<>(pending));
	}
}
