package com.botw.data;

import java.util.Locale;
import java.util.Map;
import net.runelite.api.gameval.ItemID;

/** OSRS item IDs for preset sprites, including items that cannot be traded on the GE. */
public final class WeeklyRewards
{
	private static final Map<String, Integer> IDS = Map.ofEntries(
		Map.entry("3rd age amulet", 10344),
		Map.entry("3rd age axe", 20011),
		Map.entry("3rd age bow", 12424),
		Map.entry("3rd age cloak", 12437),
		Map.entry("3rd age druidic robe bottoms", 23339),
		Map.entry("3rd age druidic robe top", 23336),
		Map.entry("3rd age kiteshield", 10352),
		Map.entry("3rd age longsword", 12426),
		Map.entry("3rd age pickaxe", 20014),
		Map.entry("3rd age platebody", 10348),
		Map.entry("3rd age platelegs", 10346),
		Map.entry("3rd age robe top", 10338),
		Map.entry("3rd age wand", 12422),
		Map.entry("abyssal lantern", 26822),
		Map.entry("abyssal needle", 26813),
		Map.entry("abyssal protector", 26901),
		Map.entry("ancestral hat", 21018),
		Map.entry("ancestral robe bottom", 21024),
		Map.entry("ancestral robe top", 21021),
		Map.entry("aranea boots", 29806),
		Map.entry("arcane prayer scroll", 21079),
		Map.entry("ascension crossbows", 34681),
		Map.entry("avernic defender hilt", 22477),
		Map.entry("basilisk jaw", 24268),
		Map.entry("big harpoonfish", 25559),
		Map.entry("black pickaxe", 12297),
		Map.entry("bloodhound", 19730),
		Map.entry("bow string spool", 31052),
		Map.entry("bruma torch", ItemID.WINT_TORCH),
		Map.entry("cape of skulls", 23351),
		Map.entry("climbing boots (g)", 23413),
		Map.entry("crystal armour seed", 23956),
		Map.entry("crystal tool seed", 23953),
		Map.entry("crystal weapon seed", 4207),
		Map.entry("dexterous prayer scroll", 21034),
		Map.entry("dinh's bulwark", 21015),
		Map.entry("dragon claws", 13652),
		Map.entry("dragon harpoon", 21028),
		Map.entry("dragon hunter crossbow", 21012),
		Map.entry("dragon pickaxe (broken)", 27695),
		Map.entry("elder maul", 21003),
		Map.entry("elidinis' ward", 25985),
		Map.entry("enhanced crystal weapon seed", 25859),
		Map.entry("fish barrel", 25582),
		Map.entry("flared trousers", 10394),
		Map.entry("fletching knife", 31043),
		Map.entry("fragment of burning fire", 34677),
		Map.entry("fragment of deep water", 34673),
		Map.entry("fragment of living earth", 34671),
		Map.entry("fragment of whispering wind", 34675),
		Map.entry("ghrazi rapier", 22324),
		Map.entry("giant squirrel", 20659),
		Map.entry("greenman mask", 31034),
		Map.entry("ham joint", 23360),
		Map.entry("holy sandals", 12598),
		Map.entry("horn of bran", 34679),
		Map.entry("horn of plenty", 31241),
		Map.entry("horn of plenty (empty)", 31243),
		Map.entry("imbued heart", 20724),
		Map.entry("justiciar chestguard", 22327),
		Map.entry("justiciar faceguard", 22326),
		Map.entry("justiciar legguards", 22328),
		Map.entry("kodai insignia", 21043),
		Map.entry("lightbearer", 25975),
		Map.entry("lil' zik", 22473),
		Map.entry("masori body", 27229),
		Map.entry("masori chaps", 27232),
		Map.entry("masori mask", 27226),
		Map.entry("monk's robe (t)", 23306),
		Map.entry("monk's robe top (t)", 23303),
		Map.entry("obligator", 34715),
		Map.entry("obligator (uncharged)", 34717),
		Map.entry("olmlet", 20851),
		Map.entry("orion", 34646),
		Map.entry("osmumten's fang", 26219),
		Map.entry("pet kraken", 12655),
		Map.entry("phoenix", ItemID.PHOENIXPET),
		Map.entry("pyromancer boots", ItemID.PYROMANCER_BOOTS),
		Map.entry("pyromancer garb", ItemID.PYROMANCER_TOP),
		Map.entry("pyromancer hood", ItemID.PYROMANCER_HOOD),
		Map.entry("pyromancer robe", ItemID.PYROMANCER_BOTTOM),
		Map.entry("ranger boots", 2577),
		Map.entry("ring of endurance (uncharged)", 24844),
		Map.entry("ring of nature", 20005),
		Map.entry("rondache", 34719),
		Map.entry("rune scimitar ornament kit (zamorak)", 23327),
		Map.entry("sanguinesti staff (uncharged)", 22481),
		Map.entry("scythe of vitur (uncharged)", 22486),
		Map.entry("shoulder parrot", 23300),
		Map.entry("smolcano", 23760),
		Map.entry("spiked manacles", 23389),
		Map.entry("strange hallowed tome", 24761),
		Map.entry("strange old lockpick (full)", 24740),
		Map.entry("tackle box", 25580),
		Map.entry("team cape x", 20214),
		Map.entry("team cape zero", 20211),
		Map.entry("tiny tempor", 25602),
		Map.entry("tome of fire (empty)", ItemID.TOME_OF_FIRE_UNCHARGED),
		Map.entry("tome of water (empty)", 25576),
		Map.entry("tumeken's guardian", 27352),
		Map.entry("tumeken's shadow (uncharged)", 27277),
		Map.entry("twisted bow", 20997),
		Map.entry("twisted buckler", 21000),
		Map.entry("uncut onyx", 6571),
		Map.entry("warm gloves", ItemID.PYROMANCER_GLOVES),
		Map.entry("wizard boots", 2579),
		Map.entry("youngllef", 23757),
		Map.entry("zalcano shard", 23908),
		Map.entry("zorya's tome (uncharged)", 34727));

