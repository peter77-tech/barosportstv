/* 팀 이름 사전. 화면에 보이는 이름이 틀리면 조용히 잘못된 정보가 된다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadTeams() {
  const win = { window: null };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(await readFile('assets/teams.js', 'utf8'), ctx, { filename: 'teams.js' });
  return win.ArenaTeams;
}

test('사전에 적어 둔 팀은 그대로 나온다', async () => {
  const T = await loadTeams();
  assert.equal(T.ko('Kiwoom Heroes'), '키움 히어로즈');
  assert.equal(T.ko('Kansas City Chiefs'), '캔자스시티 치프스');
  assert.equal(T.ko('Bayern Munich'), '바이에른 뮌헨');
  assert.equal(T.ko('Ulsan HD'), '울산 HD');
});

/* 🔴 get() 은 접두사로 맞춘다 — `juventus women` 이 `juventus` 로 잡힌다.
   그대로 두면 **여자 경기가 남자팀 이름으로** 표시된다(조용한 오정보).
   그래서 「… Women」 판정을 get() 보다 먼저 한다. */
test('여자부 팀은 남자팀 이름으로 뭉개지지 않는다', async () => {
  const T = await loadTeams();
  assert.equal(T.ko('Juventus Women'), '유벤투스 여자');
  assert.equal(T.ko('AC Milan Women'), 'AC 밀란 여자');
  assert.equal(T.ko('Paris Saint-Germain Women'), '파리 생제르맹 여자');
  assert.equal(T.ko('Real Sociedad Femenino'), '레알 소시에다드 여자');
});

test('FIBA 국가대표는 국가 이름으로 나온다', async () => {
  const T = await loadTeams();
  assert.equal(T.ko('South Korea Basketball'), '한국');
  assert.equal(T.ko('United States Basketball'), '미국');
  assert.equal(T.ko('Serbia Basketball'), '세르비아');
});

test('모르는 팀은 영문 그대로 둔다 — 없는 이름을 지어내지 않는다', async () => {
  const T = await loadTeams();
  assert.equal(T.ko('Ilbirs Bishkek Women'), 'Ilbirs Bishkek Women');
  assert.equal(T.ko('Kharaatsai'), 'Kharaatsai');
  assert.equal(T.ko(''), '');
});
