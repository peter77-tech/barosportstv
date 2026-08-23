# barosportstv.com 연결 — BD 가 직접 해야 하는 것

> AI 가 대신 할 수 없는 부분입니다. GitHub 설정 화면과 도메인 등록기관 관리 화면에서
> 직접 넣어야 합니다.
>
> **아래 IP 값은 2026-08-23 에 GitHub 공식 문서에서 직접 확인한 값입니다.**

---

## 1. GitHub 저장소 만들기

이 폴더는 이미 git 저장소입니다. **브랜치 정리는 7차(2026-08-23)에 끝냈습니다** —
`deploy/github-pages` 를 병합하고 브랜치 이름을 **`main`** 으로 바꿔 뒀습니다.
그러므로 아래 두 줄만 하면 됩니다.

```bash
# 저장소를 만들고 올린다 (공개 — BD 결정 2026-08-23)
gh repo create barosportstv --public --source=. --remote=origin
git push -u origin main
```

> ⚠️ **브랜치 이름을 `master` 로 되돌리지 마십시오.** `deploy.yml` 은
> `push: branches: [main]` 을 본다. 이름이 어긋나면 푸시해도 배포가 돌지 않는다
> (10분 크론과 수동 실행은 그래도 되지만, 첫 배포가 최대 10분 늦고 이후 푸시도
> 즉시 반영되지 않는다).

## 2. GitHub 설정 (한 번만)

### Pages

저장소 → **Settings → Pages**

| 항목 | 값 |
|---|---|
| Source | **GitHub Actions** ← `Deploy from a branch` 가 아니다 |
| Custom domain | `barosportstv.com` → Save |
| Enforce HTTPS | 인증서가 발급된 뒤 체크 (보통 몇 분 ~ 한 시간) |

### Secret

저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| 항목 | 값 |
|---|---|
| Name | `SPORTSDB_KEY` |
| Secret | 발급받은 TheSportsDB 키 |

- ⚠️ 이 값을 코드나 문서에 적지 마십시오. 워크플로가 산출물에서 이 문자열을
  찾아내면 **배포를 중단**합니다.
- 유료 키가 아직 없으면 임시로 `3`(무료 테스트 키)을 넣어도 배포 자체는 확인됩니다.
  단 데이터가 종목당 3건만 오고 대부분 429 가 납니다 (정상입니다 — 규칙 ⑫).
  키가 8자 미만이면 키 문자열 검사는 건너뜁니다(`3` 한 글자가 모든 파일에 걸리므로).
- **Secret 이 아예 없으면 프리베이크가 의도적으로 실패합니다.** 무료 키로 조용히
  떨어져서 "되는 것처럼 보이는" 상태를 만들지 않기 위해서입니다.

## 3. 도메인 등록기관 (DNS)

`barosportstv.com` (루트 도메인)에 **A 레코드 4개**를 넣습니다.

| 종류 | 이름 | 값 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

IPv6 도 쓰려면 **AAAA 레코드 4개**를 더 넣습니다 (필수는 아닙니다).

| 종류 | 이름 | 값 |
|---|---|---|
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

`www.barosportstv.com` 도 쓰려면 **CNAME** 하나를 더 넣습니다.

| 종류 | 이름 | 값 |
|---|---|---|
| CNAME | `www` | `<GitHub 계정명>.github.io.` |

> ⚠️ 위 값은 2026-08-23 확인 기준입니다. **GitHub 이 IP 를 바꿀 수 있으므로**
> 넣기 전에 한 번 확인하십시오:
> <https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site>

## 4. 확인

DNS 전파에 보통 10분 ~ 1시간, 길면 하루가 걸립니다. 그 뒤:

| 확인할 것 | 기대 |
|---|---|
| `https://barosportstv.com` | 홈이 뜬다 |
| `https://barosportstv.com/schedule.html` | 경기 일정이 뜬다 |
| 홈 경기 카드의 팀 이름 | 하드코딩이 아닌 **실제 팀 이름** |
| 개발자 도구 → 네트워크 탭 | **`thesportsdb.com` 요청 0건** |

마지막 항목이 이 작업의 핵심 성과입니다. 요청이 하나라도 보이면 키가 브라우저로
새고 있다는 뜻이므로 즉시 알려주십시오.

### 데이터가 늦는 것은 정상입니다

점수는 **10~25분 늦게** 뜹니다. 크론이 10분마다 돌고 GitHub 부하로 더 밀릴 수
있기 때문입니다. 경과 시간 시계는 브라우저에서 계속 올라가므로 화면은 움직입니다.

## 5. 나중에 실시간이 필요해지면

Cloudflare Workers 프록시로 옮깁니다. `assets/data.js` 의 `SOURCE` **두 줄**만
바꾸면 됩니다.

```js
var SOURCE = { mode: 'live', base: 'https://api.barosportstv.com/' };
```

절차와 근거는 설계 문서
[`docs/superpowers/specs/2026-08-23-github-pages-배포-설계.md`](superpowers/specs/2026-08-23-github-pages-배포-설계.md)
**11.1절**에 있습니다.

## 6. 문제가 생기면

| 증상 | 원인 · 조치 |
|---|---|
| 배포가 「키를 발견했다」로 실패 | 코드에 키가 들어갔다. 지우고 Secret 만 쓴다 |
| 배포가 「TheSportsDB 를 직접 부른다」로 실패 | 브라우저 코드에 API 주소가 들어갔다. `assets/data.js` 의 `SOURCE` 만 쓴다 |
| 화면이 하드코딩(아스날/ARS)으로 보인다 | `data/` 가 안 만들어졌다. Actions 로그의 「프리베이크 결과」를 본다 |
| 60일쯤 지나 갱신이 멈췄다 | `keepalive.yml` 이 도는지 본다. 안 돌면 Actions 탭에서 수동 실행 |
| 팀 허브가 특정 팀만 하드코딩이다 | 60팀 상한에 걸린 팀이다. Actions 요약의 `skippedTeams` 에 이름이 있다 |
