import { Level, Tile, GameObject, SunDirection, TriangleCorner } from '../types';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SUN_DIRS: SunDirection[] = ['left', 'right', 'up', 'down'];

// Version marker: 3 bits immediately after sentinel.
// In v1 codes the bits immediately after the sentinel are width-2's high bits
// (width is 2..20 → width-2 is 0..18 → high 3 bits ∈ 0b000..0b100), so none of
// 0b111 / 0b110 / 0b101 ever appear in v1 codes and can be used as version flags.
//   0b111 = v2 (boolean edge arches)
//   0b110 = v3 (2-bit edge arch levels: 0/1/2)
//   0b101 = v4 (soulSwapEnabled header bit + soul/key footplate bits; object code 14
//               = triangle wall, decoded into the tile's `triangle` field)
const V2_MARKER = 0b111;
const V3_MARKER = 0b110;
const V4_MARKER = 0b101;

// v5 features (orange button/wall, hole, cracked tile, portal) are stored in an
// OPTIONAL extension section appended AFTER the complete v4 body. The 3-bit version
// marker space (0b101/0b110/0b111) is exhausted, so instead of a new marker we rely
// on the fact that a plain v4 code decodes to exactly its pushed bits — after reading
// the v4 body, `pos` equals the bit length. A v5 code appends `EXT_MAGIC` + a sparse
// list of the tiles carrying any v5 flag, which old decoders simply never read (they
// stop after the tile grid) and which we only emit when at least one such tile exists.
// Result: maps that use none of the new features encode byte-for-byte like before.
const EXT_MAGIC = 0b10100101; // 0xA5, 8 bits
const EXT_INDEX_BITS = 11;    // tile index r*width+c (max 33*33-1 = 1088 < 2048)
const EXT_COUNT_BITS = 11;
const EXT_FLAG_BITS = 5;      // orangeButton, orangeWall, isHole, isCrack, isPortal
// Optional sub-section (after the tile-flag list) carrying triangle-block corners:
// [TRIBLOCK_MAGIC(4)] [count(11)] [index(11) + corner(2)]*count. Gated by its own magic
// so v5 codes written before triangle blocks existed (which have no such section) still
// decode: after the tile-flag list `pos === bits.length`, so the magic check is skipped.
const TRIBLOCK_MAGIC = 0b1011; // 4 bits

const TRI_CORNERS: TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];

function pushBits(bits: number[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) {
    bits.push((value >> i) & 1);
  }
}

function readBits(bits: number[], offset: number, count: number): number {
  let val = 0;
  for (let i = 0; i < count; i++) {
    val = (val << 1) | (bits[offset + i] ?? 0);
  }
  return val;
}

function encodeTileV4(bits: number[], tile: Tile): void {
  pushBits(bits, tile.isWarm ? 1 : 0, 1);
  pushBits(bits, tile.isFlake ? 1 : 0, 1);
  pushBits(bits, tile.isGoal ? 1 : 0, 1);
  pushBits(bits, tile.isRowArch ? 1 : 0, 1);
  pushBits(bits, tile.isColumnArch ? 1 : 0, 1);
  // 2 bits per edge field: 0 = none, 1 = height-1 arch, 2 = height-2 arch.
  pushBits(bits, Math.min(3, Math.max(0, tile.edgeArchTop ?? 0)), 2);
  pushBits(bits, Math.min(3, Math.max(0, tile.edgeArchLeft ?? 0)), 2);
  // v4 footplates
  pushBits(bits, tile.isSoulSwap ? 1 : 0, 1);
  pushBits(bits, tile.isKeyTile ? 1 : 0, 1);
}

function encodeObject(bits: number[], obj: GameObject | null): void {
  if (!obj) {
    pushBits(bits, 0, 4);
    return;
  }
  switch (obj.type) {
    case 'player': pushBits(bits, 1, 4); break;
    case 'snowball': pushBits(bits, obj.size === 1 ? 2 : 3, 4); break;
    case 'snowman':
      pushBits(bits, obj.size === 1 ? 7 : obj.size === 2 ? 8 : 9, 4);
      break;
    case 'wall': pushBits(bits, 4, 4); break;
    case 'block': pushBits(bits, 5, 4); break;
    case 'tree': {
      pushBits(bits, 6, 4);
      const h = obj.treeHeight ?? 1;
      const hVal = Math.min(Math.max(Math.round(h * 2), 1), 63);
      pushBits(bits, hVal, 6);
      break;
    }
    case 'laser': {
      const dirCode = { right: 10, left: 11, up: 12, down: 13 }[obj.laserDirection ?? 'right'] ?? 10;
      pushBits(bits, dirCode, 4);
      break;
    }
  }
}

