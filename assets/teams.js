/* 바로스포츠티비 — 공용 팀 사전
   ==================================================================
   팀 이름을 쓰는 곳이 네 군데다. 사전을 한 곳에 모아 어긋나지 않게 한다.
     · search.js   상단바 검색 색인
     · user.js     「팀 추가」 자동완성 · 저장한 팀 표시
     · data.js     실제 데이터의 영문 팀명을 화면에 한글로 보여줄 때
     · 화면 마크업 하드코딩 (연동 실패 시 남는 내용)

   ⚠️ 저장·조회의 기준 이름은 **영문**(`en`)이다
     TheSportsDB 는 영문으로만 검색된다. 한글 이름을 API 에 넘기면
     팀을 못 찾아 기본 팀(Arsenal)이 뜬다 — 실제로 물렸습니다.
     그래서 localStorage 에도 영문을 넣고, 보여줄 때만 한글로 바꾼다.

   ⚠️ 사전에 없는 팀은 영문으로 남는다
     무료 테스트 키는 리그를 고를 수 없어 USL·아르헨티나 2부 팀이 섞여 온다.
     그런 팀까지 사전에 넣을 수는 없으므로 `ko()` 는 못 찾으면 원문을 돌려준다.

   한 줄 = [한글, 리그, 검색 별칭, 영문(API 기준), 약칭]
   ================================================================== */
