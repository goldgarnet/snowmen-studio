import type { Direction, TriangleCorner } from '../../../src/types';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  type ScenarioDefinition,
  type ScenarioResult,
} from '../harness';

/**
 * User decision 2026-11-09 (「세 모퉁이」, "아래로 밀면 쪼개져야지"):
 *  1. Whichever ball of the pushed line (A, B, C…) rests in a triangle cell and is pushed
 *     toward that cell's solid leg, the line turns there with the mirror. The members beyond
 *     it are looked up along the turned direction and the straight-line push table applies
 *     unchanged along the bent line. Only snowballs turn.
 *     - Turned exit closed (wall, board edge, another triangle's leg): as on a straight line.
 *       A in the triangle → A crushes / splits; B in the triangle → A climbs onto B and a
 *       snowman is built in B's cell.
 *  2. B-028's second rule is reverted: seen from outside, a leg is a wall (crush / split /
 *     build as before B-028). See b028-triangle-always-push.scenario.ts.
 */

const DELTA: Record<Direction, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const SOLID: Record<TriangleCorner, Direction[]> = {
  tl: ['up', 'left'], tr: ['up', 'right'], bl: ['down', 'left'], br: ['down', 'right'],
};
const TURN: Record<TriangleCorner, Partial<Record<Direction, Direction>>> = {
  br: { down: 'left', right: 'up' },
  bl: { down: 'right', left: 'up' },
  tl: { up: 'right', left: 'down' },
  tr: { up: 'left', right: 'down' },
};
const OPP: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const step = (r: number, c: number, d: Direction): [number, number] => [r + DELTA[d][0], c + DELTA[d][1]];
const CORNERS: TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];
const LEG_CASES = CORNERS.flatMap(corner => SOLID[corner].map(leg => ({ corner, leg, exit: TURN[corner][leg]! })));

function expectFlake(result: ScenarioResult, row: number, col: number, flake: boolean, what: string): void {
  expect(!!result.level.tiles[row][col].isFlake === flake, `${what}: (${row}, ${col}) flake should be ${flake}`);
}

function expectNoOp(result: ScenarioResult): void {
  const shape = (level: ScenarioResult['level']) =>
    level.objects.map(row => row.map(o => (o ? `${o.type}${o.size}` : '.')).join(' ')).join('\n');
  const after = shape(result.level);
  expect(shape(result.initialLevel) === after, `the push must change nothing:\n${after}`);
  expect(JSON.stringify(result.initialLevel.tiles) === JSON.stringify(result.level.tiles), 'no tile may change (no flake)');
}

/**
 * B (s1) rests in `corner` at (2,2); A (s1) and the player stand straight behind it on the
 * side opposite `leg`, so the push runs toward B's solid leg and turns to `exit`.
 */
function behindB(leg: Direction) {
  const [ar, ac] = step(2, 2, OPP[leg]);
  const [pr, pc] = step(ar, ac, OPP[leg]);
  return { ar, ac, pr, pc };
}

const bBendScenarios = LEG_CASES.flatMap(({ corner, leg, exit }) => {
  const { ar, ac, pr, pc } = behindB(leg);
  const [er, ec] = step(2, 2, exit);
  return [
    defineScenario({
      name: `bend-line: P2 pushes s1 + s1 in ${corner} ${leg}: B turns ${exit}, A takes B's cell`,
      width: 5, height: 5,
      setup: (board) => {
        board.tile(2, 2, { triangle: corner }).snowball(2, 2, 1).snowball(ar, ac, 1).player(pr, pc, 2);
      },
      actions: [leg],
      verify: (result) => {
        expectObject(result.level, er, ec, 'snowball', 1);
        expectObject(result.level, 2, 2, 'snowball', 1);
        expectObject(result.level, ar, ac, 'player', 2);
        expectEmpty(result.level, pr, pc);
      },
    }),
    defineScenario({
      name: `bend-line: P2 pushes s1 + s1 in ${corner} ${leg}, wall on the turned exit: snowman in B's cell`,
      width: 5, height: 5,
      setup: (board) => {
        board.tile(2, 2, { triangle: corner }).snowball(2, 2, 1).snowball(ar, ac, 1).player(pr, pc, 2)
          .object(er, ec, 'wall', 100);
      },
      actions: [leg],
      verify: (result) => {
        expectObject(result.level, 2, 2, 'snowman', 1);
        expectObject(result.level, ar, ac, 'player', 2);
        expectObject(result.level, er, ec, 'wall');
      },
    }),
  ];
});

