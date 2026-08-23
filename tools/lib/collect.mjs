/* 경기 목록에서 「구울 대상」을 골라낸다.

   ⚠️ 상한에 걸려 못 굽는 팀은 **이름을 돌려준다.**
     조용히 잘라내면 로그가 "다 구웠다"로 읽힌다. 부르는 쪽이 이걸
     manifest 와 워크플로 로그에 남긴다. */
export function collectTargets(eventLists, dictionaryTeams, cap = 60) {
  /* 1. 경기를 모아 idEvent 로 중복을 없앤다 (UTC 3일이 겹쳐 온다) */
  const byId = new Map();
  for (const list of eventLists || []) {
    for (const e of list || []) {
      if (!e || !e.idEvent) continue;
      const id = String(e.idEvent);
      if (!byId.has(id)) byId.set(id, e);
    }
  }

  /* 2. 시각 오름차순. 상한에 걸릴 때 이른 경기가 살아남게 한다 */
  const events = [...byId.values()].sort((a, b) =>
    String(a.strTimestamp || '').localeCompare(String(b.strTimestamp || ''))
  );

  /* 3. 사전 팀을 먼저 넣는다 — 상한에 세지 않는다 */
  const teams = [];
  const seen = new Set();
  for (const name of dictionaryTeams || []) {
    if (!name) continue;
    const key = String(name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    teams.push(name);
  }

  /* 4. 등장 팀을 상한까지 넣고, 넘친 팀은 이름을 남긴다 */
  const extra = [];
  for (const e of events) {
    for (const name of [e.strHomeTeam, e.strAwayTeam]) {
      if (!name) continue;
      const key = String(name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      extra.push(name);
    }
  }

  return {
    events,
    teams: teams.concat(extra.slice(0, cap)),
    skippedTeams: extra.slice(cap)
  };
}
