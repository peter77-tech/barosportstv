# 대표 이미지 배경·글꼴 출처

## 배경 사진

아래 4장은 2026-10-23 에 BD 가 골라 확정했습니다. 종목별 한 장이며, 같은 종목의 리그는 사진을 함께 씁니다. 모두 Pexels 사진입니다.
카드에 쓸 때 1600px 너비 JPEG(400KB 이하)로 두고 `makeCard` 가 흐리게 처리합니다.

| 파일 | 쓰는 리그 | 페이지 | 사진가 | 설명 | 라이선스 |
|---|---|---|---|---|---|
| baseball.jpg | kbo | https://www.pexels.com/photo/1661950/ | Steshka Croes | 잔디 위의 야구 글러브와 공 | Pexels License (상업 이용·편집 허용, 출처 표기 불요) |
| soccer.jpg | kl1 | https://www.pexels.com/photo/12039815/ | Mario Ortiz | 로우 앵글 축구공(흰색·청록), 흐릿한 경기장 배경 | Pexels License (상업 이용·편집 허용, 출처 표기 불요) |
| basketball.jpg | kbl, wkbl | https://www.pexels.com/photo/7201554/ | cottonbro studio | 나무 마루 위의 농구공 | Pexels License (상업 이용·편집 허용, 출처 표기 불요) |
| volleyball.jpg | vm, vw | https://www.pexels.com/photo/32602956/ | Critical Smith | 밝은 실내 코트 위 노랑·흰 배구공 | Pexels License (상업 이용·편집 허용, 출처 표기 불요) |

## 글꼴

`../fonts/NotoSansKR-Bold.ttf` — Noto Sans KR (Google), SIL Open Font License 1.1 (`../fonts/OFL.txt`).
Google Fonts 저장소의 가변 글꼴(`ofl/notosanskr`)에서 굵기 700 한 벌을 뽑고, 한글 KS X 1001 완성형 2,350자와 ASCII·`· × : – — ‘ ’ “ ”`
만 남겨 줄인 것입니다(fonttools). 글리프를 줄인 파생본도 OFL 에 따라 같은 라이선스로 둡니다. 팀 이름에 이 범위 밖 글자가 있으면 카드에 빈칸이 생기므로, 새 팀·글자가 생기면 다시 뽑아야 합니다.

글리프 범위: `../fonts/charset.txt` 는 글꼴 cmap 에서 `python tools/review/font-charset.py` 로 뽑은 목록이며, `makeCard` 가 이 밖의 글자를 만나면 오류를 던진다. 글꼴 이름표(family `Noto Sans KR`, style `Bold`)도 같은 스크립트(`--rename`)로 맞췄다. 글꼴을 다시 만들면 스크립트를 다시 돌려 함께 커밋한다.