function bitsToBase62(bits: number[]): string {
  let n = 0n;
  for (const b of bits) {
    n = (n << 1n) | BigInt(b);
  }
  if (n === 0n) return BASE62[0];
  let result = '';
  while (n > 0n) {
    result = BASE62[Number(n % 62n)] + result;
    n = n / 62n;
  }
  return result;
}

function base62ToBits(str: string): number[] {
  let n = 0n;
  for (const ch of str) {
    const idx = BASE62.indexOf(ch);
    if (idx < 0) return [];
    n = n * 62n + BigInt(idx);
  }
  const bits: number[] = [];
  if (n === 0n) return [0];
  while (n > 0n) {
    bits.unshift(Number(n & 1n));
    n = n >> 1n;
  }
  return bits;
}

export function encodeLevelCode(level: Level): string {
  const bits: number[] = [];

  // Sentinel
  bits.push(1);
  // v4 marker
  pushBits(bits, V4_MARKER, 3);

  pushBits(bits, level.width - 2, 5);
  pushBits(bits, level.height - 2, 5);
  pushBits(bits, SUN_DIRS.indexOf(level.sunDirection), 2);
  pushBits(bits, level.hasShadow ? 1 : 0, 1);
  pushBits(bits, level.soulSwapEnabled ? 1 : 0, 1);

  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const tile = level.tiles[r][c];
      encodeTileV4(bits, tile);
      // Object-slot codes 14/15 are repurposed as tile markers (backward compatible
      // — pre-existing codes never emit them):
      //   14 = triangle wall (+ 2-bit corner); never co-exists with a resting object.
      //   15 = yellow button/wall (+ 2 flag bits + the nested real resting object).
      if (tile.triangle) {
        pushBits(bits, 14, 4);
        pushBits(bits, Math.max(0, TRI_CORNERS.indexOf(tile.triangle)), 2);
      } else if (tile.isYellowButton || tile.isYellowWall) {
        pushBits(bits, 15, 4);
        pushBits(bits, tile.isYellowButton ? 1 : 0, 1);
        pushBits(bits, tile.isYellowWall ? 1 : 0, 1);
        encodeObject(bits, level.objects[r][c]);
      } else {
        encodeObject(bits, level.objects[r][c]);
      }
    }
  }

  // v5 extension: sparse list of tiles carrying any new flag. Only appended when at
  // least one exists, so feature-free maps stay byte-identical to their v4 codes.
  const special: { idx: number; flags: number }[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const t = level.tiles[r][c];
      const flags =
        (t.isOrangeButton ? 1 : 0) << 4 |
        (t.isOrangeWall ? 1 : 0) << 3 |
        (t.isHole ? 1 : 0) << 2 |
        (t.isCrack ? 1 : 0) << 1 |
        (t.isPortal ? 1 : 0);
      if (flags !== 0) special.push({ idx: r * level.width + c, flags });
    }
  }
  // Triangle blocks: blocks that carry a mirror corner (stored separately since the
  // base object pass encodes them as ordinary blocks).
  const triBlocks: { idx: number; corner: number }[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (obj && obj.type === 'block' && obj.triangleCorner) {
        triBlocks.push({ idx: r * level.width + c, corner: Math.max(0, TRI_CORNERS.indexOf(obj.triangleCorner)) });
      }
    }
  }

  if (special.length > 0 || triBlocks.length > 0) {
    pushBits(bits, EXT_MAGIC, 8);
    pushBits(bits, special.length, EXT_COUNT_BITS);
    for (const s of special) {
      pushBits(bits, s.idx, EXT_INDEX_BITS);
      pushBits(bits, s.flags, EXT_FLAG_BITS);
    }
    if (triBlocks.length > 0) {
      pushBits(bits, TRIBLOCK_MAGIC, 4);
      pushBits(bits, triBlocks.length, EXT_COUNT_BITS);
      for (const t of triBlocks) {
        pushBits(bits, t.idx, EXT_INDEX_BITS);
        pushBits(bits, t.corner, 2);
      }
    }
  }

  return bitsToBase62(bits);
}