const aBendScenarios = LEG_CASES.map(({ corner, leg, exit }) => {
  const [pr, pc] = step(2, 2, OPP[leg]);
  const [er, ec] = step(2, 2, exit);
  const [fr, fc] = step(er, ec, exit);
  return defineScenario({
    name: `bend-line (B-013 kept): P2 pushes s1 in ${corner} ${leg} with a ball on the exit: both move ${exit}`,
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: corner }).snowball(2, 2, 1).snowball(er, ec, 1).player(pr, pc, 2);
    },
    actions: [leg],
    verify: (result) => {
      expectObject(result.level, fr, fc, 'snowball', 1);
      expectObject(result.level, er, ec, 'snowball', 1);
      expectObject(result.level, 2, 2, 'player', 2);
    },
  });
});

export const scenarios: ScenarioDefinition[] = [
  // ===== the two reports from 「세 모퉁이」 =====
  defineScenario({
    name: 'bend-line repro 1 「세 모퉁이」: B in ◤ turns right onto the green button, A takes ◤, no snowman',
    width: 7, height: 7,
    setup: (board) => {
      board.player(5, 3, 2).snowball(4, 3, 1).tile(3, 3, { triangle: 'tl' }).snowball(3, 3, 1)
        .tile(3, 4, { isKeyTile: true });
    },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 3, 4, 'snowball', 1);
      expectObject(result.level, 3, 3, 'snowball', 1);
      expectObject(result.level, 4, 3, 'player', 2);
      expectEmpty(result.level, 5, 3);
    },
  }),
  defineScenario({
    name: 'bend-line repro 2 「세 모퉁이」: s2 pushed down onto the ◤ top leg from outside splits left and right',
    width: 7, height: 7,
    setup: (board) => { board.player(1, 3, 2).snowball(2, 3, 2).tile(3, 3, { triangle: 'tl' }); },
    actions: ['down'],
    verify: (result) => {
      expectEmpty(result.level, 2, 3);
      expectObject(result.level, 2, 2, 'snowball', 1);
      expectObject(result.level, 2, 4, 'snowball', 1);
      expectObject(result.level, 1, 3, 'player', 2);
    },
  }),

  // ===== B turns: every triangle × every solid leg =====
  ...bBendScenarios,
  ...aBendScenarios,

  defineScenario({
    name: 'bend-line: B in ◤ turned onto the board edge: snowman in B\'s cell',
    width: 3, height: 4,
    setup: (board) => { board.tile(1, 2, { triangle: 'tl' }).snowball(1, 2, 1).snowball(2, 2, 1).player(3, 2, 2); },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'snowman', 1);
      expectObject(result.level, 2, 2, 'player', 2);
    },
  }),
  defineScenario({
    name: 'bend-line: B in ◤ turned onto another triangle leg (a wall): snowman in B\'s cell',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 1).player(4, 2, 2)
        .tile(2, 3, { triangle: 'bl' });
    },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 2, 'snowman', 1);
      expectObject(result.level, 3, 2, 'player', 2);
    },
  }),
  defineScenario({
    name: 'bend-line: P3 pushes s2 + s2 in ◤, turned exit walled: size-3 snowman in B\'s cell',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 2).snowball(3, 2, 2).player(4, 2, 3)
        .object(2, 3, 'wall', 100);
    },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 2, 'snowman', 3);
      expectObject(result.level, 3, 2, 'player', 3);
    },
  }),
  defineScenario({
    name: 'bend-line: P2 pushes s1 + s1 in ◤, a wall straight ahead behind the leg does not back B: B turns and moves',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 1).player(4, 2, 2)
        .object(1, 2, 'wall', 100);
    },
    actions: ['up'],
    // The wall straight ahead of B is behind its own leg and no longer matters.
    verify: (result) => {
      expectObject(result.level, 2, 3, 'snowball', 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
      expectObject(result.level, 3, 2, 'player', 2);
    },
  }),

  // ===== both A and B in triangles: two turns =====
  defineScenario({
    name: 'bend-line: A in ◥ turns down, B in ◣ turns right: the line bends twice and moves one cell',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 0, 2).tile(2, 1, { triangle: 'tr' }).snowball(2, 1, 1)
        .tile(3, 1, { triangle: 'bl' }).snowball(3, 1, 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 3, 2, 'snowball', 1);
      expectObject(result.level, 3, 1, 'snowball', 1);
      expectObject(result.level, 2, 1, 'player', 2);
      expectEmpty(result.level, 2, 0);
    },
  }),
  defineScenario({
    name: 'bend-line: two turns, the second exit walled: snowman in B\'s cell (◣)',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 0, 2).tile(2, 1, { triangle: 'tr' }).snowball(2, 1, 1)
        .tile(3, 1, { triangle: 'bl' }).snowball(3, 1, 1).object(3, 2, 'wall', 100);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 3, 1, 'snowman', 1);
      expectObject(result.level, 2, 1, 'player', 2);
    },
  }),

  // ===== mass =====
  defineScenario({
    name: 'bend-line: P2 cannot push s1 + bent s1 + s1 (too heavy): no-op',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 1).player(4, 2, 2)
        .snowball(2, 3, 1);
    },
    actions: ['up'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'bend-line: P2 cannot push s1 + bent s2 with an open exit: no-op',
    width: 5, height: 5,
    setup: (board) => { board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 2).snowball(3, 2, 1).player(4, 2, 2); },
    actions: ['up'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'bend-line: P2 builds an S2 from s1 + bent s2 whose turned exit is walled',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 2).snowball(3, 2, 1).player(4, 2, 2)
        .object(2, 3, 'wall', 100);
    },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 2, 'snowman', 2);
      expectObject(result.level, 3, 2, 'player', 2);
    },
  }),

  // ===== blocks do not turn =====
  defineScenario({
    name: 'bend-line: a block in ◤ does not turn; P3 presses the s1 against it and the s1 crushes',
    width: 5, height: 5,
    setup: (board) => { board.tile(2, 2, { triangle: 'tl' }).object(2, 2, 'block', 1).snowball(3, 2, 1).player(4, 2, 3); },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 2, 'block', 1);
      expectEmpty(result.level, 3, 2);
      expectFlake(result, 3, 2, true, 'crushed against the stuck block');
      expectObject(result.level, 4, 2, 'player', 3);
    },
  }),
  defineScenario({
    name: 'bend-line: P3 pushes a ◤ ball whose turned exit holds a block: both move along the turn',
    width: 5, height: 5,
    setup: (board) => { board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).object(2, 3, 'block', 1).player(3, 2, 3); },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 4, 'block', 1);
      expectObject(result.level, 2, 3, 'snowball', 1);
      expectObject(result.level, 2, 2, 'player', 3);
    },
  }),

  // ===== P1 and P3 =====
  defineScenario({
    name: 'bend-line: P1 cannot push s1 + bent s1 with an open exit: no-op',
    width: 5, height: 5,
    setup: (board) => { board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 1).player(4, 2, 1); },
    actions: ['up'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'bend-line: P1 builds an S1 in ◤ when the turned exit is walled',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 1).player(4, 2, 1)
        .object(2, 3, 'wall', 100);
    },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 2, 'snowman', 1);
      expectObject(result.level, 3, 2, 'player', 1);
    },
  }),
  defineScenario({
    name: 'bend-line: P3 rolls s1 + bent s1: the pair rolls around the ◤ to the board edge',
    width: 5, height: 5,
    setup: (board) => { board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 1).player(4, 2, 3); },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 4, 'snowball', 1);
      expectObject(result.level, 2, 3, 'snowball', 1);
      expectEmpty(result.level, 2, 2);
      expectObject(result.level, 3, 2, 'player', 3);
    },
  }),
  defineScenario({
    name: 'bend-line: P3 pushes s1 + bent s1 + s1 one cell along the turn',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 1).player(4, 2, 3)
        .snowball(2, 3, 1);
    },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 4, 'snowball', 1);
      expectObject(result.level, 2, 3, 'snowball', 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
      expectObject(result.level, 3, 2, 'player', 3);
    },
  }),
  defineScenario({
    name: 'bend-line: P3 pushes s2 + bent s1 one cell along the turn',
    width: 5, height: 5,
    setup: (board) => { board.tile(2, 2, { triangle: 'tl' }).snowball(2, 2, 1).snowball(3, 2, 2).player(4, 2, 3); },
    actions: ['up'],
    verify: (result) => {
      expectObject(result.level, 2, 3, 'snowball', 1);
      expectObject(result.level, 2, 2, 'snowball', 2);
      expectObject(result.level, 3, 2, 'player', 3);
    },
  }),

  // ===== outside a triangle the leg is a wall again (B-028 rule 2 reverted) =====
  defineScenario({
    name: 'bend-line: P1 builds a snowman against a leg from outside (unchanged)',
    width: 5, height: 3,
    setup: (board) => { board.player(1, 0, 1).snowball(1, 1, 1).snowball(1, 2, 1).tile(1, 3, { triangle: 'bl' }); },
    actions: ['right'],
    verify: (result) => { expectObject(result.level, 1, 2, 'snowman', 1); },
  }),
  defineScenario({
    name: 'bend-line: P3 s2 pressed down onto a ◤ top leg splits like against a wall',
    width: 5, height: 4,
    setup: (board) => { board.player(0, 2, 3).snowball(1, 2, 2).tile(2, 2, { triangle: 'tl' }); },
    actions: ['down'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'snowball', 1);
      expectObject(result.level, 1, 3, 'snowball', 1);
      expectEmpty(result.level, 1, 2);
    },
  }),
];
