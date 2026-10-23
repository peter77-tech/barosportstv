"""카드 글꼴(assets/review/fonts/NotoSansKR-Bold.ttf)이 실제로 그릴 수 있는 글자를 charset.txt 로 뽑는다.
   글꼴을 다시 만들면 반드시 이 스크립트를 다시 돌려 함께 커밋한다.  사용: python tools/review/font-charset.py
   (글꼴 이름표 정리도 같은 글꼴을 다루므로 여기 --rename 으로 둔다.)"""
import sys
from fontTools.ttLib import TTFont

FONT = 'assets/review/fonts/NotoSansKR-Bold.ttf'
OUT = 'assets/review/fonts/charset.txt'
f = TTFont(FONT)

if '--rename' in sys.argv:
    for n in f['name'].names:
        if n.nameID in (1, 16): n.string = 'Noto Sans KR'
        elif n.nameID in (2, 17): n.string = 'Bold'
        elif n.nameID == 4: n.string = 'Noto Sans KR Bold'
        elif n.nameID == 6: n.string = 'NotoSansKR-Bold'
        elif n.nameID == 3: n.string = '2.004;ADBO;NotoSansKR-Bold;ADOBE'
    f.save(FONT)

cmap = f.getBestCmap()
chars = ''.join(chr(c) for c in sorted(cmap) if c > 0x20 and not 0x7F <= c <= 0x9F)
open(OUT, 'w', encoding='utf8', newline='\n').write(chars + '\n')
print(len(chars), 'chars')
