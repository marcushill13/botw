package com.botw.track;

import com.botw.data.WeeklyTargets;
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
	public void virtualLevelsDoNotEarnSkillCompetitionLevels()
	{
		assertEquals(98, WeeklyTracker.realLevel(Experience.getXpForLevel(98)));
		assertEquals(99, WeeklyTracker.realLevel(Experience.getXpForLevel(99)));
		assertEquals(99, WeeklyTracker.realLevel(Experience.MAX_SKILL_XP));
	}

	private static void mode(String chat, String target, String expectedMode, String expectedCount)
	{
		Matcher message = WeeklyTracker.completionMessage(chat);
		assertTrue(chat, message.matches());
		assertEquals(expectedMode, WeeklyTargets.raidMode(target, message.group(1)));
		assertEquals(expectedCount, message.group(2));
	}
}
