import { presentation } from './weekly.js';
import { boardTheme } from './board-themes.js';
import { boardArtwork } from './board-icons.js';

/** A small dependency-free PNG renderer for a parchment-style Discord board.
 *  Discord cannot style an embed's background or font, so the artwork is attached to the
 *  same webhook message and replaced when the board changes. No image hosting is needed.
 */

export const MAX_IMAGE_ROWS = 25;
const WIDTH = 440;
const INK = 9;
const MUTED_INK = 10;
const PODIUM_INK = 11;
const ACCENT = 12;
const SHADE = 13;
const GOLD = 15;
const STRIPE = 16;
const LIGHT_TEXT = 17;
const MEDALLION = 18;

function mix(base, tint, amount)
{
	return base.map((value, i) => Math.round(value * (1 - amount) + tint[i] * amount));
}

function themedPalette(colour)
{
	const accent = [colour >> 16, colour >> 8 & 255, colour & 255];
	return [
		mix([24, 23, 24], accent, .12), mix([43, 41, 42], accent, .16),
		mix([66, 63, 62], accent, .25), mix([70, 52, 33], accent, .45),
		mix([155, 119, 65], accent, .37), mix([206, 164, 100], accent, .24),
		mix([230, 205, 155], accent, .14), mix([243, 221, 175], accent, .10),
		mix([204, 168, 109], accent, .18), [43, 32, 24], mix([53, 42, 34], accent, .24),
		mix([45, 29, 20], accent, .40), accent, mix([38, 28, 27], accent, .55),
		mix([252, 246, 226], accent, .42), [246, 199, 103],
		mix([240, 221, 181], accent, .10), [251, 234, 191], mix([243, 223, 181], accent, .25)
	];
}
const GRAIN = new Uint8Array(32 * 32);
let grainSeed = 247;
for (let i = 0; i < GRAIN.length; i++)
{
	grainSeed ^= grainSeed << 13;
	grainSeed ^= grainSeed >>> 17;
	grainSeed ^= grainSeed << 5;
	GRAIN[i] = grainSeed & 255;
}
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC_TABLE.length; i++)
{
	let value = i;
	for (let bit = 0; bit < 8; bit++)
	{
		value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
	}
	CRC_TABLE[i] = value >>> 0;
}

// Five-pixel glyphs, seven rows high. The classic small bitmap shape reads well on parchment.
const FONT = {
	'A': '0e11111f111111', 'B': '1e111e1111111e', 'C': '0e11101010110e',
	'D': '1e11111111111e', 'E': '1f101e1010101f', 'F': '1f101e10101010',
	'G': '0e11101711110e', 'H': '11111f11111111', 'I': '0e04040404040e',
	'J': '0702020202120c', 'K': '11121418141211', 'L': '1010101010101f',
	'M': '111b1515111111', 'N': '11191513111111', 'O': '0e11111111110e',
	'P': '1e11111e101010', 'Q': '0e11111115120d', 'R': '1e11111e141211',
	'S': '0f10100e01011e', 'T': '1f040404040404', 'U': '1111111111110e',
	'V': '11111111110a04', 'W': '1111111515150a', 'X': '11110a040a1111',
	'Y': '11110a04040404', 'Z': '1f01020408101f',
	'0': '0e11131519110e', '1': '040c040404040e', '2': '0e11010204081f',
	'3': '1e01010e01011e', '4': '02060a121f0202', '5': '1f101e0101011e',
	'6': '0e10101e11110e', '7': '1f010204080808', '8': '0e11110e11110e',
	'9': '0e11110f01010e',
	'o': '00000e1111110e', 'd': '01010d1311130d', 'e': '00000e111f100f',
	' ': '00000000000000', '-': '0000001f000000', '.': '00000000000004',
	':': '00040000040000', '/': '01010204081010', '?': '0e110102040004',
	'+': '0004041f040400', "'": '04040800000000', ',': '00000000000408',
	'(': '02040808080402', ')': '08040202020408', '&': '0c12140c15120d',
	'!': '04040404040004', '_': '0000000000001f'
};

function textWidth(value, scale)
{
	return Math.max(0, [...String(value)].length * 6 - 1) * scale;
}

function setPixel(pixels, height, x, y, colour)
{
	if (x >= 0 && y >= 0 && x < WIDTH && y < height)
	{
		pixels[y * WIDTH + x] = colour;
	}
}

function rect(pixels, height, x, y, width, tall, colour)
{
	for (let py = Math.max(0, y); py < Math.min(height, y + tall); py++)
	{
		pixels.fill(colour, py * WIDTH + Math.max(0, x), py * WIDTH + Math.min(WIDTH, x + width));
	}
}

function write(pixels, height, value, x, y, colour = INK, scale = 2, preserveCase = false)
{
	for (const character of preserveCase ? String(value) : String(value).toUpperCase())
	{
		const glyph = FONT[character] ?? FONT['?'];
		for (let gy = 0; gy < 7; gy++)
		{
			const bits = parseInt(glyph.slice(gy * 2, gy * 2 + 2), 16);
			for (let gx = 0; gx < 5; gx++)
			{
				if (bits & (1 << (4 - gx)))
				{
					rect(pixels, height, x + gx * scale, y + gy * scale, scale, scale, colour);
				}
			}
		}
		x += 6 * scale;
	}
}

