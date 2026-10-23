/* 대표 이미지 (§11). 리그별 배경 사진 → 흐리게·어둡게 → 점수 글자를 코드가 그린다.
   한글 글꼴은 저장소에 함께 둔다 — 실행기(ubuntu)에 한글 글꼴이 없다. */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEAGUES } from './config.mjs';

const ROOT = fileURLToPath(new URL('../../assets/review/', import.meta.url));
export const FONT_PATH = `${ROOT}fonts/NotoSansKR-Bold.ttf`;
const FONT_FAMILY = 'Noto Sans KR';   // 글꼴 이름표(family)와 같아야 한다 — font-charset.py --rename
const W = 1200, H = 630;
const TEXT_MAX_WIDTH = 1080;   // 좌우 여백 60px

export function bgPath(league) {
  if (!LEAGUES[league]) throw new Error(`알 수 없는 리그: ${league}`);
  return `${ROOT}bg/${league}.jpg`;
}

/* 이긴 팀 먼저, 무승부는 홈 먼저. 점수는 이긴 쪽이 앞에 온다. */
export function cardText(facts) {
  const { home, away } = facts.score;
  const awayFirst = away > home;
  const [a, b] = awayFirst ? [facts.away, facts.home] : [facts.home, facts.away];
  const [sa, sb] = awayFirst ? [away, home] : [home, away];
  const big = `${a.short} ${sa} : ${sb} ${b.short}`;
  const small = `${facts.date.replaceAll('-', '.')} · ${LEAGUES[facts.league].titleName}`;
  return { big, small, alt: `${big} · ${small}` };
}

/* 글꼴이 그릴 수 있는 글자(font-charset.py 가 글꼴의 cmap 에서 뽑아 둔다). */
const COVERED = new Set(readFileSync(`${ROOT}fonts/charset.txt`, 'utf8'));

/* 글꼴에 없는 글자(공백 제외). 글자가 빠지면 카드에 빈칸이 생기므로 그리기 전에 막는다. */
export function missingGlyphs(text) {
  return [...new Set([...text].filter((ch) => !/\s/.test(ch) && !COVERED.has(ch)))];
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* 글자 한 줄을 PNG 로 그린다. 너무 넓으면 글자 크기를 줄여 다시 그린다. */
async function textLayer(text, size, color) {
  for (let pt = size; pt >= 24; pt -= 6) {
    const png = await sharp({
      text: {
        text: `<span foreground="${color}" font="${FONT_FAMILY} Bold ${pt}">${esc(text)}</span>`,
        fontfile: FONT_PATH, font: FONT_FAMILY, rgba: true, dpi: 72,
      },
    }).png().toBuffer();
    const m = await sharp(png).metadata();
    if (m.width <= TEXT_MAX_WIDTH) return { input: png, width: m.width, height: m.height };
  }
  throw new Error(`대표 이미지 글자가 너무 길다: ${text}`);
}

/* bg 는 후보 견본을 만들 때만 바꿔 쓴다. */
export async function makeCard(facts, { bg: bgFile = bgPath(facts.league) } = {}) {
  const { big, small } = cardText(facts);
  const missing = missingGlyphs(big + small);
  if (missing.length) throw new Error(`카드 글꼴에 없는 글자: ${missing.join('')}`);
  const bg = await sharp(bgFile)
    .resize(W, H, { fit: 'cover' })
    .blur(12)
    .modulate({ brightness: 0.45 })
    .toBuffer();
  const [b, s] = await Promise.all([textLayer(big, 110, '#ffffff'), textLayer(small, 44, '#e5e7eb')]);
  const gap = 28;
  const top = Math.round((H - (b.height + gap + s.height)) / 2);
  return sharp(bg)
    .composite([
      { input: b.input, left: Math.round((W - b.width) / 2), top },
      { input: s.input, left: Math.round((W - s.width) / 2), top: top + b.height + gap },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}