// Decode a real resting object from its 4-bit code (0–13) plus any payload,
// advancing `pos`. Used both at the top level and nested under the yellow marker.
function decodeRealObject(objType: number, bits: number[], pos: number): { obj: GameObject | null; pos: number } {
  let obj: GameObject | null = null;
  switch (objType) {
    case 0: break;
    case 1: obj = { type: 'player', size: 2, isMelting: false, createdAt: 0 }; break;
    case 2: obj = { type: 'snowball', size: 1, isMelting: false, createdAt: 0 }; break;
    case 3: obj = { type: 'snowball', size: 2, isMelting: false, createdAt: 0 }; break;
    case 4: obj = { type: 'wall', size: 100, isMelting: false, createdAt: 0 }; break;
    case 5: obj = { type: 'block', size: 1, isMelting: false, createdAt: 0 }; break;
    case 6: {
      const hVal = readBits(bits, pos, 6); pos += 6;
      const treeHeight = Math.max(hVal, 1) / 2;
      obj = { type: 'tree', size: 100, isMelting: false, treeHeight, createdAt: 0 };
      break;
    }
    case 7: obj = { type: 'snowman', size: 1, isMelting: false, createdAt: 0 }; break;
    case 8: obj = { type: 'snowman', size: 2, isMelting: false, createdAt: 0 }; break;
    case 9: obj = { type: 'snowman', size: 3, isMelting: false, createdAt: 0 }; break;
    case 10: obj = { type: 'laser', size: 1, isMelting: false, laserDirection: 'right', createdAt: 0 }; break;
    case 11: obj = { type: 'laser', size: 1, isMelting: false, laserDirection: 'left',  createdAt: 0 }; break;
    case 12: obj = { type: 'laser', size: 1, isMelting: false, laserDirection: 'up',    createdAt: 0 }; break;
    case 13: obj = { type: 'laser', size: 1, isMelting: false, laserDirection: 'down',  createdAt: 0 }; break;
    default: break;
  }
  return { obj, pos };
}

