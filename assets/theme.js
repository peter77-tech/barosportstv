/* 바로스포츠티비 — 디자인 토큰
 * 출처: Google Stitch / Hermes Orange Sports > "Arena Live - Home (SEO Content)"
 * 시안의 tailwind.config를 그대로 옮기되, 시안에 없어서 무효였던 토큰을 보완했다.
 *
 * ✅ 빌드 전환 완료 (2026-08-19). 이 파일이 디자인 토큰의 유일한 원본이다.
 *    tailwind.config.js 가 이 파일을 읽어서 쓰므로, 토큰은 여기만 고친다.
 *    고친 뒤에는 반드시 `npm run build:css` 를 돌려 assets/tailwind.css 를 다시 만든다.
 *    (브라우저에서는 더 이상 로드되지 않는다 — 빌드 시점에만 읽힌다)
 */
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── 브랜드 (시안 원본값) ───────────────────────────── */
        'hermes-orange': '#E85110',
        'apex-blue': '#1B4D94',
        'shadow-navy': '#0F172A',

        /* ── 표면 ─────────────────────────────────────────── */
        background: '#fbf9f9',
        surface: '#fbf9f9',
        'surface-bright': '#fbf9f9',
        'surface-dim': '#dbdad9',
        'surface-variant': '#e3e2e2',
        'surface-tint': '#ab3600',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f5f3f3',
        'surface-container': '#efeded',
        'surface-container-high': '#e9e8e7',
        'surface-container-highest': '#e3e2e2',
        'inverse-surface': '#303031',
        'inverse-on-surface': '#f2f0f0',

        /* ── 전경 ─────────────────────────────────────────── */
        'on-surface': '#1b1c1c',
        'on-surface-variant': '#5a4138',
        'on-background': '#1b1c1c',
        outline: '#8f7066',
        'outline-variant': '#e3bfb3',

        /* ── 역할색 ───────────────────────────────────────── */
        primary: '#a73400',
        'on-primary': '#ffffff',
        'primary-container': '#d14300',
        'primary-hover': '#a03300',
        'on-primary-container': '#fffbff',
        'primary-fixed': '#ffdbcf',
        'primary-fixed-dim': '#ffb59c',
        'on-primary-fixed': '#390c00',
        'on-primary-fixed-variant': '#822700',
        'inverse-primary': '#ffb59c',

        secondary: '#5f5e5e',
        'on-secondary': '#ffffff',
        'secondary-container': '#e2dfde',
        'on-secondary-container': '#636262',
        'secondary-fixed': '#e5e2e1',
        'secondary-fixed-dim': '#c8c6c5',
        'on-secondary-fixed': '#1c1b1b',
        'on-secondary-fixed-variant': '#474746',

        tertiary: '#5b5c5c',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#737575',
        'on-tertiary-container': '#fcfcfc',
        'tertiary-fixed': '#e2e2e2',
        'tertiary-fixed-dim': '#c6c6c7',
        'on-tertiary-fixed': '#1a1c1c',
        'on-tertiary-fixed-variant': '#454747',

        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',

        'glass-border': 'rgba(255, 255, 255, 0.4)',
        'bg-gradient-start': '#F8FAFC',
        'bg-gradient-end': '#F1F5F9',
      },

      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
        pill: '9999px', // 보완: 시안이 full(0.75rem)을 덮어써서 원형이 안 나왔다
      },

      spacing: {
        base: '8px',
        'stack-sm': '8px',
        'stack-md': '16px',
        'stack-lg': '32px',
        'margin-mobile': '16px',
        gutter: '24px',
        'margin-desktop': '40px',
        'section-gap': '80px',
      },

      // 보완: 시안이 max-w-container-max를 썼으나 정의가 없어 무효 클래스였다.
      // 값은 Stitch 디자인 시스템 원본(Apex Broadcast System)의 spacing.container-max를 따른다.
      maxWidth: { 'container-max': '1280px' },

      fontFamily: {
        'display-lg': ['Montserrat', 'system-ui', 'sans-serif'],
        'headline-lg': ['Montserrat', 'system-ui', 'sans-serif'],
        'headline-lg-mobile': ['Montserrat', 'system-ui', 'sans-serif'],
        'headline-md': ['Montserrat', 'system-ui', 'sans-serif'],
        'label-caps': ['Montserrat', 'system-ui', 'sans-serif'],
        'body-lg': ['Inter', 'system-ui', 'sans-serif'],
        'body-md': ['Inter', 'system-ui', 'sans-serif'],
        'body-sm': ['Inter', 'system-ui', 'sans-serif'],
        'label-data': ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        'display-lg': ['64px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-lg-mobile': ['38px', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-lg': ['40px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-lg-mobile': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '1.3', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '1', letterSpacing: '0.1em', fontWeight: '700' }],
        'label-data': ['14px', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '500' }],
      },
    },
  },
};
