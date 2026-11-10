import { typeOf } from './weekly.js';

export const BOARD_STYLE = 7;

// Target-specific pigment, independent of scores or challenge code.
const SKILLS = {
	Attack: 0xb54942,
	Defence: 0x4976a3,
	Strength: 0x43895c,
	Hitpoints: 0xa9415e,
	Ranged: 0x6c883f,
	Prayer: 0x8472ad,
	Magic: 0x6b5bbb,
	Cooking: 0x9d537d,
	Woodcutting: 0x3e784c,
	Fletching: 0x927041,
	Fishing: 0x32869a,
	Firemaking: 0xb95c30,
	Crafting: 0x9e7442,
	Smithing: 0x795954,
	Mining: 0x576e86,
	Herblore: 0x39864b,
	Agility: 0x3b7d9f,
	Thieving: 0x884c9b,
	Slayer: 0xa34943,
	Farming: 0x679044,
	Runecraft: 0xa88837,
	Hunter: 0x8c603d,
	Construction: 0xa16b3e,
	Sailing: 0x377f95
};

const CLUES = {
	Beginner: 0x987746,
	Easy: 0x49815c,
	Medium: 0x4b75a6,
	Hard: 0xa75246,
	Elite: 0x8558a3,
	Master: 0x9d7026
};

const RAIDS = {
	'Chambers of Xeric': 0x547747,
	'Theatre of Blood': 0xa03450,
	'Tombs of Amascut': 0xa87838,
	'The Fractured Archive': 0x627c49
};

const MINIGAMES = {
	'Guardians of the Rift': 0x507ba8,
	'Vale Totems': 0x528150,
	'Volcanic Mine': 0xb24d35,
	'Hallowed Sepulchre': 0x6971a3,
	'The Gauntlet': 0x367e9d,
	'Corrupted Gauntlet': 0xb34355,
	Zalcano: 0x98704a,
	Tempoross: 0x2e8494
};

const BOSSES = {
	'Abyssal Sire': 0x93475a,
	'Abyssal portal': 0x8b4b86,
	Akkha: 0x9b6f39,
	'Alchemical Hydra': 0x63864f,
	Amoxliatl: 0x4b89ae,
	Araxxor: 0x77446f,
	Artio: 0x6e848d,
	'Ba-Ba': 0x967144,
	Bryophyta: 0x57834c,
	Callisto: 0x856141,
	"Calvar'ion": 0xb18446,
	Cerberus: 0x9e433f,
	'Chaos Elemental': 0xa34d83,
	'Chaos Fanatic': 0x795591,
	'Commander Zilyana': 0x929353,
	'Corporeal Beast': 0x746194,
	'Corrupted Hunllef': 0xac4559,
	'Crazy archaeologist': 0x9a7046,
	'Crystalline Hunllef': 0x427fa7,
	'Dagannoth Prime': 0x4f759f,
	'Dagannoth Rex': 0x9a4a4c,
	'Dagannoth Supreme': 0x558864,
	Dawn: 0x9a7849,
	'Demonic gorilla': 0x8b5243,
	'Deranged archaeologist': 0x846750,
	'Duke Sucellus': 0x657d49,
	Dusk: 0x606a88,
	"Elidinis' Warden": 0x537e98,
	'General Graardor': 0x778448,
	'Giant Mole': 0x966345,
	'Great Olm': 0x678b4c,
	Hespori: 0x7b658c,
	'Ice demon': 0x578fb2,
	"K'ril Tsutsaroth": 0x9f4e38,
	'Kalphite Queen': 0x8e8050,
	Kephri: 0x8c7046,
	'King Black Dragon': 0x58546f,
	Kraken: 0x765b98,
	"Kree'arra": 0x627b9b,
	'Lizardman shaman': 0x648b42,
	Muttadile: 0x64875e,
	Nex: 0x765680,
	'Nylocas Vasilias': 0x6f806b,
	Obor: 0xa67541,
	'Pestilent Bloat': 0x837b4c,
	'Phantom Muspah': 0x5c63a5,
	"Phosani's Nightmare": 0x9c4c79,
	Sarachnis: 0x98643e,
	Scorpia: 0xa17b3e,
	Scurrius: 0x847059,
	'Skeletal Mystic': 0x667384,
	Skotizo: 0x6753a5,
	'Sol Heredit': 0xb1843d,
	Sotetseg: 0xaa4952,
	Spindel: 0x8b6467,
	Tekton: 0xb3653d,
	'The Hueycoatl': 0x498a68,
	'The Leviathan': 0x4b8492,
	'The Maiden of Sugadinti': 0x9d3b59,
	'The Nightmare': 0x744c86,
	'The Whisperer': 0x477c79,
	'Thermonuclear smoke devil': 0x7f775c,
	"Tumeken's Warden": 0xb6803c,
	'TzKal-Zuk': 0xb65b35,
	'TzTok-Jad': 0x9e4937,
	Vanguard: 0x8b7651,
	Vardorvis: 0xa14649,
	'Vasa Nistirio': 0x6a66ae,
	Venenatis: 0x8b474e,
	'Verzik Vitur': 0x90436e,
	Vespula: 0xa18836,
	"Vet'ion": 0x754c98,
	Vorkath: 0x487faf,
	Xarpus: 0x6c8349,
	Yama: 0xa9424e,
	Zalcano: 0xa26e49,
	Zebak: 0x467f76,
	Zulrah: 0x398363
};

const catalogue = entries => new Map(Object.entries(entries).map(([name, style]) => [name.toLowerCase(), style]));
const THEMES = {
	BOSS: catalogue(BOSSES),
	RAID: catalogue(RAIDS),
	SKILL: catalogue(SKILLS),
	CLUE: catalogue(CLUES),
	MINIGAME: catalogue(MINIGAMES)
};

function fallback(name)
{
	// Older or newly added bosses still get a stable colour.
	let hash = 0x811c9dc5;
	for (const character of name)
	{
		hash = Math.imul(hash ^ character.codePointAt(0), 0x01000193);
	}
	return (68 + (hash & 95)) << 16 | (63 + (hash >>> 8 & 79)) << 8 | (62 + (hash >>> 16 & 95));
}

export function boardTheme(challenge)
{
	const type = typeOf(challenge);
	const target = String(challenge.boss ?? '').trim().toLowerCase();
	const colour = (Object.hasOwn(THEMES, type) && THEMES[type].get(target))
		|| (target ? fallback(target) : 0x9f7839);
	return { colour, clue: type === 'CLUE' };
}
