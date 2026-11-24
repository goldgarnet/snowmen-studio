import type { BodySkin, Level } from '../types';
import { decodeLevelCode, encodeLevelCode } from '../utils/levelCode';

// Character skins for single maps (presentation only). 「먼작귀」 by 정은후 (map
// f6a29f5b-80bf-4821-b866-966309a81818): the player is drawn as 하치와레 and the two
// snowmen, in reading order, as 치이카와 and 우사기 (user request 2026-11-25).
//
// The play screens only receive a map code, so a map is found by its code, compared after
// a decode/encode round trip. Once the author edits the map its code changes and the
// bodies go back to the normal look.
//
// The engine never reads `skin`. A body keeps it while it moves (the same object), and the
// soul moves in turn.ts (soulTransfer, doSoulSwap) copy it to the rebuilt body, so a
// character stays with its body when the soul leaves or enters it. Snowmen built during
// play get no skin.
const SKINNED_MAPS: { code: string; player: BodySkin; snowmen: BodySkin[] }[] = [
  { code: 'uZGLPlCZfQoC9ljP3YTvAiH8JyDxOB6qiYsgK28Gt', player: 'hachiware', snowmen: ['chiikawa', 'usagi'] },
];

function canonicalCode(code: string): string | null {
  const level = decodeLevelCode(code.trim());
  return level ? encodeLevelCode(level) : null;
}

let canonicalEntries: { code: string | null; entry: (typeof SKINNED_MAPS)[number] }[] | null = null;

function skinsForCode(code: string): (typeof SKINNED_MAPS)[number] | null {
  canonicalEntries ??= SKINNED_MAPS.map(entry => ({ code: canonicalCode(entry.code), entry }));
  const canonical = canonicalCode(code);
  if (!canonical) return null;
  return canonicalEntries.find(candidate => candidate.code === canonical)?.entry ?? null;
}

/** Tags the authored bodies of a skinned map in place and returns the same level. */
export function applyMapSkins<T extends Level | null | undefined>(level: T, code: string): T {
  if (!level) return level;
  const entry = skinsForCode(code);
  if (!entry) return level;
  let snowman = 0;
  for (const row of level.objects) {
    for (const obj of row) {
      if (!obj || obj.skin) continue;
      if (obj.type === 'player') obj.skin = entry.player;
      else if (obj.type === 'snowman' && snowman < entry.snowmen.length) obj.skin = entry.snowmen[snowman++];
    }
  }
  return level;
}
