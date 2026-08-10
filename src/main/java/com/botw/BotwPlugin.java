package com.botw;

import com.botw.track.ChallengeStore;
import com.botw.track.EventSender;
import com.botw.track.KillTracker;
import com.botw.track.Outbox;
import com.google.inject.Provides;
import javax.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.events.GameStateChanged;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;

@Slf4j
@PluginDescriptor(
	name = "Boss of the Week",
	description = "Run and track clan Boss of the Week challenges",
	tags = {"boss", "clan", "event", "competition", "leaderboard", "drops", "kc"}
)
public class BotwPlugin extends Plugin
{
	@Inject
	private Client client;

	@Inject
	private EventBus eventBus;

	@Inject
	private ChallengeStore challenges;

	@Inject
	private Outbox outbox;

	@Inject
	private KillTracker killTracker;

	@Inject
	private EventSender sender;

	@Provides
	BotwConfig provideConfig(ConfigManager configManager)
	{
		return configManager.getConfig(BotwConfig.class);
	}

	@Override
	protected void startUp()
	{
		// The tracker is registered by hand rather than being a plugin of its own, so that it stops
		// listening the moment this plugin is switched off.
		eventBus.register(killTracker);

		challenges.load();
		outbox.load();
		sender.start();
	}

	@Override
	protected void shutDown()
	{
		sender.stop();
		eventBus.unregister(killTracker);
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged event)
	{
		if (event.getGameState() != GameState.LOGGED_IN)
		{
			return;
		}

		// Both are stored per account, so they cannot be read until there is an account to read them
		// for. Logging in on a second character has to swap them over, not merge them.
		challenges.load();
		outbox.load();

		// A backlog from an earlier session goes out now rather than waiting for the next timer.
		sender.flush();
	}

	/**
	 * The name points are reported under. Null until logged in, which is why nothing is sent before
	 * then — a kill by "nobody" cannot be put on a leaderboard.
	 */
	public String localPlayerName()
	{
		return client.getLocalPlayer() == null ? null : client.getLocalPlayer().getName();
	}
}
