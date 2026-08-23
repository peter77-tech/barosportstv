/* ARENA LIVE — Tailwind 빌드 설정
 *
 * 디자인 토큰의 원본은 여전히 `assets/theme.js` 한 곳이다.
 * 이 파일은 그 파일을 그대로 읽어서 쓴다 — 토큰을 여기에 복사하지 마십시오.
 * (복사하면 두 파일이 갈라지고, 어느 쪽이 맞는지 알 수 없게 된다)
 *
 * 토큰을 바꿀 때:  assets/theme.js 만 고치고 `npm run build:css` 를 다시 돌린다.
 *
 * 빌드:  npm run build:css
 * 감시:  npm run watch:css   (파일 저장할 때마다 자동 재빌드)
 */
const fs = require('fs');
const path = require('path');

/* theme.js 는 브라우저용으로 `tailwind.config = {...}` 형태다.
 * 빈 tailwind 객체를 넘겨 실행시켜서 그 설정만 꺼내온다. */
const tailwind = {};
const themeSrc = fs.readFileSync(path.join(__dirname, 'assets', 'theme.js'), 'utf8');
new Function('tailwind', themeSrc)(tailwind);

module.exports = {
  /* 클래스를 찾을 곳. assets/*.js 를 넣는 이유:
   * app.js 가 bg-hermes-orange / translate-x-1 / translate-x-6 등을
   * JS 에서 토글하므로, HTML 만 훑으면 그 클래스가 빠진다. */
  content: ['./*.html', './assets/*.js'],

  ...tailwind.config,

  plugins: [
    require('@tailwindcss/forms'),             // 검색창 <input> 6곳에 실제로 적용된다
    require('@tailwindcss/container-queries'), // 현재 미사용. 반응형을 컨테이너 기준으로 바꿀 때 쓴다
  ],
};
