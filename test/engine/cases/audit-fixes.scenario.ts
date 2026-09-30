import { newGameState } from '../../../src/utils/game';
import { isPlayerInLaserBeam } from '../../../src/engine/turn';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';

/**
 * Regression cases for the 2026-09-29 rule review (engine audit B/N/Q items).
 * Each scenario name starts with its audit number.
 */
export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'B-01 P1 crushes a size-1 snowball against the side of a row tunnel',
    width: 4, height: 1,
    setup: (b) => { b.player(0, 0, 1).snowball(0, 1, 1).tile(0, 2, { isRowArch: true }); },
    actions: ['right'],
    verify: (r) => {
      expectEmpty(r.level, 0, 1);
      expect(r.level.tiles[0][1].isFlake, 'the ball must leave a flake');
      expectObject(r.level, 0, 0, 'player', 1);
    },
  }),
  defineScenario({
    name: 'B-01 P1 crushes a size-1 snowball against a triangle leg',
    width: 3, height: 1,
    setup: (b) => { b.tile(0, 1, { triangle: 'tl' }).snowball(0, 1, 1).player(0, 2, 1); },
    actions: ['left'],
    verify: (r) => {
      expectEmpty(r.level, 0, 1);
      expect(r.level.tiles[0][1].isFlake, 'the ball must leave a flake');
    },
  }),
  defineScenario({
    name: 'B-02 P3 crushes a size-1 ball pressed against a block backed by a laser and the edge',
    width: 4, height: 1,
    setup: (b) => { b.laser(0, 0, 'right').object(0, 1, 'block', 1).snowball(0, 2, 1).player(0, 3, 3); },
    actions: ['left'],
    verify: (r) => {
      expectEmpty(r.level, 0, 2);
      expect(r.level.tiles[0][2].isFlake, 'the ball must leave a flake');
      expectObject(r.level, 0, 3, 'player', 3);
      expectObject(r.level, 0, 1, 'block');
    },
  }),
  defineScenario({
    name: 'B-02 P3 crushes a size-1 ball in front of block-block-wall',
    width: 6, height: 1,
    setup: (b) => { b.player(0, 0, 3).snowball(0, 1, 1).object(0, 2, 'block', 1).object(0, 3, 'block', 1).object(0, 4, 'wall', 100); },
    actions: ['right'],
    verify: (r) => { expectEmpty(r.level, 0, 1); expect(r.level.tiles[0][1].isFlake, 'flake expected'); },
  }),
  defineScenario({
    name: 'B-03 P3 builds a size-1 snowman against a block that is backed by a wall',
    width: 6, height: 1,
    setup: (b) => { b.player(0, 0, 3).snowball(0, 1, 1).snowball(0, 2, 1).object(0, 3, 'block', 1).object(0, 4, 'wall', 100); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 0, 2, 'snowman', 1);
      expectObject(r.level, 0, 1, 'player', 3);
    },
  }),
  defineScenario({
    name: 'B-04 P2 crushes a ball pressed against a block that a tunnel side stops',
    width: 5, height: 1,
    setup: (b) => { b.player(0, 0, 2).snowball(0, 1, 1).object(0, 2, 'block', 1).tile(0, 3, { isRowArch: true }); },
    actions: ['right'],
    verify: (r) => { expectEmpty(r.level, 0, 1); expect(r.level.tiles[0][1].isFlake, 'flake expected'); },
  }),
  defineScenario({
    name: 'B-04 P3 splits a size-2 ball pressed against a block that a tunnel side stops',
    width: 5, height: 3,
    setup: (b) => { b.player(1, 0, 3).snowball(1, 1, 2).object(1, 2, 'block', 1).tile(1, 3, { isRowArch: true }); },
    actions: ['right'],
    verify: (r) => {
      expectEmpty(r.level, 1, 1);
      expectObject(r.level, 0, 1, 'snowball', 1);
      expectObject(r.level, 2, 1, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-04 a block transmits force to a ball that a tunnel side backs',
    width: 5, height: 1,
    setup: (b) => { b.player(0, 0, 2).object(0, 1, 'block', 1).snowball(0, 2, 1).tile(0, 3, { isRowArch: true }); },
    actions: ['right'],
    verify: (r) => { expectEmpty(r.level, 0, 2); expect(r.level.tiles[0][2].isFlake, 'flake expected'); },
  }),
  defineScenario({
    name: 'B-05 a size-1 arch backs the size-2 ball even when a ball waits beyond the arch',
    width: 6, height: 1,
    setup: (b) => { b.player(0, 0, 3).snowball(0, 1, 1).snowball(0, 2, 2).edgeArch(0, 2, 'right', 1).snowball(0, 3, 1); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 0, 2, 'snowman', 2);
      expectObject(r.level, 0, 3, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-05 a triangle leg backs a ball even when the triangle cell holds a ball',
    width: 5, height: 1,
    setup: (b) => { b.player(0, 0, 2).snowball(0, 1, 1).snowball(0, 2, 1).tile(0, 3, { triangle: 'tl' }).snowball(0, 3, 1); },
    actions: ['right'],
    verify: (r) => { expectObject(r.level, 0, 2, 'snowman', 1); expectObject(r.level, 0, 3, 'snowball', 1); },
  }),
  defineScenario({
    name: 'B-06 an elastic impact does not pass through a triangle leg',
    width: 8, height: 1,
    setup: (b) => {
      b.player(0, 0, 3).snowball(0, 1, 2).snowball(0, 4, 1).tile(0, 5, { triangle: 'tl' }).snowball(0, 5, 1);
    },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 0, 3, 'snowball', 2);
      expectObject(r.level, 0, 4, 'snowball', 1);
      expectObject(r.level, 0, 5, 'snowball', 1);
      expectEmpty(r.level, 0, 7);
    },
  }),
  defineScenario({
    name: 'B-07/Q-01 split judged on the pre-split board (button left, closed wall right)',
    width: 3, height: 3,
    setup: (b) => {
      b.object(0, 1, 'wall', 100).tile(1, 0, { isYellowButton: true }).snowball(1, 1, 2)
        .tile(1, 2, { isYellowWall: true }).player(2, 1, 2);
    },
    actions: ['up'],
    verify: (r) => {
      expectObject(r.level, 1, 0, 'snowball', 1);
      expectObject(r.level, 1, 1, 'snowball', 1);
      expectEmpty(r.level, 1, 2);
    },
  }),
  defineScenario({
    name: 'B-07/Q-01 split judged on the pre-split board (closed wall left, button right)',
    width: 3, height: 3,
    setup: (b) => {
      b.object(0, 1, 'wall', 100).tile(1, 0, { isYellowWall: true }).snowball(1, 1, 2)
        .tile(1, 2, { isYellowButton: true }).player(2, 1, 2);
    },
    actions: ['up'],
    verify: (r) => {
      expectEmpty(r.level, 1, 0);
      expectObject(r.level, 1, 1, 'snowball', 1);
      expectObject(r.level, 1, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-08 P1 cannot split a size-2 ball through a block',
    width: 4, height: 3,
    setup: (b) => { b.player(1, 0, 1).object(1, 1, 'block', 1).snowball(1, 2, 2).object(1, 3, 'wall', 100); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 1, 2, 'snowball', 2);
      expectEmpty(r.level, 0, 2);
      expectEmpty(r.level, 2, 2);
    },
  }),
  defineScenario({
    name: 'B-11 (decision 9/29) with shadows off a ball inside a closed wall on a warm cell melts',
    width: 3, height: 2,
    setup: (b) => {
      b.level.hasShadow = false;
      b.tile(0, 1, { isYellowWall: true, isWarm: true }).snowball(0, 1, 1).player(1, 0, 2).tile(1, 2, { isYellowButton: true });
    },
    actions: ['wait'],
    verify: (r) => { expectEmpty(r.level, 0, 1); },
  }),
  defineScenario({
    name: 'B-11 (decision 9/29) with shadows on the closed wall cell is shade and the ball survives',
    width: 3, height: 2,
    setup: (b) => {
      b.level.hasShadow = true;
      b.tile(0, 1, { isYellowWall: true, isWarm: true }).snowball(0, 1, 1).player(1, 0, 2).tile(1, 2, { isYellowButton: true });
    },
    actions: ['wait'],
    verify: (r) => { expectObject(r.level, 0, 1, 'snowball', 1); },
  }),
  defineScenario({
    name: 'B-13 a laser trapped inside a closed yellow wall cannot fire out',
    width: 5, height: 2,
    setup: (b) => { b.tile(0, 1, { isYellowWall: true }).laser(0, 1, 'right').player(0, 3, 2).tile(1, 0, { isYellowButton: true }); },
    actions: ['wait'],
    verify: (r) => { expectStatus(r, 'playing'); expectObject(r.level, 0, 3, 'player', 2); },
  }),
  defineScenario({
    name: 'B-14 the soul skips a snowman that melts away in the same turn',
    width: 4, height: 3,
    setup: (b) => {
      b.object(0, 0, 'player', 1, { isMelting: true }).tile(0, 0, { isWarm: true })
        .snowman(0, 1, 1).tile(0, 1, { isWarm: true })
        .snowman(0, 3, 2).snowman(2, 0, 2);
    },
    actions: ['wait'],
    verify: (r) => {
      expectStatus(r, 'playing');
      expectObject(r.level, 2, 0, 'player', 2);
      expectObject(r.level, 0, 3, 'snowman', 2);
    },
  }),
  defineScenario({
    name: 'N-01 force travels through a pushed snowman to a ball pressed against a wall',
    width: 4, height: 1,
    setup: (b) => { b.player(0, 0, 3).snowman(0, 1, 1).snowball(0, 2, 1).object(0, 3, 'wall', 100); },
    actions: ['right'],
    verify: (r) => {
      expectEmpty(r.level, 0, 2);
      expect(r.level.tiles[0][2].isFlake, 'flake expected');
      expectObject(r.level, 0, 1, 'snowman', 1);
    },
  }),
  defineScenario({
    name: 'Q-04 a two-ball train turns at a triangle one ball at a time',
    width: 5, height: 3,
    setup: (b) => { b.tile(2, 0, { triangle: 'bl' }).snowball(2, 2, 1).snowball(2, 3, 1).player(2, 4, 3); },
    actions: ['left'],
    verify: (r) => {
      expectObject(r.level, 0, 0, 'snowball', 1);
      expectObject(r.level, 1, 0, 'snowball', 1);
      expectEmpty(r.level, 2, 0);
    },
  }),
  defineScenario({
    name: 'Q-05 every ball of a train rolls on into the same hole',
    width: 8, height: 1,
    setup: (b) => { b.player(0, 0, 3).snowball(0, 1, 1).snowball(0, 2, 1).tile(0, 4, { isHole: true }); },
    actions: ['right'],
    verify: (r) => {
      for (let c = 2; c < 8; c++) expectEmpty(r.level, 0, c);
      expectObject(r.level, 0, 1, 'player', 3);
    },
  }),
  defineScenario({
    name: 'Q-06 a rolling ball keeps rolling out of the partner portal',
    width: 4, height: 3,
    setup: (b) => { b.player(0, 0, 2).snowball(0, 1, 1).tile(0, 2, { isPortal: true }).tile(2, 0, { isPortal: true }); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 2, 3, 'snowball', 1);
      expectEmpty(r.level, 2, 0);
    },
  }),
  defineScenario({
    name: 'Q-08 (decision 9/29) a laser melts a ball and its warm tile becomes cool',
    width: 3, height: 3,
    setup: (b) => { b.laser(1, 0, 'right').snowball(1, 2, 1).tile(1, 2, { isWarm: true }).player(2, 0, 2); },
    actions: ['wait'],
    verify: (r) => {
      expectEmpty(r.level, 1, 2);
      expect(!r.level.tiles[1][2].isWarm, 'the tile must become cool');
    },
  }),
  defineScenario({
    name: 'Q-16 c a crack that a rolling ball only passed over is armed and becomes a hole next turn',
    width: 6, height: 2,
    setup: (b) => { b.player(0, 0, 2).snowball(0, 1, 1).tile(0, 3, { isCrack: true }); },
    actions: ['right', 'wait'],
    verify: (r) => {
      const afterRoll = r.turns[0].level.tiles[0][3];
      expect(!!afterRoll.isCrack && !!afterRoll.crackArmed, 'rolling across must arm the crack this turn');
      expect(!afterRoll.crackRolled, 'the per-turn roll mark must be cleared');
      expect(!!r.level.tiles[0][3].isHole, 'the armed crack must crumble into a hole on the next turn');
      expectObject(r.level, 0, 5, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'Q-13 an endless triangle loop is reported as an infinite loop (rules unchanged)',
    width: 8, height: 8,
    setup: (b) => {
      b.snowman(0, 0, 1)
        .tile(1, 2, { triangle: 'tl' }).tile(1, 6, { triangle: 'tr' }).tile(6, 6, { triangle: 'br' }).tile(6, 2, { triangle: 'bl' })
        .tile(2, 2, { isYellowButton: true }).tile(3, 2, { isYellowButton: true }).snowball(3, 2, 1)
        .tile(3, 1, { isYellowWall: true }).laser(3, 0, 'right').player(4, 2, 2).tile(7, 7, { isGoal: true });
    },
    actions: ['up'],
    verify: (r) => {
      expect(r.turns[0].infiniteLoop === true, 'the turn must report the endless loop');
      expectStatus(r, 'playing');
      expectObject(r.level, 0, 0, 'player', 1);
    },
  }),
  defineScenario({
    name: 'Q-10 a snowman built on a snowflake absorbs it',
    width: 5, height: 1,
    setup: (b) => { b.player(0, 0, 3).snowball(0, 1, 1).snowball(0, 2, 2).tile(0, 2, { isFlake: true }).object(0, 3, 'wall', 100); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 0, 2, 'snowman', 3);
      expect(!r.level.tiles[0][2].isFlake, 'the flake must be consumed');
    },
  }),
  defineScenario({
    name: 'Q-10 the snowman of a fully blocked split absorbs a flake under it',
    width: 3, height: 3,
    setup: (b) => {
      b.object(0, 1, 'wall', 100).object(1, 0, 'wall', 100).object(1, 2, 'wall', 100)
        .snowball(1, 1, 2).tile(1, 1, { isFlake: true }).player(2, 1, 2);
    },
    actions: ['up'],
    verify: (r) => { expectObject(r.level, 1, 1, 'snowman', 2); },
  }),
  defineScenario({
    name: 'Q-17 a vacated body stops "melting" once it rests out of the sun',
    width: 4, height: 1,
    setup: (b) => { b.player(0, 0, 2).object(0, 2, 'snowman', 2, { isMelting: true }); },
    actions: ['wait'],
    verify: (r) => {
      const body = r.level.objects[0][2];
      expect(!!body && body.isMelting === false, 'the snowman body must cool down');
    },
  }),
  defineScenario({
    name: 'Q-07 turn 0: snow placed in a laser beam melts before the first move, and a player start in a beam is detected',
    width: 5, height: 2,
    setup: (b) => { b.laser(0, 0, 'right').snowball(0, 2, 1).tile(0, 2, { isWarm: true }).snowman(0, 3, 2).player(1, 1, 2); },
    actions: [],
    verify: (r) => {
      const start = newGameState(r.initialLevel);
      expectStatus({ ...r, status: start.status }, 'playing');
      expectEmpty(start.level, 0, 2);
      expectEmpty(start.level, 0, 3);
      expect(!start.level.tiles[0][2].isWarm, 'the melted ball cools its tile (Q-08)');
      expect(!isPlayerInLaserBeam(start.level), 'the player below the beam is safe');
      const bad = newGameState(r.initialLevel);
      bad.level.objects[1][1] = null;
      bad.level.objects[0][4] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      expect(isPlayerInLaserBeam(bad.level), 'a player start inside the beam must be detected');
    },
  }),
];
