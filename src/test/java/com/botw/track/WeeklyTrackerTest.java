package com.botw.track;

import com.botw.data.MinigameTarget;
import com.botw.data.WeeklyRewards;
import com.botw.data.WeeklyTargets;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import net.runelite.api.Experience;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class WeeklyTrackerTest
{
	@Test
	public void distinguishesRaidModesFromPersonalCompletionMessages()
	{
		mode("Your completed <col=ff0000>Tombs of Amascut: Expert Mode</col> count is: <col=ff0000>1,025</col>.",
			WeeklyTargets.TOA, "Expert", "1,025");
		mode("Your completed Chambers of Xeric: Challenge Mode count is: 42.",
			WeeklyTargets.COX, "Challenge", "42");
		mode("Your Theatre of Blood: Entry Mode completion count is: 7.",
			WeeklyTargets.TOB, "Entry", "7");
		mode("Your completion count for The Fractured Archive is: 3.",
			WeeklyTargets.ARCHIVE, "Normal", "3");
		assertNull(WeeklyTargets.raidMode(WeeklyTargets.TOA, "Chambers of Xeric"));
		assertFalse(WeeklyTracker.completionMessage("Friend has completed Tombs of Amascut.").matches());
	}

	@Test
	public void wintertodtDistinguishesCreditedWinsFromRewardSearches()
	{
		Matcher win = WeeklyTracker.completionMessage("Your subdued Wintertodt count is: <col=ff0000>1,035</col>.");
		assertTrue(win.matches());
		assertTrue(MinigameTarget.WINTERTODT.matchesCompletion(win.group(1)));
		assertEquals("1,035", win.group(2));
		assertFalse(MinigameTarget.TEMPOROSS.matchesCompletion(win.group(1)));
		assertTrue(MinigameTarget.WINTERTODT.matchesLoot("Reward cart (Wintertodt)"));
		assertFalse(MinigameTarget.WINTERTODT.matchesLoot("Reward pool (Tempoross)"));
		assertFalse(WeeklyTracker.completionMessage("You found some loot: Phoenix").matches());
	}

	@Test
	public void virtualLevelsDoNotEarnSkillCompetitionLevels()
	{
		assertEquals(98, WeeklyTracker.realLevel(Experience.getXpForLevel(98)));
		assertEquals(99, WeeklyTracker.realLevel(Experience.getXpForLevel(99)));
		assertEquals(99, WeeklyTracker.realLevel(Experience.MAX_SKILL_XP));
	}

	@Test
	public void matchesPersonalHallowedFloorCountsAndKeepsGauntletModesSeparate()
	{
		Matcher floor = WeeklyTracker.hallowedFloorMessage(
			"You have completed Floor 5 of the Hallowed Sepulchre! Total completions: <col=ff0000>1,203</col>.");
		assertTrue(floor.matches());
		assertEquals("5", floor.group(1));
		assertEquals("1,203", floor.group(2));
		assertFalse(WeeklyTracker.hallowedFloorMessage("You have opened the Grand Hallowed Coffin.").matches());
		assertTrue(MinigameTarget.CORRUPTED.matchesCompletion("The Corrupted Gauntlet"));
		assertFalse(MinigameTarget.GAUNTLET.matchesCompletion("The Corrupted Gauntlet"));
		assertFalse(MinigameTarget.CORRUPTED.matchesLoot("Crystalline Hunllef"));
		assertTrue(MinigameTarget.GAUNTLET.matchesLoot("Crystalline Hunllef"));
	}

	@Test
	public void volcanicMineRequiresAnExitPayoutAndCountsItOnce()
	{
		WeeklyTracker.MineRun mine = new WeeklyTracker.MineRun();
		assertFalse(mine.observe(true, 1000, 20000));
		assertFalse(mine.observe(false, 0, 20000));
		assertTrue(mine.observe(false, 0, 23850));
		assertFalse(mine.observe(false, 0, 23850));

		assertFalse(mine.observe(true, 1000, 30000));
		assertFalse(mine.observe(true, 0, 33800));
		assertTrue(mine.observe(false, 0, 33800));

		assertFalse(mine.observe(true, 1000, 40000));
		for (int tick = 0; tick < 5; tick++)
		{
			assertFalse(mine.observe(false, 0, 40000));
		}
		assertFalse(mine.observe(false, 0, 43850));
	}

	@Test
	public void everyPresetHasARealSpriteIdAndEachClueTierHasFiveDistinctItems()
	{
		for (String tier : WeeklyTargets.CLUES)
		{
			Set<Integer> sprites = new HashSet<>();
			for (String reward : WeeklyRewards.cluePrizes(tier))
			{
				int sprite = WeeklyRewards.itemId(reward);
				assertTrue(reward, sprite > 0 && sprites.add(sprite));
			}
			assertEquals(tier, 5, sprites.size());
		}
		for (MinigameTarget activity : MinigameTarget.values())
		{
			for (String reward : activity.rewards())
			{
				assertTrue(reward, WeeklyRewards.itemId(reward) > 0);
			}
		}
		for (String raid : WeeklyTargets.RAIDS)
		{
			assertTrue(raid, WeeklyRewards.itemId(WeeklyTargets.raidPet(raid)) > 0);
			for (String drop : WeeklyTargets.purpleDrops(raid))
			{
				assertTrue(drop, WeeklyRewards.itemId(drop) > 0);
			}
		}
	}

	@Test
	public void valeOfferingsScoreInWholeRollsAndVariantsKeepTheirPrizeName()
	{
		assertEquals(0, KillTracker.valeRolls(1));
		assertEquals(1, KillTracker.valeRolls(100));
		assertEquals(5, KillTracker.valeRolls(500));
		assertEquals(KillTracker.rewardName("Obligator"), KillTracker.rewardName("Obligator (uncharged)"));
		assertFalse(KillTracker.rewardName("Climbing boots").equals(KillTracker.rewardName("Climbing boots (g)")));
	}

	private static void mode(String chat, String target, String expectedMode, String expectedCount)
	{
		Matcher message = WeeklyTracker.completionMessage(chat);
		assertTrue(chat, message.matches());
		assertEquals(expectedMode, WeeklyTargets.raidMode(target, message.group(1)));
		assertEquals(expectedCount, message.group(2));
	}
}
