import {
  defineScenario,
  expect,
  expectEmpty,
  expectFrame,
  expectNoPlayer,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';

/**
 * Regression cases from the reported rolling/tick bugs. Add one scenario per
 * reported layout; the runner discovers every `*.scenario.ts` file automatically.
 */
export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'height-1 arch stops the rear size-2 ball and lets the front suffix roll',
    width: 12,
    height: 5,
    setup: (board) => {
      const row = 2;
      board
        .player(row, 0, 3)
        .snowball(row, 1, 2)
        .snowball(row, 3, 1)
        .snowball(row, 5, 1)
        .snowball(row, 7, 2)
        .edgeArch(row, 5, 'right', 1)
        .edgeArch(row, 9, 'right', 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 2, 1, 'player', 3);
      expectObject(level, 2, 5, 'snowball', 2);
      expectEmpty(level, 2, 6);
      expectObject(level, 2, 7, 'snowball', 1);
      expectObject(level, 2, 8, 'snowball', 1);
      expectObject(level, 2, 9, 'snowball', 2);
      const movementFrame = result.turns[0]?.frames.find(frame => frame.phase === 'movement');
      const playerMotionId = movementFrame?.level.objects[2][1]?.motionId;
      expect(
        !!playerMotionId && level.objects[2][1]?.motionId === playerMotionId,
        'the player needs one stable motion ID across tick snapshots for interpolation',
      );
    },
  }),
  defineScenario({
    name: 'second yellow button kills the player in the same tick without stopping the rolling ball',
    width: 8,
    height: 7,
    setup: (board) => {
      const row = 3;
      board
        .player(row, 1, 2)
        .snowball(row, 2, 1)
        .tile(row, 2, { isYellowButton: true })
        .tile(row, 4, { isYellowButton: true })
        .tile(4, 2, { isYellowWall: true })
        .laser(5, 2, 'up');
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'gameover');
      expectNoPlayer(result.level);
      expectFrame(
        result,
        0,
        'movement',
        (level) => level.objects[3][4]?.type === 'snowball',
        'expected a movement frame with the snowball on the second yellow button',
      );
      expectFrame(
        result,
        0,
        'resolved',
        (level) => level.objects[3][4]?.type === 'snowball' && !level.objects[3][2],
        'expected the player to die in the resolved frame for that same button press',
      );
      expectFrame(
        result,
        0,
        'movement',
        (level) => level.objects[3][5]?.type === 'snowball' && !level.objects[3][2],
        'expected the snowball to keep rolling on the tick after the player dies',
      );
      expectObject(level, 3, 7, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'a yellow wall traps the rear ball while the front rolling suffix continues',
    width: 8,
    height: 5,
    setup: (board) => {
      const row = 2;
      board
        .player(row, 0, 3)
        .snowball(row, 1, 1)
        .snowball(row, 2, 1)
        .tile(row, 2, { isYellowButton: true })
        .tile(row, 3, { isYellowWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 2, 3, 'snowball', 1);
      expectEmpty(level, 2, 4);
      expectObject(level, 2, 7, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'a closing wall stops balls behind and inside it but keeps the front suffix rolling',
    width: 12,
    height: 5,
    setup: (board) => {
      const row = 2;
      board
        .player(row, 0, 3)
        .snowball(row, 1, 1)
        .snowball(row, 2, 1)
        .snowball(row, 4, 1)
        .tile(row, 5, { isYellowButton: true })
        .tile(row, 7, { isYellowWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 2, 6, 'snowball', 1);
      expectObject(level, 2, 7, 'snowball', 1);
      expectEmpty(level, 2, 8);
      expectObject(level, 2, 11, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'equal-mass snowball transfer emits a short impact frame before rolling on',
    width: 12,
    height: 5,
    setup: (board) => {
      const row = 2;
      board
        .player(row, 0, 3)
        .snowball(row, 1, 1)
        .snowball(row, 2, 1)
        .snowball(row, 4, 2);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectFrame(
        result,
        0,
        'impact',
        (frameLevel) => frameLevel.objects[2][4]?.type === 'snowball',
        'expected an impact frame at the equal-mass contact state',
      );
      expectObject(level, 2, 11, 'snowball', 2);
    },
  }),
];
