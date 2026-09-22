"""Génère les icônes PNG de l'appli (même dessin que public/icone.svg). Lancer : python outils/icones.py"""
from PIL import Image, ImageDraw

def icone(taille, marge=0.0):
    s = 4  # suréchantillonnage pour des bords lisses
    T = taille * s
    img = Image.new('RGBA', (T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if marge:  # « maskable » : fond plein, dessin réduit dans la zone sûre
        d.rectangle([0, 0, T, T], fill='#6b3fa0')
    else:
        d.rounded_rectangle([0, 0, T - 1, T - 1], radius=int(T * 112 / 512), fill='#6b3fa0')
    k = T / 512 * (1 - 2 * marge)
    o = T * marge
    p = lambda x, y: (o + x * k, o + y * k)
    w = int(30 * k)
    for cx in (176, 336):
        x, y = p(cx, 344); r = 56 * k
        d.ellipse([x - r, y - r, x + r, y + r], outline='white', width=w)
    for a, b in (((216, 304), (360, 128)), ((296, 304), (152, 128))):
        d.line([p(*a), p(*b)], fill='white', width=w)
        for pt in (p(*a), p(*b)):
            d.ellipse([pt[0] - w / 2, pt[1] - w / 2, pt[0] + w / 2, pt[1] + w / 2], fill='white')
    return img.resize((taille, taille), Image.LANCZOS)

icone(192).save('public/icone-192.png')
icone(512).save('public/icone-512.png')
icone(512, marge=0.1).save('public/icone-512-maskable.png')
print('ok')
