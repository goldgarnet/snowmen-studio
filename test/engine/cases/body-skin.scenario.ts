import { cycleSoul } from '../../../src/engine/turn';
import { applyMapSkins } from '../../../src/lib/mapSkins';
import { findPlayer } from '../../../src/utils/level';
import { gameStateFromCode } from '../../../src/utils/game';
import { decodeSolution, playMoves } from '../../../src/utils/solution';
import { encodeLevelCode } from '../../../src/utils/levelCode';
import {
  defineScenario,
  expect,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';

/**
 * Character skins for one map (lib/mapSkins.ts, user request 2026-11-25) are presentation
 * only: the engine never reads `skin`, but a body keeps it when the soul leaves or enters
 * it, so a character stays with its body.
 */

// 「먼작귀」 by 정은후 and its registered 13-move solution: the P2 melts on the last move and
// the soul jumps into the top-right snowman standing on the goal.
const MEONJAKGWI = 'uZGLPlCZfQoC9ljP3YTvAiH8JyDxOB6qiYsgK28Gt';

export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'a melted player hands its soul to the nearest snowman, which keeps its skin',
    width: 3,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 1).tile(0, 0, { isWarm: true }).snowman(0, 2, 2);
      board.level.objects[0][0]!.skin = 'hachiware';
      board.level.objects[0][0]!.isMelting = true;
      board.level.objects[0][2]!.skin = 'chiikawa';
    },
    actions: ['wait'],
    verify: (result) => {
      expectObject(result.level, 0, 2, 'player', 2);
      expect(result.level.objects[0][2]!.skin === 'chiikawa', 'the new player body is still 치이카와');
      expect(!result.level.objects[0][0], 'the melted body is gone');
    },
  }),
  defineScenario({
    name: 'the M soul cycle swaps bodies and each keeps its own skin',
    width: 3,
    height: 1,
    setup: (board) => {
      board.level.soulSwapEnabled = true;
      board.player(0, 0, 2).snowman(0, 2, 1);
      board.level.objects[0][0]!.skin = 'hachiware';
      board.level.objects[0][2]!.skin = 'usagi';
    },
    actions: [],
    verify: (result) => {
      const next = cycleSoul(result.level)!;
      expectObject(next, 0, 0, 'snowman', 2);
      expectObject(next, 0, 2, 'player', 1);
      expect(next.objects[0][0]!.skin === 'hachiware', 'the left body stays 하치와레 as a snowman');
      expect(next.objects[0][2]!.skin === 'usagi', 'the right body stays 우사기 as the player');
    },
  }),
  defineScenario({
    name: 'a soul footplate swap keeps both skins with their bodies',
    width: 3,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 2).tile(0, 1, { isSoulSwap: true }).snowman(0, 2, 2);
      board.level.objects[0][0]!.skin = 'hachiware';
      board.level.objects[0][2]!.skin = 'chiikawa';
    },
    // step on the plate (arms it), then wait on it (fires)
    actions: ['right', 'wait'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'snowman', 2);
      expectObject(result.level, 0, 2, 'player', 2);
      expect(result.level.objects[0][1]!.skin === 'hachiware', 'the body left on the plate is still 하치와레');
      expect(result.level.objects[0][2]!.skin === 'chiikawa', 'the new player body is still 치이카와');
    },
  }),
  defineScenario({
    name: '「먼작귀」 draws 하치와레 · 치이카와 · 우사기, and the 치이카와 body clears its solution',
    width: 1,
    height: 1,
    setup: () => {},
    actions: [],
    verify: () => {
      const start = applyMapSkins(gameStateFromCode(MEONJAKGWI)!.level, MEONJAKGWI);
      expect(start.objects[2][2]?.type === 'player' && start.objects[2][2]?.skin === 'hachiware', 'the player is 하치와레');
      expect(start.objects[0][2]?.skin === 'chiikawa', 'the top-right snowman is 치이카와');
      expect(start.objects[2][0]?.skin === 'usagi', 'the bottom-left snowman is 우사기');
      expect(encodeLevelCode(start) === MEONJAKGWI, 'skins are never written into the map code');
      const end = playMoves(start, decodeSolution('ULUDDRULDULWU')!);
      expectStatus({ initialLevel: start, level: end.level, status: end.status, turns: [] }, 'cleared');
      const p = findPlayer(end.level)!;
      expect(p.row === 0 && p.col === 2 && end.level.objects[0][2]!.skin === 'chiikawa', 'the soul ends in 치이카와 on the goal');
      expect(end.level.objects[2][0]!.skin === 'usagi', '우사기 is still a snowman');
      const plain = gameStateFromCode('BXgjcEyQjoMagnNfGOMN')!.level;
      applyMapSkins(plain, 'BXgjcEyQjoMagnNfGOMN');
      expect(plain.objects.every(row => row.every(o => !o?.skin)), 'other maps keep the normal look');
    },
  }),
];