function centered(pixels, height, value, y, colour, scale = 2)
{
	write(pixels, height, value, Math.floor((WIDTH - textWidth(value, scale)) / 2), y, colour, scale);
}

function fit(value, limit)
{
	const letters = [...String(value ?? '').replace(/\s+/g, ' ').trim()];
	return letters.length <= limit ? letters.join('') : letters.slice(0, limit - 3).join('').trimEnd() + '...';
}

function diamond(pixels, height, x, y, radius, colour)
{
	for (let row = -radius; row <= radius; row++)
	{
		const span = radius - Math.abs(row);
		rect(pixels, height, x - span, y + row, 2 * span + 1, 1, colour);
	}
}

function artwork(pixels, height, palette, theme, challenge)
{
	// A lighter inset keeps the dark outlines on the game sprites legible.
	const x = WIDTH / 2;
	const y = 88;
	for (let dy = -26; dy <= 26; dy++)
	{
		const span = Math.min(26, 42 - Math.abs(dy));
		rect(pixels, height, x - span, y + dy, 2 * span + 1, 1, SHADE);
		if (Math.abs(dy) < 25)
		{
			rect(pixels, height, x - span + 2, y + dy, 2 * span - 3, 1,
				Math.abs(dy) >= 22 ? ACCENT : MEDALLION);
			setPixel(pixels, height, x - span + 2, y + dy, ACCENT);
			setPixel(pixels, height, x + span - 2, y + dy, ACCENT);
		}
	}

	const sprite = boardArtwork(challenge);
	const offset = palette.length - 1; // Sprite palette index 0 is transparent.
	palette.push(...sprite.colours);
	const left = x - Math.floor(sprite.width / 2);
	const top = y - Math.floor(sprite.height / 2);
	let position = 0;
	for (const packed of sprite.runs)
	{
		const index = packed & 63;
		const length = (packed >>> 6) + 1;
		if (!index)
		{
			position += length;
			continue;
		}
		for (let i = 0; i < length; i++, position++)
		{
			setPixel(pixels, height, left + position % sprite.width,
				top + Math.floor(position / sprite.width), offset + index);
		}
	}

	for (const [start, end] of [[58, 180], [260, WIDTH - 58]])
	{
		const middle = (start + end) / 2;
		rect(pixels, height, start, y, end - start + 1, 1, ACCENT);
		diamond(pixels, height, start, y, 2, ACCENT);
		diamond(pixels, height, end, y, 2, ACCENT);
		if (theme.clue)
		{
			diamond(pixels, height, middle, y, 14, SHADE);
			write(pixels, height, '?', middle - 5, y - 7, GOLD);
		}
		else
		{
			diamond(pixels, height, middle, y, 8, SHADE);
			diamond(pixels, height, middle, y, 4, GOLD);
		}
	}
}

