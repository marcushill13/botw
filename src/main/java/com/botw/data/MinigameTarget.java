package com.botw.data;

import java.util.Arrays;
import java.util.Locale;
import net.runelite.api.gameval.ItemID;
import net.runelite.api.gameval.VarPlayerID;

/** Activity-specific score units and the loot sources RuneLite reports. */
public enum MinigameTarget
{
	RIFT("Guardians of the Rift", "rifts", "Count a successful rift close. Reward searches are separate.",
		26822, -1, "", new String[] {"Guardians of the Rift"},
		new String[] {"Abyssal needle", "Abyssal lantern", "Abyssal protector"}, "Abyssal protector"),
	VALE("Vale Totems", "rolls", "One roll per 100 Vale offerings rummaged. Banked offerings can be used.",
		31054, -1, "", new String[] {"Vale offerings"},
		new String[] {"Fletching knife", "Bow string spool", "Greenman mask"}, ""),
	MINE("Volcanic Mine", "runs", "Count exits that award the run's Mining XP. Ore packs are separate.",
		27693, -1, "", new String[] {"Ore Pack (Volcanic Mine)"},
		new String[] {"Dragon pickaxe (broken)"}, ""),
	SEPULCHRE("Hallowed Sepulchre", "floors", "Each completed floor counts. Coffin drops are separate.",
		24711, -1, "", new String[] {"Hallowed Sepulchre Coffin", "Hallowed Sepulchre Grand Coffin", "Grand Hallowed Coffin"},
		new String[] {"Ring of endurance (uncharged)", "Strange old lockpick (full)", "Strange hallowed tome", "Giant squirrel"}, "Giant squirrel"),
	GAUNTLET("The Gauntlet", "clears", "Count regular Gauntlet clears. Corrupted has its own event.",
		23859, VarPlayerID.TOTAL_COMPLETED_GAUNTLET, "Gauntlet", new String[] {"Gauntlet", "The Gauntlet", "Crystalline Hunllef"},
		new String[] {"Enhanced crystal weapon seed", "Crystal armour seed", "Crystal weapon seed", "Youngllef"}, "Youngllef"),
	CORRUPTED("Corrupted Gauntlet", "clears", "Count Corrupted Gauntlet clears only.",
		23759, VarPlayerID.TOTAL_COMPLETED_GAUNTLET_HM, "Corrupted Gauntlet",
		new String[] {"Corrupted Gauntlet", "The Corrupted Gauntlet", "Corrupted Hunllef"},
		new String[] {"Enhanced crystal weapon seed", "Crystal armour seed", "Crystal weapon seed", "Youngllef"}, "Youngllef"),
	ZALCANO("Zalcano", "kills", "Count your credited Zalcano kills.",
		23908, VarPlayerID.TOTAL_ZALCANO_KILLS, "Zalcano", new String[] {"Zalcano"},
		new String[] {"Crystal tool seed", "Zalcano shard", "Uncut onyx", "Smolcano"}, "Smolcano"),
	TEMPOROSS("Tempoross", "wins", "Count successful Tempoross rounds. Reward permits are separate.",
		25582, VarPlayerID.TOTAL_TEMPOROSS_KILLS, "Tempoross", new String[] {"Reward pool (Tempoross)", "Casket (Tempoross)"},
		new String[] {"Fish barrel", "Tackle box", "Big harpoonfish", "Tome of Water (empty)", "Dragon harpoon", "Tiny tempor"}, "Tiny tempor"),
	WINTERTODT("Wintertodt", "wins", "Count successful Wintertodt rounds. Reward cart searches are separate.",
		ItemID.PHOENIXPET, VarPlayerID.TOTAL_WINTERTODT_KILLS, "Wintertodt",
		new String[] {"Reward cart (Wintertodt)", "Supply crate (Wintertodt)"},
		new String[] {"Phoenix", "Tome of Fire (empty)", "Bruma torch", "Warm gloves",
			"Pyromancer hood", "Pyromancer garb", "Pyromancer robe", "Pyromancer boots"}, "Phoenix");

	public final String title;
	public final String unit;
	public final String description;
	public final int icon;
	public final int varp;
	private final String completionName;
	private final String[] lootSources;
	private final String[] rewards;
	public final String pet;

	MinigameTarget(String title, String unit, String description, int icon, int varp, String completionName,
		String[] lootSources, String[] rewards, String pet)
	{
		this.title = title;
		this.unit = unit;
		this.description = description;
		this.icon = icon;
		this.varp = varp;
		this.completionName = completionName;
		this.lootSources = lootSources;
		this.rewards = rewards;
		this.pet = pet;
	}

	public static MinigameTarget forName(String name)
	{
		return Arrays.stream(values()).filter(target -> target.title.equalsIgnoreCase(name)).findFirst().orElse(null);
	}

	public static String[] names()
	{
		return Arrays.stream(values()).map(target -> target.title).toArray(String[]::new);
	}

	public boolean matchesLoot(String source)
	{
		return Arrays.stream(lootSources).anyMatch(name -> name.equalsIgnoreCase(source));
	}

	public boolean usesServerLoot()
	{
		return this == SEPULCHRE || this == GAUNTLET || this == CORRUPTED || this == ZALCANO;
	}

	public boolean matchesCompletion(String name)
	{
		return !completionName.isEmpty() && (completionName.equalsIgnoreCase(name)
			|| ("the " + completionName.toLowerCase(Locale.ROOT)).equals(name.toLowerCase(Locale.ROOT)));
	}

	public String[] rewards()
	{
		return rewards.clone();
	}
}
