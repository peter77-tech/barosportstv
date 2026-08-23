import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTargets } from '../tools/lib/collect.mjs';

const ev = (id, home, away, ts) => ({
  idEvent: id, strHomeTeam: home, strAwayTeam: away, strTimestamp: ts
});

test('경기를 시각 오름차순으로 돌려준다', () => {
  const r = collectTargets([[
    ev('3', 'C', 'D', '2026-08-23 20:00:00'),
    ev('1', 'A', 'B', '2026-08-23 09:00:00')
  ]], []);
  assert.deepEqual(r.events.map(e => e.idEvent), ['1', '3']);
});

test('idEvent 가 같은 경기는 한 번만 (UTC 3일이 겹쳐 온다)', () => {
  const r = collectTargets([
    [ev('1', 'A', 'B', '2026-08-23 09:00:00')],
    [ev('1', 'A', 'B', '2026-08-23 09:00:00')]
  ], []);
  assert.equal(r.events.length, 1);
});

test('빈 목록·null 이 섞여도 죽지 않는다', () => {
  const r = collectTargets([null, [], [ev('1', 'A', 'B', '2026-08-23 09:00:00')]], []);
  assert.equal(r.events.length, 1);
});

test('사전 팀은 경기에 안 나와도 항상 들어간다', () => {
  const r = collectTargets([[ev('1', 'A', 'B', '2026-08-23 09:00:00')]], ['Arsenal', 'Chelsea']);
  assert.ok(r.teams.includes('Arsenal'));
  assert.ok(r.teams.includes('Chelsea'));
  assert.ok(r.teams.includes('A'));
});

test('사전 팀이 경기에도 나오면 중복되지 않는다', () => {
  const r = collectTargets([[ev('1', 'Arsenal', 'B', '2026-08-23 09:00:00')]], ['Arsenal']);
  assert.equal(r.teams.filter(t => t === 'Arsenal').length, 1);
});

test('대소문자만 다른 같은 팀을 중복으로 넣지 않는다', () => {
  const r = collectTargets([[ev('1', 'arsenal', 'B', '2026-08-23 09:00:00')]], ['Arsenal']);
  assert.equal(r.teams.filter(t => t.toLowerCase() === 'arsenal').length, 1);
});

test('상한을 넘긴 팀은 skippedTeams 로 전부 돌려준다 — 조용히 버리지 않는다', () => {
  const events = [];
  for (let i = 0; i < 5; i++) {
    events.push(ev(String(i), `H${i}`, `A${i}`, `2026-08-23 0${i}:00:00`));
  }
  const r = collectTargets([events], [], 4);
  assert.equal(r.teams.length, 4, '상한만큼만 굽는다');
  assert.equal(r.skippedTeams.length, 6, '나머지 6팀은 이름을 남긴다');
  const all = [...r.teams, ...r.skippedTeams];
  assert.equal(new Set(all).size, 10, '10팀이 빠짐없이 어느 한쪽에 있어야 한다');
});

test('사전 팀은 상한에 세지 않는다 — 항상 굽는다', () => {
  const r = collectTargets(
    [[ev('1', 'X', 'Y', '2026-08-23 09:00:00')]],
    ['Arsenal', 'Chelsea', 'Liverpool'],
    1
  );
  assert.equal(r.teams.length, 4, '사전 3팀 + 상한 1팀');
  assert.deepEqual(r.skippedTeams, ['Y']);
});

test('이른 경기의 팀이 먼저 구워진다 — 상한에 걸리면 늦은 경기가 밀린다', () => {
  const r = collectTargets([[
    ev('2', 'Late', 'LateAway', '2026-08-23 23:00:00'),
    ev('1', 'Early', 'EarlyAway', '2026-08-23 01:00:00')
  ]], [], 2);
  assert.deepEqual(r.teams, ['Early', 'EarlyAway']);
  assert.deepEqual(r.skippedTeams, ['Late', 'LateAway']);
});

test('팀 이름이 비어 있으면 무시한다', () => {
  const r = collectTargets([[ev('1', '', null, '2026-08-23 09:00:00')]], []);
  assert.deepEqual(r.teams, []);
  assert.deepEqual(r.skippedTeams, []);
});
