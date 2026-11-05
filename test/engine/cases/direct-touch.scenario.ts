import { defineScenario, expect, expectEmpty, expectObject } from '../harness';

// 2026-11-05 규칙: 밀어서 생기는 부서짐·쪼개짐·합쳐짐은 나에게 직접 닿은 눈덩이에서만 시작된다.
export const scenarios = [
  defineScenario({
    name: 'a block in front of the first ball: the ball touching the player breaks',
    width: 5, height: 1,
    setup: (b) => {
      b.player(0, 0, 3).snowball(0, 1, 1).object(0, 2, 'block', 1).snowball(0, 3, 1).object(0, 4, 'wall', 100);
    },
    actions: ['right'],
    verify: (r) => {
      expectEmpty(r.level, 0, 1);
      expect(r.level.tiles[0][1].isFlake, 'flake expected');
      expectObject(r.level, 0, 3, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'two balls held by a block build a snowman',
    width: 6, height: 1,
    setup: (b) => {
      b.player(0, 0, 3).snowball(0, 1, 1).snowball(0, 2, 1).object(0, 3, 'block', 1)
        .snowball(0, 4, 1).object(0, 5, 'wall', 100);
    },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 0, 1, 'player', 3);
      expectObject(r.level, 0, 2, 'snowman', 1);
      expectObject(r.level, 0, 4, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'four small balls against the edge: nothing happens',
    width: 5, height: 1,
    setup: (b) => {
      b.player(0, 0, 3).snowball(0, 1, 1).snowball(0, 2, 1).snowball(0, 3, 1).snowball(0, 4, 1);
    },
    actions: ['right'],
    verify: (r) => {
      for (const col of [1, 2, 3, 4]) expectObject(r.level, 0, col, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'three small balls against a wall: nothing happens, size 3 has no special case',
    width: 5, height: 1,
    setup: (b) => {
      b.player(0, 0, 3).snowball(0, 1, 1).snowball(0, 2, 1).snowball(0, 3, 1).object(0, 4, 'wall', 100);
    },
    actions: ['right'],
    verify: (r) => {
      for (const col of [1, 2, 3]) expectObject(r.level, 0, col, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'a big ball does not crush the small ball behind it',
    width: 4, height: 1,
    setup: (b) => { b.player(0, 0, 2).snowball(0, 1, 2).snowball(0, 2, 1).object(0, 3, 'wall', 100); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 0, 1, 'snowball', 2);
      expectObject(r.level, 0, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'size 2 cannot split a big ball behind a big ball',
    width: 4, height: 3,
    setup: (b) => { b.player(1, 0, 2).snowball(1, 1, 2).snowball(1, 2, 2).object(1, 3, 'wall', 100); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 1, 1, 'snowball', 2);
      expectObject(r.level, 1, 2, 'snowball', 2);
    },
  }),
  defineScenario({
    name: 'size 3 builds a snowman from the same two big balls',
    width: 4, height: 1,
    setup: (b) => { b.player(0, 0, 3).snowball(0, 1, 2).snowball(0, 2, 2).object(0, 3, 'wall', 100); },
    actions: ['right'],
    verify: (r) => { expectObject(r.level, 0, 2, 'snowman', 3); },
  }),
  defineScenario({
    name: 'a block touching the player passes no force on',
    width: 4, height: 3,
    setup: (b) => { b.player(1, 0, 3).object(1, 1, 'block', 1).snowball(1, 2, 2).object(1, 3, 'wall', 100); },
    actions: ['right'],
    verify: (r) => { expectObject(r.level, 1, 2, 'snowball', 2); },
  }),
  defineScenario({
    name: 'a line too heavy to push still breaks the ball touching the player when a block is in front of it',
    width: 5, height: 3,
    setup: (b) => { b.player(1, 0, 2).snowball(1, 1, 2).object(1, 2, 'block', 1); },
    actions: ['right'],
    verify: (r) => {
      expectObject(r.level, 0, 1, 'snowball', 1);
      expectObject(r.level, 2, 1, 'snowball', 1);
      expectEmpty(r.level, 1, 1);
      expectObject(r.level, 1, 2, 'block', 1);
    },
  }),
];
