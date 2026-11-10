import { typeOf } from './weekly.js';

export const BOARD_STYLE = 6;

// Target-specific pigment and crest, independent of scores or challenge code.
const SKILLS = {
	Attack: [0xb54942, 'sword'],
	Defence: [0x4976a3, 'shield'],
	Strength: [0x43895c, 'fist'],
	Hitpoints: [0xa9415e, 'heart'],
	Ranged: [0x6c883f, 'bow'],
	Prayer: [0x8472ad, 'star'],
	Magic: [0x6b5bbb, 'book'],
	Cooking: [0x9d537d, 'pot'],
	Woodcutting: [0x3e784c, 'tree'],
	Fletching: [0x927041, 'arrow'],
	Fishing: [0x32869a, 'fish'],
	Firemaking: [0xb95c30, 'flame'],
	Crafting: [0x9e7442, 'needle'],
	Smithing: [0x795954, 'anvil'],
	Mining: [0x576e86, 'pickaxe'],
	Herblore: [0x39864b, 'leaf'],
	Agility: [0x3b7d9f, 'runner'],
	Thieving: [0x884c9b, 'mask'],
	Slayer: [0xa34943, 'skull'],
	Farming: [0x679044, 'sprout'],
	Runecraft: [0xa88837, 'rune'],
	Hunter: [0x8c603d, 'paw'],
	Construction: [0xa16b3e, 'hammer'],
	Sailing: [0x377f95, 'sail']
};

const CLUES = {
	Beginner: [0x987746, 'plainChest'],
	Easy: [0x49815c, 'boundChest'],
	Medium: [0x4b75a6, 'chest'],
	Hard: [0xa75246, 'ironChest'],
	Elite: [0x8558a3, 'gemChest'],
	Master: [0x9d7026, 'masterChest']
};

const RAIDS = {
	'Chambers of Xeric': [0x547747, 'dragon'],
	'Theatre of Blood': [0xa03450, 'chalice'],
	'Tombs of Amascut': [0xa87838, 'pyramid'],
	'The Fractured Archive': [0x627c49, 'archive']
};

const MINIGAMES = {
	'Guardians of the Rift': [0x507ba8, 'rift'],
	'Vale Totems': [0x528150, 'totem'],
	'Volcanic Mine': [0xb24d35, 'volcano'],
	'Hallowed Sepulchre': [0x6971a3, 'coffin'],
	'The Gauntlet': [0x367e9d, 'wolf'],
	'Corrupted Gauntlet': [0xb34355, 'wolf'],
	Zalcano: [0x98704a, 'golem'],
	Tempoross: [0x2e8494, 'wave']
};

