package com.botw.data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import net.runelite.api.Skill;
import net.runelite.api.Client;
import net.runelite.api.WorldType;

public final class WeeklyTargets
{
	public static final String COX = "Chambers of Xeric";
	public static final String TOB = "Theatre of Blood";
	public static final String TOA = "Tombs of Amascut";
	public static final String ARCHIVE = "The Fractured Archive";
	public static final String RIFT = "Guardians of the Rift";

	public static final String[] RAIDS = { COX, TOB, TOA, ARCHIVE };
	public static final String[] CLUES = { "Beginner", "Easy", "Medium", "Hard", "Elite", "Master" };

	private WeeklyTargets()
	{
	}

	public static String[] skills()
	{
		return Arrays.stream(Skill.values()).filter(skill -> !skill.name().equals("OVERALL"))
			.map(Skill::getName).toArray(String[]::new);
	}

	public static Skill skill(String name)
	{
		return Arrays.stream(Skill.values()).filter(skill -> skill.getName().equalsIgnoreCase(name))
			.findFirst().orElse(null);
	}

	public static boolean tracksWorld(Client client)
	{
		java.util.Set<WorldType> types = client.getWorldType();
		return !types.contains(WorldType.BETA_WORLD) && !types.contains(WorldType.DEADMAN)
			&& !types.contains(WorldType.SEASONAL) && !types.contains(WorldType.TOURNAMENT_WORLD)
			&& !types.contains(WorldType.FRESH_START_WORLD);
	}

	public static List<String> modes(String target)
	{
		switch (target)
		{
			case COX: return Arrays.asList("Normal", "Challenge");
			case TOB: return Arrays.asList("Entry", "Normal", "Hard");
			case TOA: return Arrays.asList("Entry", "Normal", "Expert");
			case ARCHIVE: return Collections.singletonList("Normal");
			default: return Collections.emptyList();
		}
	}

	public static boolean raidSource(String target, String source)
	{
		String name = source.toLowerCase(Locale.ROOT);
		return name.startsWith(target.toLowerCase(Locale.ROOT))
			|| (ARCHIVE.equals(target) && name.startsWith("fractured archive"));
	}

	/** Names used in the game's completion messages. */
	public static String raidMode(String target, String source)
	{
		if (!raidSource(target, source))
		{
			return null;
		}
		String name = source.toLowerCase(Locale.ROOT);
		if (name.contains("entry") || name.contains("story")) return "Entry";
		if (TOA.equals(target) && name.contains("expert")) return "Expert";
		if (TOB.equals(target) && name.contains("hard")) return "Hard";
		if (COX.equals(target) && name.contains("challenge")) return "Challenge";
		return "Normal";
	}

	public static String[] purpleDrops(String raid)
	{
		switch (raid)
		{
			case COX:
				return new String[] {"Dexterous prayer scroll", "Arcane prayer scroll", "Twisted buckler",
					"Dragon hunter crossbow", "Dinh's bulwark", "Ancestral hat", "Ancestral robe top",
					"Ancestral robe bottom", "Dragon claws", "Elder maul", "Kodai insignia", "Twisted bow"};
			case TOB:
				return new String[] {"Avernic defender hilt", "Ghrazi rapier", "Sanguinesti staff (uncharged)",
					"Justiciar faceguard", "Justiciar chestguard", "Justiciar legguards", "Scythe of vitur (uncharged)"};
			case TOA:
				return new String[] {"Osmumten's fang", "Lightbearer", "Elidinis' ward", "Masori mask",
					"Masori body", "Masori chaps", "Tumeken's shadow (uncharged)"};
			case ARCHIVE:
				return new String[] {"Rondache", "Zorya's tome (uncharged)", "Ascension crossbows", "Obligator"};
			default: return new String[0];
		}
	}

	public static String raidPet(String raid)
	{
		switch (raid)
		{
			case COX: return "Olmlet";
			case TOB: return "Lil' zik";
			case TOA: return "Tumeken's guardian";
			case ARCHIVE: return "Orion";
			default: return "";
		}
	}
}
