/** A small dependency-free PNG renderer for a parchment-style Discord board.
 *  Discord cannot style an embed's background or font, so the artwork is attached to the
 *  same webhook message and replaced when the board changes. No image hosting is needed.
 */

export const IMAGE_ROWS = 25;
const WIDTH = 520;
const PALETTE = [
	[25, 24, 20], [48, 44, 34], [78, 70, 52], [121, 93, 51],
	[155, 119, 65], [202, 170, 109], [219, 190, 129], [226, 201, 147],
	[192, 155, 95], [49, 37, 25], [92, 66, 37], [145, 93, 37]
];
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
	' ': '00000000000000', '-': '0000001f000000', '.': '00000000000004',
	':': '00040000040000', '/': '01010204081010', '?': '0e110102040004',
	'+': '0004041f040400', "'": '04040800000000'
};

function textWidth(value, scale)
{
	return String(value).length * 6 * scale;
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

function write(pixels, height, value, x, y, colour = 9, scale = 2)
{
	for (const character of String(value).toUpperCase())
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

function png(pixels, height)
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
		chunk('PLTE', Uint8Array.from(PALETTE.flat())),
		chunk('IDAT', compressed),
		chunk('IEND', new Uint8Array())
	]);
}

export function boardImage(challenge, leaderboard)
{
	const rows = leaderboard.slice(0, IMAGE_ROWS);
	const height = 285 + Math.max(1, rows.length) * 25;
	const pixels = new Uint8Array(WIDTH * height);

	// Rough stone framing and an uneven, flecked sheet of parchment.
	for (let y = 0; y < height; y++)
	{
		for (let x = 0; x < WIDTH; x++)
		{
			const grain = GRAIN[(y & 31) * 32 + (x & 31)];
			let colour = grain < 22 ? 1 : grain < 25 ? 2 : 0;
			const left = 24 + (y * 37 % 11) / 3 | 0;
			const right = WIDTH - 24 - (y * 19 % 13) / 3 | 0;
			if (y >= 24 && y < height - 25 && x >= left && x < right)
			{
				colour = x - left < 12 || right - x < 12 ? 4
					: grain < 3 ? 8 : grain < 30 ? 7 : 6;
			}
			pixels[y * WIDTH + x] = colour;
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

	const title = 'BOSS OF THE WEEK';
	write(pixels, height, title, (WIDTH - textWidth(title, 3)) / 2, 58, 9, 3);
	const subtitle = `${String(challenge.boss ?? 'BOSS').slice(0, 20)} HISCORES`;
	write(pixels, height, subtitle, (WIDTH - textWidth(subtitle, 2)) / 2, 89, 10);
	const event = String(challenge.name ?? '').slice(0, 34);
	write(pixels, height, event, (WIDTH - textWidth(event, 2)) / 2, 120, 9);
	rect(pixels, height, 55, 146, WIDTH - 110, 2, 4);
	write(pixels, height, 'RANK', 61, 159);
	write(pixels, height, 'NAME', 138, 159);
	write(pixels, height, 'POINTS', 392, 159);
	rect(pixels, height, 55, 178, WIDTH - 110, 1, 4);

	if (!rows.length)
	{
		write(pixels, height, 'AWAITING CHALLENGERS', 115, 198, 10);
	}
	for (let i = 0; i < rows.length; i++)
	{
		const y = 194 + i * 25;
		write(pixels, height, String(i + 1).padStart(2), 70, y, i < 3 ? 11 : 9);
		write(pixels, height, String(rows[i].rsn ?? '').slice(0, 12), 138, y);
		const points = Number(rows[i].points ?? 0).toLocaleString('en-US');
		write(pixels, height, points, 460 - textWidth(points, 2), y, i < 3 ? 11 : 9);
	}

	const note = leaderboard.length > IMAGE_ROWS
		? `+${leaderboard.length - IMAGE_ROWS} MORE IN RUNELITE`
		: `CHALLENGE ${String(challenge.code ?? '').slice(0, 8)}`;
	write(pixels, height, note, (WIDTH - textWidth(note, 2)) / 2, height - 65, 10);
	return png(pixels, height);
}