(function () {
  'use strict';

  var ROWS = [
    ['아스날',       'Premier League', 'arsenal',              'Arsenal',              'ARS'],
    ['첼시',         'Premier League', 'chelsea',              'Chelsea',              'CHE'],
    ['리버풀',       'Premier League', 'liverpool',            'Liverpool',            'LIV'],
    ['맨시티',       'Premier League', 'man city manchester',  'Manchester City',      'MCI'],
    ['맨유',         'Premier League', 'man utd manchester united', 'Manchester United', 'MUN'],
    ['토트넘',       'Premier League', 'tottenham spurs',      'Tottenham',            'TOT'],
    ['뉴캐슬',       'Premier League', 'newcastle',            'Newcastle',            'NEW'],
    ['브라이턴',     'Premier League', 'brighton',             'Brighton',             'BHA'],
    ['바르셀로나',   'La Liga',        'barcelona barca',      'Barcelona',            'FCB'],
    ['세비야',       'La Liga',        'sevilla',              'Sevilla',              'SEV'],
    ['레알 마드리드', 'La Liga',       'real madrid',          'Real Madrid',          'RMA'],
    ['아틀레티코',   'La Liga',        'atletico',             'Atletico Madrid',      'ATM'],
    ['레이커스',     'NBA',            'lakers',               'Los Angeles Lakers',   'LAL'],
    ['워리어스',     'NBA',            'warriors',             'Golden State Warriors','GSW'],
    ['셀틱스',       'NBA',            'celtics',              'Boston Celtics',       'BOS'],
    ['히트',         'NBA',            'heat',                 'Miami Heat',           'MIA'],
    ['다저스',       'MLB',            'dodgers',              'Los Angeles Dodgers',  'LAD'],
    ['양키스',       'MLB',            'yankees',              'New York Yankees',     'NYY'],
    ['울산',         'K-League',       'ulsan',                'Ulsan Hyundai',        'ULS'],
    ['전북',         'K-League',       'jeonbuk',              'Jeonbuk Motors',       'JBM'],
    ['LG 트윈스',    'KBO',            'lg twins 엘지',        'LG Twins',             'LG'],

    /* KBO·NPB — 리그 등급 1군에 올라와 홈 첫 화면을 차지하므로 사전에 넣는다.
       영문 이름은 추측하지 않고 프리베이크 데이터에서 그대로 옮겼다
       (2026-08-23 실측). API 이름과 한 글자라도 다르면 팀을 못 찾는다. */
    ['두산 베어스',  'KBO',            'doosan bears 두산',    'Doosan Bears',         'OB'],
    ['KT 위즈',      'KBO',            'kt wiz 케이티',        'KT Wiz',               'KT'],
    ['SSG 랜더스',   'KBO',            'ssg landers 랜더스',   'SSG Landers',          'SSG'],
    ['NC 다이노스',  'KBO',            'nc dinos 엔씨',        'NC Dinos',             'NC'],
    ['KIA 타이거즈', 'KBO',            'kia tigers 기아',      'Kia Tigers',           'KIA'],
    ['삼성 라이온즈', 'KBO',           'samsung lions 삼성',   'Samsung Lions',        'SS'],
    ['롯데 자이언츠', 'KBO',           'lotte giants 롯데',    'Lotte Giants',         'LOT'],
    ['한화 이글스',  'KBO',            'hanwha eagles 한화',   'Hanwha Eagles',        'HH'],
    ['키움 히어로즈', 'KBO',           'kiwoom heroes 키움',   'Kiwoom Heroes',        'KIW'],

    ['요미우리',     'NPB',            'yomiuri giants 자이언츠', 'Yomiuri Giants',    'YOM'],
    ['한신',         'NPB',            'hanshin tigers 타이거스', 'Hanshin Tigers',    'HAN'],
    ['주니치',       'NPB',            'chunichi dragons 드래곤즈', 'Chunichi Dragons', 'CHU'],
    ['히로시마',     'NPB',            'hiroshima carp 카프',  'Hiroshima Toyo Carp',  'HIR'],
    ['야쿠르트',     'NPB',            'yakult swallows 스왈로즈', 'Tokyo Yakult Swallows', 'YAK'],
    ['요코하마',     'NPB',            'yokohama dena baystars 베이스타즈', 'Yokohama DeNA BayStars', 'YOK'],
    ['소프트뱅크',   'NPB',            'softbank hawks 호크스', 'Fukuoka SoftBank Hawks', 'SFT'],
    ['세이부',       'NPB',            'seibu lions 라이온즈', 'Saitama Seibu Lions',  'SEI'],
    ['라쿠텐',       'NPB',            'rakuten eagles 이글스', 'Tohoku Rakuten Golden Eagles', 'RAK'],
    ['지바 롯데',    'NPB',            'chiba lotte marines 마린스', 'Chiba Lotte Marines', 'CLM'],
    ['오릭스',       'NPB',            'orix buffaloes 버팔로즈', 'Orix Buffaloes',    'ORI'],
    ['니혼햄',       'NPB',            'nippon ham fighters 파이터즈', 'Hokkaido Nippon-Ham Fighters', 'NIP'],

    /* MLB·NFL·WNBA — 1군에 올라와 홈·일정 첫 화면을 차지한다.
       영문 이름은 프리베이크 데이터에서 그대로 옮겼다 (2026-08-23 실측). */
    ['애리조나 다이아몬드백스',  'MLB',               'arizona diamondbacks 애리조나',         'Arizona Diamondbacks',            'ARI'],
    ['애슬레틱스',         'MLB',               'athletics oakland 애슬레틱스',           'Athletics',                       'ATH'],
    ['애틀랜타 브레이브스',    'MLB',               'atlanta braves 브레이브스',              'Atlanta Braves',                  'ATL'],
    ['볼티모어 오리올스',     'MLB',               'baltimore orioles 오리올스',            'Baltimore Orioles',               'BAL'],
    ['보스턴 레드삭스',      'MLB',               'boston red sox 레드삭스',               'Boston Red Sox',                  'BOS'],
    ['시카고 컵스',        'MLB',               'chicago cubs 컵스',                   'Chicago Cubs',                    'CHC'],
    ['시카고 화이트삭스',     'MLB',               'chicago white sox 화이트삭스',           'Chicago White Sox',               'CWS'],
    ['신시내티 레즈',       'MLB',               'cincinnati reds 레즈',                'Cincinnati Reds',                 'CIN'],
    ['클리블랜드 가디언스',    'MLB',               'cleveland guardians 가디언스',          'Cleveland Guardians',             'CLE'],
    ['콜로라도 로키스',      'MLB',               'colorado rockies 로키스',              'Colorado Rockies',                'COL'],
    ['디트로이트 타이거스',    'MLB',               'detroit tigers 타이거스',               'Detroit Tigers',                  'DET'],
    ['휴스턴 애스트로스',     'MLB',               'houston astros 애스트로스',              'Houston Astros',                  'HOU'],
    ['캔자스시티 로열스',     'MLB',               'kansas city royals 로열스',            'Kansas City Royals',              'KC'],
    ['LA 에인절스',       'MLB',               'los angeles angels 에인절스',           'Los Angeles Angels',              'LAA'],
    ['마이애미 말린스',      'MLB',               'miami marlins 말린스',                 'Miami Marlins',                   'MIA'],
    ['밀워키 브루어스',      'MLB',               'milwaukee brewers 브루어스',            'Milwaukee Brewers',               'MIL'],
    ['미네소타 트윈스',      'MLB',               'minnesota twins 트윈스',               'Minnesota Twins',                 'MIN'],
    ['뉴욕 메츠',         'MLB',               'new york mets 메츠',                  'New York Mets',                   'NYM'],
    ['필라델피아 필리스',     'MLB',               'philadelphia phillies 필리스',         'Philadelphia Phillies',           'PHI'],
    ['피츠버그 파이리츠',     'MLB',               'pittsburgh pirates 파이리츠',           'Pittsburgh Pirates',              'PIT'],
    ['샌디에이고 파드리스',    'MLB',               'san diego padres 파드리스',             'San Diego Padres',                'SD'],
    ['샌프란시스코 자이언츠',   'MLB',               'san francisco giants 자이언츠',         'San Francisco Giants',            'SF'],
    ['시애틀 매리너스',      'MLB',               'seattle mariners 매리너스',             'Seattle Mariners',                'SEA'],
    ['세인트루이스 카디널스',   'MLB',               'st louis cardinals 카디널스',           'St. Louis Cardinals',             'STL'],
    ['탬파베이 레이스',      'MLB',               'tampa bay rays 레이스',                'Tampa Bay Rays',                  'TB'],
    ['텍사스 레인저스',      'MLB',               'texas rangers 레인저스',                'Texas Rangers',                   'TEX'],
    ['토론토 블루제이스',     'MLB',               'toronto blue jays 블루제이스',           'Toronto Blue Jays',               'TOR'],
    ['워싱턴 내셔널스',      'MLB',               'washington nationals 내셔널스',         'Washington Nationals',            'WSH'],
    ['애리조나 카디널스',     'NFL',               'arizona cardinals 카디널스',            'Arizona Cardinals',               'ARI'],
    ['애틀랜타 팰컨스',      'NFL',               'atlanta falcons 팰컨스',               'Atlanta Falcons',                 'ATL'],
    ['볼티모어 레이븐스',     'NFL',               'baltimore ravens 레이븐스',             'Baltimore Ravens',                'BAL'],
    ['버펄로 빌스',        'NFL',               'buffalo bills 빌스',                  'Buffalo Bills',                   'BUF'],
    ['캐롤라이나 팬서스',     'NFL',               'carolina panthers 팬서스',             'Carolina Panthers',               'CAR'],
    ['시카고 베어스',       'NFL',               'chicago bears 베어스',                 'Chicago Bears',                   'CHI'],
    ['신시내티 벵골스',      'NFL',               'cincinnati bengals 벵골스',            'Cincinnati Bengals',              'CIN'],
    ['클리블랜드 브라운스',    'NFL',               'cleveland browns 브라운스',             'Cleveland Browns',                'CLE'],
    ['댈러스 카우보이스',     'NFL',               'dallas cowboys 카우보이스',              'Dallas Cowboys',                  'DAL'],
    ['덴버 브롱코스',       'NFL',               'denver broncos 브롱코스',               'Denver Broncos',                  'DEN'],
    ['디트로이트 라이온스',    'NFL',               'detroit lions 라이온스',                'Detroit Lions',                   'DET'],
    ['그린베이 패커스',      'NFL',               'green bay packers 패커스',             'Green Bay Packers',               'GB'],
    ['휴스턴 텍산스',       'NFL',               'houston texans 텍산스',                'Houston Texans',                  'HOU'],
    ['인디애나폴리스 콜츠',    'NFL',               'indianapolis colts 콜츠',             'Indianapolis Colts',              'IND'],
    ['잭슨빌 재규어스',      'NFL',               'jacksonville jaguars 재규어스',         'Jacksonville Jaguars',            'JAX'],
    ['캔자스시티 치프스',     'NFL',               'kansas city chiefs 치프스',            'Kansas City Chiefs',              'KC'],
    ['라스베이거스 레이더스',   'NFL',               'las vegas raiders 레이더스',            'Las Vegas Raiders',               'LV'],
    ['LA 차저스',        'NFL',               'los angeles chargers 차저스',          'Los Angeles Chargers',            'LAC'],
    ['LA 램스',         'NFL',               'los angeles rams 램스',               'Los Angeles Rams',                'LAR'],
    ['마이애미 돌핀스',      'NFL',               'miami dolphins 돌핀스',                'Miami Dolphins',                  'MIA'],
    ['미네소타 바이킹스',     'NFL',               'minnesota vikings 바이킹스',            'Minnesota Vikings',               'MIN'],
    ['뉴잉글랜드 패트리어츠',   'NFL',               'new england patriots 패트리어츠',        'New England Patriots',            'NE'],
    ['뉴올리언스 세인츠',     'NFL',               'new orleans saints 세인츠',            'New Orleans Saints',              'NO'],
    ['뉴욕 자이언츠',       'NFL',               'new york giants 자이언츠',              'New York Giants',                 'NYG'],
    ['뉴욕 제츠',         'NFL',               'new york jets 제츠',                  'New York Jets',                   'NYJ'],
    ['필라델피아 이글스',     'NFL',               'philadelphia eagles 이글스',           'Philadelphia Eagles',             'PHI'],
    ['피츠버그 스틸러스',     'NFL',               'pittsburgh steelers 스틸러스',          'Pittsburgh Steelers',             'PIT'],
    ['샌프란시스코 포티나이너스', 'NFL',               'san francisco 49ers 포티나이너스',        'San Francisco 49ers',             'SF'],
    ['시애틀 시호크스',      'NFL',               'seattle seahawks 시호크스',             'Seattle Seahawks',                'SEA'],
    ['탬파베이 버커니어스',    'NFL',               'tampa bay buccaneers 버커니어스',        'Tampa Bay Buccaneers',            'TB'],
    ['테네시 타이탄스',      'NFL',               'tennessee titans 타이탄스',             'Tennessee Titans',                'TEN'],
    ['워싱턴 커맨더스',      'NFL',               'washington commanders 커맨더스',        'Washington Commanders',           'WAS'],
    ['애틀랜타 드림',       'WNBA',              'atlanta dream 드림',                  'Atlanta Dream',                   'ATL'],
    ['시카고 스카이',       'WNBA',              'chicago sky 스카이',                   'Chicago Sky',                     'CHI'],
    ['코네티컷 선',        'WNBA',              'connecticut sun 코네티컷',              'Connecticut Sun',                 'CON'],
    ['댈러스 윙스',        'WNBA',              'dallas wings 윙스',                   'Dallas Wings',                    'DAL'],
    ['골든스테이트 발키리스',   'WNBA',              'golden state valkyries 발키리스',       'Golden State Valkyries',          'GSV'],
    ['인디애나 피버',       'WNBA',              'indiana fever 피버',                  'Indiana Fever',                   'IND'],
    ['라스베이거스 에이시스',   'WNBA',              'las vegas aces 에이시스',               'Las Vegas Aces',                  'LVA'],
    ['LA 스파크스',       'WNBA',              'los angeles sparks 스파크스',           'Los Angeles Sparks',              'LAS'],
    ['미네소타 링스',       'WNBA',              'minnesota lynx 링스',                 'Minnesota Lynx',                  'MIN'],
    ['뉴욕 리버티',        'WNBA',              'new york liberty 리버티',              'New York Liberty',                'NYL'],
    ['피닉스 머큐리',       'WNBA',              'phoenix mercury 머큐리',               'Phoenix Mercury',                 'PHO'],
    ['포틀랜드 파이어',      'WNBA',              'portland fire 파이어',                 'Portland Fire',                   'POR'],
    ['시애틀 스톰',        'WNBA',              'seattle storm 스톰',                  'Seattle Storm',                   'SEA'],
    ['토론토 템포',        'WNBA',              'toronto tempo 템포',                  'Toronto Tempo',                   'TOR'],
    ['워싱턴 미스틱스',      'WNBA',              'washington mystics 미스틱스',           'Washington Mystics',              'WAS'],

    /* 유럽 5대리그·K리그1 — 1군. 영문 이름은 프리베이크 데이터 실측 (2026-08-23). */
    ['아스톤 빌라',     'Premier League',    'aston villa 빌라',                        'Aston Villa',                 'AVL'],
    ['본머스',        'Premier League',    'bournemouth 본머스',                       'Bournemouth',                 'BOU'],
    ['브렌트포드',      'Premier League',    'brentford 브렌트포드',                       'Brentford',                   'BRE'],
    ['코번트리 시티',    'Premier League',    'coventry city 코번트리',                    'Coventry City',               'COV'],
    ['크리스탈 팰리스',   'Premier League',    'crystal palace 팰리스',                    'Crystal Palace',              'CRY'],
    ['에버턴',        'Premier League',    'everton 에버턴',                           'Everton',                     'EVE'],
    ['풀럼',         'Premier League',    'fulham 풀럼',                             'Fulham',                      'FUL'],
    ['헐 시티',       'Premier League',    'hull city 헐',                           'Hull City',                   'HUL'],
    ['입스위치 타운',    'Premier League',    'ipswich town 입스위치',                     'Ipswich Town',                'IPS'],
    ['리즈 유나이티드',   'Premier League',    'leeds united 리즈',                       'Leeds United',                'LEE'],
    ['노팅엄 포레스트',   'Premier League',    'nottingham forest 노팅엄',                 'Nottingham Forest',           'NFO'],
    ['선더랜드',       'Premier League',    'sunderland 선더랜드',                       'Sunderland',                  'SUN'],
    ['아틀레틱 빌바오',   'La Liga',           'athletic bilbao 빌바오',                   'Athletic Bilbao',             'ATH'],
    ['아틀레티코 마드리드', 'La Liga',           'atletico madrid 아틀레티코',                 'Atlético Madrid',             'ATM'],
    ['셀타 비고',      'La Liga',           'celta vigo 셀타',                         'Celta Vigo',                  'CEL'],
    ['알라베스',       'La Liga',           'alaves 알라베스',                           'Deportivo Alavés',            'ALA'],
    ['데포르티보',      'La Liga',           'deportivo coruna 데포르티보',                'Deportivo de A Coruña',       'DEP'],
    ['엘체',         'La Liga',           'elche 엘체',                              'Elche',                       'ELC'],
    ['에스파뇰',       'La Liga',           'espanyol 에스파뇰',                         'Espanyol',                    'ESP'],
    ['헤타페',        'La Liga',           'getafe 헤타페',                            'Getafe',                      'GET'],
    ['레반테',        'La Liga',           'levante 레반테',                           'Levante',                     'LEV'],
    ['말라가',        'La Liga',           'malaga 말라가',                            'Málaga',                      'MAL'],
    ['오사수나',       'La Liga',           'osasuna 오사수나',                          'Osasuna',                     'OSA'],
    ['라싱 산탄데르',    'La Liga',           'racing santander 라싱',                   'Racing de Santander',         'RAC'],
    ['레알 베티스',     'La Liga',           'real betis 베티스',                        'Real Betis',                  'BET'],
    ['레알 소시에다드',   'La Liga',           'real sociedad 소시에다드',                   'Real Sociedad',               'RSO'],
    ['발렌시아',       'La Liga',           'valencia 발렌시아',                         'Valencia',                    'VAL'],
    ['비야레알',       'La Liga',           'villarreal 비야레알',                       'Villarreal',                  'VIL'],
    ['AC 밀란',      'Serie A',           'ac milan 밀란',                           'AC Milan',                    'MIL'],
    ['아탈란타',       'Serie A',           'atalanta 아탈란타',                         'Atalanta',                    'ATA'],
    ['볼로냐',        'Serie A',           'bologna 볼로냐',                           'Bologna',                     'BOL'],
    ['칼리아리',       'Serie A',           'cagliari 칼리아리',                         'Cagliari',                    'CAG'],
    ['코모',         'Serie A',           'como 코모',                               'Como',                        'COM'],
    ['피오렌티나',      'Serie A',           'fiorentina 피오렌티나',                      'Fiorentina',                  'FIO'],
    ['프로시노네',      'Serie A',           'frosinone 프로시노네',                       'Frosinone',                   'FRO'],
    ['제노아',        'Serie A',           'genoa 제노아',                             'Genoa',                       'GEN'],
    ['인터 밀란',      'Serie A',           'inter milan 인터',                        'Inter Milan',                 'INT'],
    ['유벤투스',       'Serie A',           'juventus 유벤투스',                         'Juventus',                    'JUV'],
    ['라치오',        'Serie A',           'lazio 라치오',                             'Lazio',                       'LAZ'],
    ['레체',         'Serie A',           'lecce 레체',                              'Lecce',                       'LEC'],
    ['몬차',         'Serie A',           'monza 몬차',                              'Monza',                       'MON'],
    ['나폴리',        'Serie A',           'napoli 나폴리',                            'Napoli',                      'NAP'],
    ['파르마',        'Serie A',           'parma 파르마',                             'Parma',                       'PAR'],
    ['로마',         'Serie A',           'roma 로마',                               'Roma',                        'ROM'],
    ['사수올로',       'Serie A',           'sassuolo 사수올로',                         'Sassuolo',                    'SAS'],
    ['토리노',        'Serie A',           'torino 토리노',                            'Torino',                      'TOR'],
    ['우디네세',       'Serie A',           'udinese 우디네세',                          'Udinese',                     'UDI'],
    ['베네치아',       'Serie A',           'venezia 베네치아',                          'Venezia',                     'VEN'],
    ['바이어 레버쿠젠',   'Bundesliga',        'bayer leverkusen 레버쿠젠',                 'Bayer Leverkusen',            'B04'],
    ['바이에른 뮌헨',    'Bundesliga',        'bayern munich munchen 뮌헨',              'Bayern Munich',               'FCB'],
    ['도르트문트',      'Bundesliga',        'borussia dortmund 도르트문트',               'Borussia Dortmund',           'BVB'],
    ['묀헨글라트바흐',    'Bundesliga',        'borussia monchengladbach 글라트바흐',        'Borussia Mönchengladbach',    'BMG'],
    ['프랑크푸르트',     'Bundesliga',        'eintracht frankfurt 프랑크푸르트',            'Eintracht Frankfurt',         'SGE'],
    ['엘버스베르크',     'Bundesliga',        'elversberg 엘버스베르크',                     'Elversberg',                  'ELV'],
    ['함부르크',       'Bundesliga',        'hamburg hamburger 함부르크',                'Hamburg',                     'HSV'],
    ['호펜하임',       'Bundesliga',        'hoffenheim 호펜하임',                       'Hoffenheim',                  'TSG'],
    ['쾰른',         'Bundesliga',        'koln cologne 쾰른',                       'Köln',                        'KOE'],
    ['마인츠',        'Bundesliga',        'mainz 마인츠',                             'Mainz',                       'M05'],
    ['파더보른',       'Bundesliga',        'paderborn 파더보른',                        'Paderborn',                   'SCP'],
    ['RB 라이프치히',   'Bundesliga',        'rb leipzig 라이프치히',                      'RB Leipzig',                  'RBL'],
    ['슈투트가르트',     'Bundesliga',        'stuttgart 슈투트가르트',                      'Stuttgart',                   'VFB'],
    ['우니온 베를린',    'Bundesliga',        'union berlin 우니온',                      'Union Berlin',                'FCU'],
    ['앙제',         'Ligue 1',           'angers 앙제',                             'Angers',                      'ANG'],
    ['오세르',        'Ligue 1',           'auxerre 오세르',                           'Auxerre',                     'AUX'],
    ['브레스트',       'Ligue 1',           'brest 브레스트',                            'Brest',                       'BRS'],
    ['르아브르',       'Ligue 1',           'le havre 르아브르',                         'Le Havre',                    'HAC'],
    ['르망',         'Ligue 1',           'le mans 르망',                            'Le Mans',                     'LMA'],
    ['랑스',         'Ligue 1',           'lens 랑스',                               'Lens',                        'RCL'],
    ['릴',          'Ligue 1',           'lille 릴',                               'Lille',                       'LIL'],
    ['로리앙',        'Ligue 1',           'lorient 로리앙',                           'Lorient',                     'FCL'],
    ['리옹',         'Ligue 1',           'lyon 리옹',                               'Lyon',                        'OL'],
    ['모나코',        'Ligue 1',           'monaco 모나코',                            'Monaco',                      'ASM'],
    ['니스',         'Ligue 1',           'nice 니스',                               'Nice',                        'NIC'],
    ['파리 FC',      'Ligue 1',           'paris fc 파리',                           'Paris FC',                    'PFC'],
    ['파리 생제르맹',    'Ligue 1',           'paris saint germain psg 생제르맹',          'Paris Saint-Germain',         'PSG'],
    ['렌',          'Ligue 1',           'rennes 렌',                              'Rennes',                      'REN'],
    ['스트라스부르',     'Ligue 1',           'strasbourg 스트라스부르',                     'Strasbourg',                  'STR'],
    ['툴루즈',        'Ligue 1',           'toulouse 툴루즈',                          'Toulouse',                    'TFC'],
    ['트루아',        'Ligue 1',           'troyes 트루아',                            'Troyes',                      'TRO'],
    ['부천 FC',      'K-League',          'bucheon 부천',                            'Bucheon FC 1995',             'BCN'],
    ['대전 하나 시티즌',  'K-League',          'daejeon hana 대전',                       'Daejeon Hana Citizen',        'DJN'],
    ['FC 안양',      'K-League',          'anyang 안양',                             'FC Anyang',                   'ANY'],
    ['FC 서울',      'K-League',          'fc seoul 서울',                           'FC Seoul',                    'SEO'],
    ['강원 FC',      'K-League',          'gangwon 강원',                            'Gangwon FC',                  'GWN'],
    ['김천 상무',      'K-League',          'gimcheon sangmu 김천',                    'Gimcheon Sangmu',             'GMC'],
    ['광주 FC',      'K-League',          'gwangju 광주',                            'Gwangju FC',                  'GJU'],
    ['인천 유나이티드',   'K-League',          'incheon united 인천',                     'Incheon United',              'ICN'],
    ['제주 SK',      'K-League',          'jeju sk 제주',                            'Jeju SK',                     'JEJ'],
    ['전북 현대',      'K-League',          'jeonbuk hyundai motors 전북',             'Jeonbuk Hyundai Motors',      'JBK'],
    ['포항 스틸러스',    'K-League',          'pohang steelers 포항',                    'Pohang Steelers',             'POH'],
    ['울산 HD',      'K-League',          'ulsan hd 울산',                           'Ulsan HD',                    'ULH']
  ];

  var LIST = ROWS.map(function (r) {
    return { ko: r[0], league: r[1], alias: r[2], en: r[3], abbr: r[4] };
  });

  function norm(v) { return String(v || '').toLowerCase().replace(/\s+/g, ''); }

  var BY_EN = {};
  LIST.forEach(function (t) { BY_EN[norm(t.en)] = t; });

  /* 영문 팀명 → 사전 항목. 없으면 null.
     API 가 'Arsenal FC' 처럼 접미사를 붙여 오는 경우가 있어 부분 일치도 본다. */
  function get(name) {
    var n = norm(name);
    if (!n) return null;
    if (BY_EN[n]) return BY_EN[n];
    for (var i = 0; i < LIST.length; i++) {
      var e = norm(LIST[i].en);
      if (n.indexOf(e) === 0 || e.indexOf(n) === 0) return LIST[i];
    }
    return null;
  }

  /* 화면에 보여줄 이름. 사전에 없으면 원문을 그대로 돌려준다. */
  /* FIBA 대회는 팀 이름이 「국가 + Basketball」 로 온다 (실측 60팀).
     팀마다 한 줄씩 적는 대신 국가 이름만 옮긴다. */
  var COUNTRY = {
    'south korea': '한국', 'japan': '일본', 'china': '중국', 'united states': '미국',
    'canada': '캐나다', 'mexico': '멕시코', 'brazil': '브라질', 'argentina': '아르헨티나',
    'uruguay': '우루과이', 'chile': '칠레', 'colombia': '콜롬비아', 'panama': '파나마',
    'dominican republic': '도미니카공화국', 'puerto rico': '푸에르토리코', 'bahamas': '바하마',
    'spain': '스페인', 'france': '프랑스', 'germany': '독일', 'italy': '이탈리아',
    'serbia': '세르비아', 'slovenia': '슬로베니아', 'croatia': '크로아티아',
    'greece': '그리스', 'turkey': '튀르키예', 'lithuania': '리투아니아', 'latvia': '라트비아',
    'estonia': '에스토니아', 'finland': '핀란드', 'sweden': '스웨덴', 'iceland': '아이슬란드',
    'poland': '폴란드', 'hungary': '헝가리', 'montenegro': '몬테네그로', 'ukraine': '우크라이나',
    'georgia': '조지아', 'bosnia-herzegovina': '보스니아', 'portugal': '포르투갈',
    'netherlands': '네덜란드', 'israel': '이스라엘', 'iran': '이란', 'lebanon': '레바논',
    'jordan': '요르단', 'qatar': '카타르', 'saudi arabia': '사우디', 'syria': '시리아',
    'philippines': '필리핀', 'australia': '호주', 'new zealand': '뉴질랜드',
    'nigeria': '나이지리아', 'senegal': '세네갈', 'angola': '앙골라', 'egypt': '이집트',
    'tunisia': '튀니지', 'cameroon': '카메룬', 'mali': '말리', 'guinea': '기니',
    'ivory coast': '코트디부아르', 'cape verde': '카보베르데', 'd.r. congo': '콩고민주공화국',
    'south sudan': '남수단'
  };

  function ko(name) {
    var raw = String(name || '');

    /* 🔴 여자부를 **가장 먼저** 본다. get() 은 접두사로 맞추므로
       `juventus women` 이 `juventus` 로 잡혀 **여자 경기가 남자팀 이름으로**
       표시된다 (실측으로 실제로 그랬다). 순서를 바꾸지 마십시오.
       여자부를 사전에 따로 한 줄씩 적지 않는 이유: 사전이 두 배가 되고
       한쪽만 고쳐져 어긋나기 쉽다. */
    var w = raw.match(/^(.+?)\s+(Women|Femenino|Femminile)$/i);
    if (w) {
      var base = get(w[1]);
      return base ? base.ko + ' 여자' : raw;
    }

    var t = get(name);
    if (t) return t.ko;

    /* 「국가 + Basketball」 = FIBA 국가대표 */
    var b = raw.match(/^(.+?)\s+Basketball$/i);
    if (b && COUNTRY[b[1].toLowerCase()]) return COUNTRY[b[1].toLowerCase()];

    return raw;
  }

  /* 약칭. 사전에 없으면 null (부르는 쪽에서 API 값이나 자동 약칭을 쓴다) */
  function abbr(name) {
    var t = get(name);
    return t ? t.abbr : null;
  }

  /* 「팀 추가」 자동완성 — 한글·영문·별칭·리그 전부로 찾는다 */
  function find(query, max) {
    var n = norm(query);
    if (!n) return [];
    var hits = [];
    for (var i = 0; i < LIST.length && hits.length < (max || 6); i++) {
      var t = LIST[i];
      if (norm(t.ko).indexOf(n) >= 0 || norm(t.en).indexOf(n) >= 0 ||
          norm(t.alias).indexOf(n) >= 0 || norm(t.league).indexOf(n) >= 0) {
        hits.push(t);
      }
    }
    return hits;
  }

  window.ArenaTeams = { list: LIST, get: get, ko: ko, abbr: abbr, find: find };
})();