function checksum(bytes)
{
	let crc = 0xffffffff;
	for (const byte of bytes)
	{
		crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value)
{
	return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
}

function chunk(name, data)
{
	const type = new TextEncoder().encode(name);
	const body = new Uint8Array(type.length + data.length);
	body.set(type);
	body.set(data, type.length);
	const result = new Uint8Array(12 + data.length);
	result.set(uint32(data.length));
	result.set(body, 4);
	result.set(uint32(checksum(body)), 8 + data.length);
	return result;
}

function join(chunks)
{
	const bytes = new Uint8Array(chunks.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of chunks)
	{
		bytes.set(part, offset);
		offset += part.length;
	}
	return bytes;
}

function deflateStored(raw)
{
	// PNG accepts uncompressed DEFLATE blocks inside its zlib stream. This avoids
	// expensive per-minute compression on the Workers Free CPU allowance.
	const blocks = Math.ceil(raw.length / 65535);
	const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
	out[0] = 0x78;
	out[1] = 0x01;
	let offset = 2;
	let a = 1;
	let b = 0;
	for (let start = 0; start < raw.length; start += 65535)
	{
		const length = Math.min(65535, raw.length - start);
		out[offset++] = start + length === raw.length ? 1 : 0;
		out[offset++] = length & 255;
		out[offset++] = length >>> 8;
		out[offset++] = (~length) & 255;
		out[offset++] = ((~length) >>> 8) & 255;
		out.set(raw.subarray(start, start + length), offset);
		offset += length;
		for (let i = start; i < start + length; i++)
		{
			a += raw[i];
			b += a;
			if ((i & 4095) === 4095)
			{
				a %= 65521;
				b %= 65521;
			}
		}
	}
	out.set(uint32(((b % 65521) << 16) | (a % 65521)), offset);
	return out;
}

function png(pixels, height, palette)
{
	const scanlines = new Uint8Array(height * (WIDTH + 1));
	for (let y = 0; y < height; y++)
	{
		scanlines.set(pixels.subarray(y * WIDTH, (y + 1) * WIDTH), y * (WIDTH + 1) + 1);
	}
	const compressed = deflateStored(scanlines);
	const header = new Uint8Array(13);
	header.set(uint32(WIDTH));
	header.set(uint32(height), 4);
	header[8] = 8; // Indexed palette, eight bits per pixel.
	header[9] = 3;
	return join([
		Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
		chunk('IHDR', header),
		chunk('PLTE', Uint8Array.from(palette.flat())),
		chunk('IDAT', compressed),
		chunk('IEND', new Uint8Array())
	]);
}

export function boardImage(challenge, leaderboard, rankLimit = MAX_IMAGE_ROWS)
{
	const rows = leaderboard.slice(0, rankLimit);
	const theme = boardTheme(challenge);
	const palette = themedPalette(theme.colour);
	const height = 282 + Math.max(1, rows.length) * 21;
	const pixels = new Uint8Array(WIDTH * height);

	// Rough stone framing and an uneven, flecked sheet of parchment.
	for (let y = 0; y < height; y++)
	{
		const left = 24 + (y * 37 % 11) / 3 | 0;
		const right = WIDTH - 24 - (y * 19 % 13) / 3 | 0;
		const paper = y >= 24 && y < height - 25;
		const grainRow = (y & 31) * 32;
		const pixelRow = y * WIDTH;
		for (let x = 0; x < WIDTH; x++)
		{
			const grain = GRAIN[grainRow + (x & 31)];
			let colour = grain < 22 ? 1 : grain < 25 ? 2 : 0;
			if (paper && x >= left && x < right)
			{
				colour = x - left < 12 || right - x < 12 ? 4
					: grain < 3 ? 8 : grain < 30 ? 7 : 6;
			}
			pixels[pixelRow + x] = colour;
		}
	}
	// Rolled top and bottom edges, with worn highlights.
	for (const y of [13, height - 36])
	{
		rect(pixels, height, 20, y + 4, WIDTH - 40, 19, 3);
		rect(pixels, height, 17, y, WIDTH - 34, 11, 5);
		rect(pixels, height, 30, y + 3, WIDTH - 60, 3, 7);
		rect(pixels, height, 20, y + 20, WIDTH - 40, 3, 4);
	}

	const display = presentation(challenge);
	centered(pixels, height, `${display.title} HISCORES`, 39, INK);
	artwork(pixels, height, palette, theme, challenge);
	const target = fit(challenge.boss || display.target, 29);
	const targetScale = textWidth(target, 3) <= WIDTH - 92 ? 3 : 2;
	centered(pixels, height, target, targetScale === 3 ? 125 : 129, SHADE, targetScale);
	const event = fit(challenge.name, 29);
	if (event && event.toLowerCase() !== target.toLowerCase())
	{
		centered(pixels, height, event, 153, MUTED_INK, 1);
	}
	else
	{
		diamond(pixels, height, WIDTH / 2, 157, 3, ACCENT);
	}

	rect(pixels, height, 41, 175, WIDTH - 82, 23, SHADE);
	rect(pixels, height, 41, 175, WIDTH - 82, 2, ACCENT);
	write(pixels, height, 'RANK', 49, 181, LIGHT_TEXT);
	write(pixels, height, 'NAME', 117, 181, LIGHT_TEXT);
	write(pixels, height, display.score, 383 - textWidth(display.score, 2), 181, LIGHT_TEXT);

	if (!rows.length)
	{
		centered(pixels, height, 'AWAITING CHALLENGERS', 211, MUTED_INK);
	}
	for (let i = 0; i < rows.length; i++)
	{
		const y = 206 + i * 21;
		if (i % 2 === 0) rect(pixels, height, 41, y - 3, WIDTH - 82, 20, STRIPE);
		if (i < 3) diamond(pixels, height, 88, y + 6, 3, ACCENT);
		const colour = i < 3 ? PODIUM_INK : INK;
		write(pixels, height, String(i + 1).padStart(2), 53, y, colour);
		write(pixels, height, String(rows[i].rsn ?? '').slice(0, 12), 117, y);
		const points = Number(rows[i].points ?? 0).toLocaleString('en-US');
		write(pixels, height, points, 383 - textWidth(points, 2), y, colour);
	}

	const footerY = height - 64;
	rect(pixels, height, 54, footerY - 7, WIDTH - 108, 1, ACCENT);
	if (leaderboard.length > rows.length)
	{
		const note = `+${leaderboard.length - rows.length} MORE IN RUNELITE`;
		centered(pixels, height, note, footerY, MUTED_INK);
	}
	else
	{
		const note = `Code: ${String(challenge.code ?? '').slice(0, 8)}`;
		write(pixels, height, note, Math.floor((WIDTH - textWidth(note, 1)) / 2), footerY + 3, MUTED_INK, 1, true);
	}
	return png(pixels, height, palette);
}
