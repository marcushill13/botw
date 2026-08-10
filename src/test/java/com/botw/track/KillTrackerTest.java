package com.botw.track;

import net.runelite.http.api.loottracker.LootRecordType;
import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * The two rules that decide whether something counts, both of which have been wrong at some point.
 */
public class KillTrackerTest
{
	/**
	 * The bug this was written for: one Scurrius, two kills.
	 * <p>
	 * The Loot Tracker re-announces every NPC kill as a {@code LootReceived}, so a plugin listening to
	 * both events sees an ordinary boss twice. Counting it here would double every kill count in the
	 * competition for everyone running the Loot Tracker, which is the default.
	 */
	@Test
	public void npcLootIsLeftToTheOtherListener()
	{
		assertFalse(KillTracker.countsAsKill(LootRecordType.NPC));
	}

	/** Chest payouts are the whole reason this event is listened to; nothing else reports a raid. */
	@Test
	public void chestPayoutsCount()
	{
		assertTrue(KillTracker.countsAsKill(LootRecordType.EVENT));
	}

	@Test
	public void killingPeopleAndRobbingThemAreNotBossKills()
	{
		assertFalse(KillTracker.countsAsKill(LootRecordType.PLAYER));
		assertFalse(KillTracker.countsAsKill(LootRecordType.PICKPOCKET));
	}

	@Test
	public void bossNamesMatchWhateverTheGameCallsThem()
	{
		assertTrue(KillTracker.matches("Scurrius", "Scurrius"));
		assertTrue(KillTracker.matches("scurrius", "SCURRIUS"));

		// The game adds a form or a level in brackets; the challenge does not.
		assertTrue(KillTracker.matches("Dagannoth Rex", "Dagannoth Rex (Level 303)"));
		assertTrue(KillTracker.matches("Kalphite Queen (Second form)", "Kalphite Queen"));
	}

	@Test
	public void oneBossIsNotAnother()
	{
		assertFalse(KillTracker.matches("Scurrius", "Giant rat"));
		assertFalse(KillTracker.matches("Zulrah", null));
		assertFalse(KillTracker.matches(null, "Zulrah"));

		// A prefix is not a match without the bracket: the King Black Dragon is not a black dragon.
		assertFalse(KillTracker.matches("Black dragon", "Black dragon guard"));
	}
}
