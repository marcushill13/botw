import { typeOf } from './weekly.js';
import bosses1 from './board-art/bosses-1.js';
import bosses2 from './board-art/bosses-2.js';
import bosses3 from './board-art/bosses-3.js';
import bosses4 from './board-art/bosses-4.js';
import bosses5 from './board-art/bosses-5.js';
import bosses6 from './board-art/bosses-6.js';
import clues from './board-art/clues.js';
import minigames from './board-art/minigames.js';
import raids from './board-art/raids.js';
import skills from './board-art/skills.js';

const art = {
	BOSS: { ...bosses1, ...bosses2, ...bosses3, ...bosses4, ...bosses5, ...bosses6 },
	CLUE: clues,
	MINIGAME: minigames,
	RAID: raids,
	SKILL: skills
};

export function boardArtwork(challenge)
{
	const target = String(challenge.boss ?? '').trim().toLowerCase();
	const type = typeOf(challenge);
	const catalogue = Object.hasOwn(art, type) ? art[type] : art.BOSS;
	// Newly added or custom targets can use the actual in-game combat icon.
	const encoded = Object.hasOwn(catalogue, target) ? catalogue[target] : skills.combat;
	const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
	const [width, height, colourCount] = bytes;
	const colours = Array.from({ length: colourCount }, (_, i) =>
		[bytes[3 + i * 3], bytes[4 + i * 3], bytes[5 + i * 3]]);
	return { width, height, colours, runs: bytes.subarray(3 + colourCount * 3) };
}