export function decodeLevelCode(code: string): Level | null {
  try {
    const bits = base62ToBits(code.trim());
    if (bits.length < 13) return null;

    const sentinel = bits.indexOf(1);
    if (sentinel < 0) return null;
    let pos = sentinel + 1;

    // Detect version by checking 3-bit marker
    const marker = readBits(bits, pos, 3);
    const isV4 = marker === V4_MARKER;
    const isV3 = marker === V3_MARKER;
    const isV2 = marker === V2_MARKER;
    const isV2OrLater = isV2 || isV3 || isV4;
    const edge2bit = isV3 || isV4;
    if (isV2OrLater) pos += 3;

    const width = readBits(bits, pos, 5) + 2; pos += 5;
    const height = readBits(bits, pos, 5) + 2; pos += 5;
    const sunIdx = readBits(bits, pos, 2); pos += 2;
    const sunDirection = SUN_DIRS[sunIdx] ?? 'left';

    if (width < 2 || width > 33 || height < 2 || height > 33) return null;

    let hasShadow = true;
    if (isV2OrLater) {
      hasShadow = readBits(bits, pos, 1) === 1; pos += 1;
    }
    let soulSwapEnabled = false;
    if (isV4) {
      soulSwapEnabled = readBits(bits, pos, 1) === 1; pos += 1;
    }

    const tiles: Tile[][] = [];
    const objects: (GameObject | null)[][] = [];

    for (let r = 0; r < height; r++) {
      tiles.push([]);
      objects.push([]);
      for (let c = 0; c < width; c++) {
        const isWarm = readBits(bits, pos, 1) === 1; pos += 1;
        const isFlake = readBits(bits, pos, 1) === 1; pos += 1;
        const isGoal = readBits(bits, pos, 1) === 1; pos += 1;
        const isRowArch = readBits(bits, pos, 1) === 1; pos += 1;
        const isColumnArch = readBits(bits, pos, 1) === 1; pos += 1;

        let edgeArchTop = 0;
        let edgeArchLeft = 0;
        if (edge2bit) {
          edgeArchTop = readBits(bits, pos, 2); pos += 2;
          edgeArchLeft = readBits(bits, pos, 2); pos += 2;
        } else if (isV2) {
          // v2: 1 bit per edge — interpret as height-1 arch
          edgeArchTop = readBits(bits, pos, 1) === 1 ? 1 : 0; pos += 1;
          edgeArchLeft = readBits(bits, pos, 1) === 1 ? 1 : 0; pos += 1;
        }

        let isSoulSwap = false;
        let isKeyTile = false;
        if (isV4) {
          isSoulSwap = readBits(bits, pos, 1) === 1; pos += 1;
          isKeyTile = readBits(bits, pos, 1) === 1; pos += 1;
        }

        const tile: Tile = {
          isWarm,
          isShade: isRowArch || isColumnArch,
          isFlake,
          isGoal,
          isRowArch,
          isColumnArch,
          edgeArchTop,
          edgeArchLeft,
          isSoulSwap,
          isKeyTile,
        };
        tiles[r].push(tile);

        const marker = readBits(bits, pos, 4); pos += 4;
        let obj: GameObject | null = null;

        if (marker === 14) {
          // Triangle wall — object-slot marker applied to the tile.
          const cornerIdx = readBits(bits, pos, 2); pos += 2;
          tile.triangle = TRI_CORNERS[cornerIdx] ?? 'tl';
        } else if (marker === 15) {
          // Yellow button/wall marker (+ flags + the nested real object).
          tile.isYellowButton = readBits(bits, pos, 1) === 1; pos += 1;
          tile.isYellowWall = readBits(bits, pos, 1) === 1; pos += 1;
          const nType = readBits(bits, pos, 4); pos += 4;
          const res = decodeRealObject(nType, bits, pos);
          obj = res.obj; pos = res.pos;
        } else {
          const res = decodeRealObject(marker, bits, pos);
          obj = res.obj; pos = res.pos;
        }

        objects[r].push(obj);
      }
    }

    // v5 extension (see EXT_MAGIC): present only if there are leftover bits beginning
    // with the magic. A plain v4 code has `pos === bits.length` here, so this is skipped.
    if (pos + 8 <= bits.length && readBits(bits, pos, 8) === EXT_MAGIC) {
      pos += 8;
      const count = readBits(bits, pos, EXT_COUNT_BITS); pos += EXT_COUNT_BITS;
      for (let i = 0; i < count; i++) {
        const idx = readBits(bits, pos, EXT_INDEX_BITS); pos += EXT_INDEX_BITS;
        const flags = readBits(bits, pos, EXT_FLAG_BITS); pos += EXT_FLAG_BITS;
        const r = Math.floor(idx / width);
        const c = idx % width;
        if (r < 0 || r >= height || c < 0 || c >= width) continue;
        const t = tiles[r][c];
        t.isOrangeButton = (flags & (1 << 4)) !== 0;
        t.isOrangeWall = (flags & (1 << 3)) !== 0;
        t.isHole = (flags & (1 << 2)) !== 0;
        t.isCrack = (flags & (1 << 1)) !== 0;
        t.isPortal = (flags & 1) !== 0;
      }

      // Optional triangle-block sub-section (gated by its own magic).
      if (pos + 4 <= bits.length && readBits(bits, pos, 4) === TRIBLOCK_MAGIC) {
        pos += 4;
        const tbCount = readBits(bits, pos, EXT_COUNT_BITS); pos += EXT_COUNT_BITS;
        for (let i = 0; i < tbCount; i++) {
          const idx = readBits(bits, pos, EXT_INDEX_BITS); pos += EXT_INDEX_BITS;
          const cornerIdx = readBits(bits, pos, 2); pos += 2;
          const r = Math.floor(idx / width);
          const c = idx % width;
          if (r < 0 || r >= height || c < 0 || c >= width) continue;
          const obj = objects[r][c];
          if (obj && obj.type === 'block') obj.triangleCorner = TRI_CORNERS[cornerIdx] ?? 'tl';
        }
      }
    }

    return { width, height, sunDirection, hasShadow, soulSwapEnabled, tiles, objects };
  } catch {
    return null;
  }
}
