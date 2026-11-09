import type { Direction, TriangleCorner } from '../../../src/types';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  type ScenarioBoard,
  type ScenarioDefinition,
  type ScenarioResult,
} from '../harness';

/**
 * B-028 — user decision (2026-11-09): "a triangle wall is always a push, a triangle wall
 * never splits".
 *  1. A split half that shoves a snowball resting in a triangle cell toward the cell's
 *     solid leg shoves it one cell around the mirror (as B-013 does for the player). If the
 *     turned cell is closed, the half stays in the origin cell as before. Blocks and lasers
 *     do not turn.
 *  2. A triangle leg is not a backer for a crush or a split: a ball pressed against a leg
 *     from outside the triangle cell does nothing. Building a snowman against a leg is
 *     unchanged, and so are the other terrain backers (tunnel side, arch, closed yellow).
 *  3. Unchanged: a ball turned by its own mirror into a wall or the board edge still
 *     crushes ("이런 건 눈꽃으로 변하는 게 맞아"). If the turned exit is another triangle's
 *     leg, rule 2 applies and nothing happens.
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

function expectFlake(result: ScenarioResult, row: number, col: number, flake: boolean, what: string): void {
  expect(!!result.level.tiles[row][col].isFlake === flake, `${what}: (${row}, ${col}) flake should be ${flake}`);
}

function expectNoOp(result: ScenarioResult): void {
  const shape = (level: ScenarioResult['level']) =>
    level.objects.map(row => row.map(o => (o ? `${o.type}${o.size}` : '.')).join(' ')).join('\n');
  const before = shape(result.initialLevel);
  const after = shape(result.level);
  expect(before === after, `the push must change nothing:\n${after}`);
  expect(JSON.stringify(result.initialLevel.tiles) === JSON.stringify(result.level.tiles), 'no tile may change (no flake)');
}

// ===== 1. split half shoves a triangle ball around the mirror =====
// For every triangle and every solid leg `h`: a size-2 ball at (2,2) is split by a push
// perpendicular to h, so one half moves h into the triangle cell and must shove its ball
// out across the leg — which now turns.
const HALF_CASES: { corner: TriangleCorner; h: Direction }[] = (['tl', 'tr', 'bl', 'br'] as TriangleCorner[])
  .flatMap(corner => SOLID[corner].map(h => ({ corner, h })));

function splitBoard(board: ScenarioBoard, corner: TriangleCorner, h: Direction): Direction {
  const push: Direction = h === 'up' || h === 'down' ? 'right' : 'down';
  const [pr, pc] = step(2, 2, OPP[push]);
  const [wr, wc] = step(2, 2, push);
  const [tr, tc] = step(2, 2, h);
  board.player(pr, pc, 2).snowball(2, 2, 2).object(wr, wc, 'wall', 100)
    .tile(tr, tc, { triangle: corner }).snowball(tr, tc, 1);
  return push;
}

const halfScenarios = HALF_CASES.flatMap(({ corner, h }) => {
  const [tr, tc] = step(2, 2, h);
  const turn = TURN[corner][h]!;
  const [dr, dc] = step(tr, tc, turn);
  const [or, oc] = step(2, 2, OPP[h]);
  const push: Direction = h === 'up' || h === 'down' ? 'right' : 'down';
  return [
    defineScenario({
      name: `B-028 split half moving ${h} into ${corner} shoves its ball ${turn} around the mirror`,
      width: 5, height: 5,
      setup: (board) => { splitBoard(board, corner, h); },
      actions: [push],
      verify: (result) => {
        expectObject(result.level, dr, dc, 'snowball', 1);
        expectObject(result.level, tr, tc, 'snowball', 1);
        expectObject(result.level, or, oc, 'snowball', 1);
        expectEmpty(result.level, 2, 2);
      },
    }),
    defineScenario({
      name: `B-028 split half into ${corner} (${h}): a wall on the turned cell keeps the half in the middle`,
      width: 5, height: 5,
      setup: (board) => { splitBoard(board, corner, h); board.object(dr, dc, 'wall', 100); },
      actions: [push],
      verify: (result) => {
        expectObject(result.level, tr, tc, 'snowball', 1);
        expectObject(result.level, 2, 2, 'snowball', 1);
        expectObject(result.level, or, oc, 'snowball', 1);
        expectObject(result.level, dr, dc, 'wall');
      },
    }),
  ];
});

export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'B-028 repro 「세 모퉁이」: the upper half shoves the ◥ ball left and takes its place',
    width: 7, height: 7,
    setup: (board) => {
      board.player(2, 4, 2).snowball(2, 5, 2).tile(2, 5, { isKeyTile: true })
        .tile(1, 5, { triangle: 'tr' }).snowball(1, 5, 1)
        .tile(3, 5, { triangle: 'br' }).object(2, 6, 'wall', 100);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 4, 'snowball', 1);
      expectObject(result.level, 1, 5, 'snowball', 1);
      expectObject(result.level, 3, 5, 'snowball', 1);
      expectEmpty(result.level, 2, 5);
      expectObject(result.level, 2, 4, 'player', 2);
    },
  }),
  ...halfScenarios,
  defineScenario({
    name: 'B-028 split half: ◥ by the board edge turns its ball off the board, the half stays',
    width: 4, height: 3,
    setup: (board) => {
      board.player(1, 1, 2).snowball(1, 0, 2).tile(0, 0, { triangle: 'tr' }).snowball(0, 0, 1);
    },
    actions: ['left'],
    verify: (result) => {
      // P2 presses the s2 at (1,0) into the left edge: split up/down. The upper half
      // would shove the ◥ ball up, which turns left off the board, so it stays.
      expectObject(result.level, 0, 0, 'snowball', 1);
      expectObject(result.level, 1, 0, 'snowball', 1);
      expectObject(result.level, 2, 0, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-028 split half: both halves blocked (turned exit off the board, wall below) make a snowman as before',
    width: 3, height: 3,
    setup: (board) => {
      board.tile(0, 0, { triangle: 'tr' }).snowball(0, 0, 1).snowball(1, 0, 2)
        .player(1, 1, 2).object(2, 0, 'wall', 100);
    },
    actions: ['left'],
    verify: (result) => {
      expectObject(result.level, 0, 0, 'snowball', 1);
      expectObject(result.level, 1, 0, 'snowman', 1);
      expectObject(result.level, 2, 0, 'wall');
    },
  }),
  defineScenario({
    name: 'B-028 split half: another object on the turned cell keeps the half in the middle',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 1, 2).snowball(2, 2, 2).object(2, 3, 'wall', 100)
        .tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).object(1, 1, 'block', 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'snowball', 1);
      expectObject(result.level, 1, 1, 'block', 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
      expectObject(result.level, 3, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-028 split half: another triangle leg on the turned cell keeps the half in the middle',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 1, 2).snowball(2, 2, 2).object(2, 3, 'wall', 100)
        .tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).tile(1, 1, { triangle: 'br' });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'snowball', 1);
      expectEmpty(result.level, 1, 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
      expectObject(result.level, 3, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-028 split half: a size-1 tunnel across the turned path keeps the half in the middle',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 1, 2).snowball(2, 2, 2).object(2, 3, 'wall', 100)
        .tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).tile(1, 1, { isRowArch: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'snowball', 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-028 split half: a block in a triangle cell does not turn, the half stays',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 1, 2).snowball(2, 2, 2).object(2, 3, 'wall', 100)
        .tile(1, 2, { triangle: 'tr' }).object(1, 2, 'block', 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'block', 1);
      expectEmpty(result.level, 1, 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
      expectObject(result.level, 3, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-028 split half: a snowman in a triangle cell does not turn, the half stays',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 1, 2).snowball(2, 2, 2).object(2, 3, 'wall', 100)
        .tile(1, 2, { triangle: 'tr' }).snowman(1, 2, 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'snowman', 1);
      expectEmpty(result.level, 1, 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-028 split half: the shoved triangle ball eats a flake on the turned cell',
    width: 5, height: 5,
    setup: (board) => {
      board.player(2, 1, 2).snowball(2, 2, 2).object(2, 3, 'wall', 100)
        .tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).tile(1, 1, { isFlake: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'snowball', 2);
      expectFlake(result, 1, 1, false, 'flake eaten');
      expectObject(result.level, 1, 2, 'snowball', 1);
      expectEmpty(result.level, 2, 2);
    },
  }),

  // ===== 2. a triangle leg is not a backer for crush / split =====
  ...([1, 2, 3] as const).map(ps => defineScenario({
    name: `B-028 P${ps} pushes s1 against a triangle leg from outside: nothing happens`,
    width: 5, height: 3,
    setup: (board) => { board.tile(1, 3, { triangle: 'tl' }).snowball(1, 2, 1).player(1, 1, ps); },
    actions: ['right'],
    verify: (result) => expectNoOp(result),
  })),
  ...([2, 3] as const).map(ps => defineScenario({
    name: `B-028 P${ps} pushes s2 against a triangle leg from outside: no split`,
    width: 5, height: 3,
    setup: (board) => { board.tile(1, 3, { triangle: 'bl' }).snowball(1, 2, 2).player(1, 1, ps); },
    actions: ['right'],
    verify: (result) => expectNoOp(result),
  })),
  ...(['tl', 'tr', 'bl', 'br'] as TriangleCorner[]).flatMap(corner => SOLID[corner].map(leg => defineScenario({
    name: `B-028 P2 pushes s1 onto the ${leg} leg of ${corner} from outside, vertical and horizontal: no crush`,
    width: 5, height: 5,
    setup: (board) => {
      // The ball stands next to the triangle, on the leg side, and is pushed toward it.
      const [br, bc] = step(2, 2, leg);
      const [pr, pc] = step(br, bc, leg);
      board.tile(2, 2, { triangle: corner }).snowball(br, bc, 1).player(pr, pc, 2);
    },
    actions: [OPP[leg]],
    verify: (result) => expectNoOp(result),
  }))),
  defineScenario({
    name: 'B-028 a ball in the triangle cell behind the leg does not make it a crush either',
    width: 5, height: 3,
    setup: (board) => { board.tile(1, 3, { triangle: 'tl' }).snowball(1, 3, 1).snowball(1, 2, 1).player(1, 1, 2); },
    actions: ['right'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'B-028 (B-006) P2 pushes s2+s1 where the s1 is backed by a triangle leg: nothing happens',
    width: 6, height: 3,
    setup: (board) => {
      board.player(1, 0, 2).snowball(1, 1, 2).snowball(1, 2, 1).tile(1, 3, { triangle: 'bl' });
    },
    actions: ['right'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'B-028 P3 pushes s2+s1 where the s1 is backed by a triangle leg: nothing happens',
    width: 6, height: 3,
    setup: (board) => {
      board.player(1, 0, 3).snowball(1, 1, 2).snowball(1, 2, 1).tile(1, 3, { triangle: 'bl' });
    },
    actions: ['right'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'B-028 unchanged: P1 builds a snowman against a triangle leg',
    width: 5, height: 3,
    setup: (board) => { board.player(1, 0, 1).snowball(1, 1, 1).snowball(1, 2, 1).tile(1, 3, { triangle: 'tl' }); },
    actions: ['right'],
    verify: (result) => { expectObject(result.level, 1, 2, 'snowman', 1); expectObject(result.level, 1, 1, 'player', 1); },
  }),
  defineScenario({
    name: 'B-028 unchanged: P3 builds a size-3 snowman against a triangle leg',
    width: 5, height: 3,
    setup: (board) => { board.player(1, 0, 3).snowball(1, 1, 2).snowball(1, 2, 2).tile(1, 3, { triangle: 'bl' }); },
    actions: ['right'],
    verify: (result) => { expectObject(result.level, 1, 2, 'snowman', 3); expectObject(result.level, 1, 1, 'player', 3); },
  }),
  defineScenario({
    name: 'B-028 unchanged: a tunnel side still crushes the ball',
    width: 5, height: 3,
    setup: (board) => { board.player(1, 1, 2).snowball(1, 2, 1).tile(1, 3, { isRowArch: true }); },
    actions: ['right'],
    verify: (result) => { expectEmpty(result.level, 1, 2); expectFlake(result, 1, 2, true, 'tunnel side crushes'); },
  }),
  defineScenario({
    name: 'B-028 unchanged: an arch the ball cannot pass still splits the s2',
    width: 5, height: 3,
    setup: (board) => { board.player(1, 0, 2).snowball(1, 1, 2).edgeArch(1, 1, 'right', 1); },
    actions: ['right'],
    verify: (result) => {
      expectEmpty(result.level, 1, 1);
      expectObject(result.level, 0, 1, 'snowball', 1);
      expectObject(result.level, 2, 1, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-028 unchanged: a closed yellow wall still crushes the ball',
    width: 5, height: 3,
    setup: (board) => {
      board.player(1, 1, 2).snowball(1, 2, 1).tile(1, 3, { isYellowWall: true }).tile(0, 0, { isYellowButton: true });
    },
    actions: ['right'],
    verify: (result) => { expectEmpty(result.level, 1, 2); expectFlake(result, 1, 2, true, 'closed yellow crushes'); },
  }),

  // ===== 3. the ball's own mirror into a wall/edge still crushes =====
  ...(['tl', 'tr', 'bl', 'br'] as TriangleCorner[]).flatMap(corner => SOLID[corner].map(leg => {
    const exit = TURN[corner][leg]!;
    return defineScenario({
      name: `B-028 unchanged: s1 in ${corner} pushed ${leg} turns ${exit} into a wall and crushes`,
      width: 5, height: 5,
      setup: (board) => {
        const [pr, pc] = step(2, 2, OPP[leg]);
        const [wr, wc] = step(2, 2, exit);
        board.tile(2, 2, { triangle: corner }).snowball(2, 2, 1).player(pr, pc, 2).object(wr, wc, 'wall', 100);
      },
      actions: [leg],
      verify: (result) => { expectEmpty(result.level, 2, 2); expectFlake(result, 2, 2, true, 'crushed past the mirror'); },
    });
  })),
  defineScenario({
    name: 'B-028 unchanged: s1 in ◥ turned onto the board edge crushes',
    width: 5, height: 3,
    setup: (board) => { board.tile(2, 2, { triangle: 'tr' }).snowball(2, 2, 1).player(2, 1, 2); },
    actions: ['right'],
    verify: (result) => { expectFlake(result, 2, 2, true, 'crushed on the edge'); },
  }),
  defineScenario({
    name: 'B-028 s1 in ◥ turned onto another triangle leg: nothing happens',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).player(1, 1, 2).tile(2, 2, { triangle: 'tl' });
    },
    actions: ['right'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'B-028 s2 in ◥ turned onto another triangle leg: no split',
    width: 5, height: 5,
    setup: (board) => {
      board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 2).player(1, 1, 3).tile(2, 2, { triangle: 'tr' });
    },
    actions: ['right'],
    verify: (result) => expectNoOp(result),
  }),
  defineScenario({
    name: 'B-028 unchanged: P1 s1 in ◥ turned into the board edge crushes',
    width: 5, height: 3,
    setup: (board) => { board.tile(2, 2, { triangle: 'tr' }).snowball(2, 2, 1).player(2, 1, 1); },
    actions: ['right'],
    verify: (result) => { expectFlake(result, 2, 2, true, 'crushed on the edge'); },
  }),
];