const BOSSES = {
	'Abyssal Sire': [0x93475a, 'demon'],
	'Abyssal portal': [0x8b4b86, 'rift'],
	Akkha: [0x9b6f39, 'shield'],
	'Alchemical Hydra': [0x63864f, 'hydra'],
	Amoxliatl: [0x4b89ae, 'snow'],
	Araxxor: [0x77446f, 'spider'],
	Artio: [0x6e848d, 'bear'],
	'Ba-Ba': [0x967144, 'ape'],
	Bryophyta: [0x57834c, 'sprout'],
	Callisto: [0x856141, 'bear'],
	"Calvar'ion": [0xb18446, 'skull'],
	Cerberus: [0x9e433f, 'hound'],
	'Chaos Elemental': [0xa34d83, 'rift'],
	'Chaos Fanatic': [0x795591, 'book'],
	'Commander Zilyana': [0x929353, 'wing'],
	'Corporeal Beast': [0x746194, 'demon'],
	'Corrupted Hunllef': [0xac4559, 'wolf'],
	'Crazy archaeologist': [0x9a7046, 'book'],
	'Crystalline Hunllef': [0x427fa7, 'wolf'],
	'Dagannoth Prime': [0x4f759f, 'fin'],
	'Dagannoth Rex': [0x9a4a4c, 'fin'],
	'Dagannoth Supreme': [0x558864, 'fin'],
	Dawn: [0x9a7849, 'wing'],
	'Demonic gorilla': [0x8b5243, 'ape'],
	'Deranged archaeologist': [0x846750, 'book'],
	'Duke Sucellus': [0x657d49, 'eye'],
	Dusk: [0x606a88, 'wing'],
	"Elidinis' Warden": [0x537e98, 'pyramid'],
	'General Graardor': [0x778448, 'axe'],
	'Giant Mole': [0x966345, 'mole'],
	'Great Olm': [0x678b4c, 'dragon'],
	Hespori: [0x7b658c, 'sprout'],
	'Ice demon': [0x578fb2, 'snow'],
	"K'ril Tsutsaroth": [0x9f4e38, 'demon'],
	'Kalphite Queen': [0x8e8050, 'beetle'],
	Kephri: [0x8c7046, 'beetle'],
	'King Black Dragon': [0x58546f, 'hydra'],
	Kraken: [0x765b98, 'kraken'],
	"Kree'arra": [0x627b9b, 'wing'],
	'Lizardman shaman': [0x648b42, 'serpent'],
	Muttadile: [0x64875e, 'fin'],
	Nex: [0x765680, 'wing'],
	'Nylocas Vasilias': [0x6f806b, 'spider'],
	Obor: [0xa67541, 'hammer'],
	'Pestilent Bloat': [0x837b4c, 'skull'],
	'Phantom Muspah': [0x5c63a5, 'crystal'],
	"Phosani's Nightmare": [0x9c4c79, 'eye'],
	Sarachnis: [0x98643e, 'spider'],
	Scorpia: [0xa17b3e, 'scorpion'],
	Scurrius: [0x847059, 'mole'],
	'Skeletal Mystic': [0x667384, 'skull'],
	Skotizo: [0x6753a5, 'demon'],
	'Sol Heredit': [0xb1843d, 'sun'],
	Sotetseg: [0xaa4952, 'rift'],
	Spindel: [0x8b6467, 'spider'],
	Tekton: [0xb3653d, 'anvil'],
	'The Hueycoatl': [0x498a68, 'serpent'],
	'The Leviathan': [0x4b8492, 'fin'],
	'The Maiden of Sugadinti': [0x9d3b59, 'chalice'],
	'The Nightmare': [0x744c86, 'eye'],
	'The Whisperer': [0x477c79, 'kraken'],
	'Thermonuclear smoke devil': [0x7f775c, 'flame'],
	"Tumeken's Warden": [0xb6803c, 'pyramid'],
	'TzKal-Zuk': [0xb65b35, 'volcano'],
	'TzTok-Jad': [0x9e4937, 'flame'],
	Vanguard: [0x8b7651, 'golem'],
	Vardorvis: [0xa14649, 'axe'],
	'Vasa Nistirio': [0x6a66ae, 'crystal'],
	Venenatis: [0x8b474e, 'spider'],
	'Verzik Vitur': [0x90436e, 'crown'],
	Vespula: [0xa18836, 'beetle'],
	"Vet'ion": [0x754c98, 'skull'],
	Vorkath: [0x487faf, 'frostDragon'],
	Xarpus: [0x6c8349, 'wing'],
	Yama: [0xa9424e, 'demon'],
	Zalcano: [0xa26e49, 'golem'],
	Zebak: [0x467f76, 'fin'],
	Zulrah: [0x398363, 'swampSerpent']
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
	// Older or newly added bosses still get a stable colour and a combat crest.
	let hash = 0x811c9dc5;
	for (const character of name)
	{
		hash = Math.imul(hash ^ character.codePointAt(0), 0x01000193);
	}
	return [(68 + (hash & 95)) << 16 | (63 + (hash >>> 8 & 79)) << 8 | (62 + (hash >>> 16 & 95)), 'sword'];
}

export function boardTheme(challenge)
{
	const type = typeOf(challenge);
	const target = String(challenge.boss ?? '').trim().toLowerCase();
	const [colour, icon] = (Object.hasOwn(THEMES, type) && THEMES[type].get(target))
		|| (target ? fallback(target) : [0x9f7839, 'sword']);
	return { colour, icon, clue: type === 'CLUE' };
}