	private WeeklyRewards()
	{
	}

	public static int itemId(String name)
	{
		return name == null ? -1 : IDS.getOrDefault(name.toLowerCase(Locale.ROOT), -1);
	}

	public static int spriteId(DropRule rule)
	{
		int preset = itemId(rule.getName());
		return preset > 0 ? preset : rule.getItemId();
	}

	public static String[] cluePrizes(String tier)
	{
		switch (tier)
		{
			case "Beginner": return new String[] {"Black pickaxe", "Shoulder parrot", "Monk's robe top (t)", "Monk's robe (t)", "Rune scimitar ornament kit (Zamorak)"};
			case "Easy": return new String[] {"Cape of skulls", "Team cape zero", "Ham joint", "Flared trousers", "Team cape x"};
			case "Medium": return new String[] {"Ranger boots", "Holy sandals", "Spiked manacles", "Wizard boots", "Climbing boots (g)"};
			case "Hard": return new String[] {"3rd Age platebody", "3rd Age robe top", "3rd Age kiteshield", "3rd Age platelegs", "3rd Age amulet"};
			case "Elite": return new String[] {"3rd Age longsword", "3rd Age bow", "3rd Age wand", "3rd Age cloak", "Ring of nature"};
			case "Master": return new String[] {"3rd Age pickaxe", "3rd Age axe", "3rd Age druidic robe top", "3rd Age druidic robe bottoms", "Bloodhound"};
			default: return new String[0];
		}
	}

	public static int clueIcon(String tier)
	{
		switch (tier)
		{
			case "Beginner": return 23245;
			case "Easy": return 20546;
			case "Medium": return 20545;
			case "Hard": return 20544;
			case "Elite": return 20543;
			case "Master": return 19836;
			default: return 20545;
		}
	}
}
