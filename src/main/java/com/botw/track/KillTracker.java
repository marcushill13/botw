package com.botw.track;

import com.botw.BotwConfig;
import com.botw.data.Challenge;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.ItemComposition;
import net.runelite.api.NPC;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.NpcLootReceived;
import net.runelite.client.game.ItemManager;
import net.runelite.client.game.ItemStack;
import net.runelite.client.plugins.loottracker.LootReceived;

/**
 * Watches for kills of whichever boss the joined challenges are about.
 * <p>
 * Two events are listened for because one is not enough. {@link NpcLootReceived} fires when a monster
 * dies and drops something on the floor, which covers every ordinary boss and needs nothing else
 * switched on. The loot tracker's {@link LootReceived} covers the ones that pay out through a chest
 * instead — raids, Tombs of Amascut, the Nightmare — where nothing ever dies at your feet. Listening
 * only to the first would silently ignore a raid; only to the second would require the Loot Tracker
 * plugin to be enabled, and would miss the plain cases if it were not.
 * <p>
 * Nothing is scored here. This decides what happened and hands it to the outbox; what it is worth is
 * the service's decision, and deliberately not the client's.
 */
@Slf4j
@Singleton
public class KillTracker
{
	private final Outbox outbox;
	private final ChallengeStore challenges;
	private final ItemManager itemManager;
	private final Screenshotter screenshotter;
	private final BotwConfig config;

	@Inject
	private KillTracker(
		Outbox outbox,
		ChallengeStore challenges,
		ItemManager itemManager,
		Screenshotter screenshotter,
		BotwConfig config)
	{
		this.outbox = outbox;
		this.challenges = challenges;
		this.itemManager = itemManager;
		this.screenshotter = screenshotter;
		this.config = config;
	}

	@Subscribe
	public void onNpcLootReceived(NpcLootReceived event)
	{
		NPC npc = event.getNpc();
		if (npc == null || npc.getName() == null)
		{
			return;
		}

		record(npc.getName(), event.getItems());
	}

	@Subscribe
	public void onLootReceived(LootReceived event)
	{
		if (event.getName() == null)
		{
			return;
		}

		// A chest can pay out for several kills at once; the amount says how many.
		record(event.getName(), event.getItems(), Math.max(1, event.getAmount()));
	}

	private void record(String source, Collection<ItemStack> items)
	{
		record(source, items, 1);
	}

	/**
	 * @param source the boss's name as the game gave it
	 * @param items  everything that dropped
	 * @param kills  how many kills this payout covers, which is more than one for a chest
	 */
	private void record(String source, Collection<ItemStack> items, int kills)
	{
		long now = System.currentTimeMillis();
		List<PendingEvent> recorded = new ArrayList<>();

		// One kill can matter to more than one challenge at a time, and the player should not have to
		// choose. Each joined challenge is considered on its own.
		for (Challenge challenge : challenges.joined())
		{
			if (!matches(challenge.getBoss(), source) || !challenge.isRunning(now))
			{
				continue;
			}

			for (int i = 0; i < kills; i++)
			{
				recorded.add(PendingEvent.kill(challenge.getCode(), now));
			}

			if (items != null)
			{
				for (ItemStack stack : items)
				{
					String name = itemName(stack);
					if (name != null && challenge.counts(name))
					{
						PendingEvent drop = PendingEvent.drop(
							challenge.getCode(), name, stack.getQuantity(), now);
						recorded.add(drop);

						// Only for drops that actually score. A screenshot per kill would bury the ones
						// worth keeping and fill someone's disk in a week.
						//
						// Keyed to the event, so the creator's copy is tied to the drop it is evidence
						// of rather than to a timestamp that has to be matched up by eye.
						if (config.screenshotDrops())
						{
							// The code is only passed when sharing is on. Without it the picture is
							// saved locally and goes nowhere, which is what that setting means.
							screenshotter.capture(
								challenge.getName(),
								name,
								config.shareScreenshots() ? challenge.getCode() : null,
								config.shareScreenshots() ? drop.getId() : null);
						}
					}
				}
			}
		}

		if (!recorded.isEmpty())
		{
			log.debug("Recorded {} events from {}", recorded.size(), source);
			outbox.add(recorded);
		}
	}

	/**
	 * Whether a kill of this thing counts toward a challenge for that boss.
	 * <p>
	 * Not an exact match, because the two names come from different places. A challenge says "Dagannoth
	 * Rex" while the game may hand back a form or a level suffix, and Tombs of Amascut pays out under
	 * the raid's name rather than the boss's.
	 */
	private static boolean matches(String boss, String source)
	{
		if (boss == null || source == null)
		{
			return false;
		}

		String wanted = boss.toLowerCase(Locale.ROOT).trim();
		String got = source.toLowerCase(Locale.ROOT).trim();

		return got.equals(wanted) || got.startsWith(wanted + " (") || wanted.startsWith(got + " (");
	}

	/**
	 * The item's name. Names rather than ids because that is what the creator sets the points against,
	 * and because an item can arrive under any of several ids.
	 * <p>
	 * Safe to call here: both loot events are posted on the client thread, which is the only thread
	 * allowed to read an item's composition.
	 */
	private String itemName(ItemStack stack)
	{
		if (stack == null)
		{
			return null;
		}

		ItemComposition composition = itemManager.getItemComposition(stack.getId());
		return composition == null ? null : composition.getName();
	}
}
