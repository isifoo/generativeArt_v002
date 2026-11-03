import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, lib
from PIL import Image
R = [(560,730,490,700,'forehead'),(740,790,300,520,'brow L'),(830,900,330,480,'eyebag L'),(830,900,570,630,'eyebag R'),(940,1010,260,360,'cheek'),(1030,1140,330,420,'mustache L'),(1080,1135,430,570,'mouth'),(1140,1270,440,600,'beard'),(1040,1380,600,760,'shirt R1'),(1130,1400,790,910,'shirt R2'),(1200,1290,150,290,'neck L')]
m = lib.load_marks()
print('%-12s' % 'file' + ''.join('%10s' % r[4][:9] for r in R))
for f in sys.argv[1:]:
    ink = np.asarray(Image.open(f).convert('L')) < 128
    near = lib.dilate(ink, 6)
    row = []
    for y0, y1, x0, x1, n in R:
        mm = m[y0:y1, x0:x1]; row.append(100 * (near[y0:y1, x0:x1] & mm).sum() / max(mm.sum(), 1))
    print('%-12s' % os.path.basename(f) + ''.join('%10.0f' % v for v in row))
