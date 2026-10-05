#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verifica el contraste AA de la demo Caudal (marino + azul agua + ambar).

Que hace:
  1. Comprueba los pares planos de la paleta (texto sobre su fondo).
  2. Recompone en Python el HERO tal y como lo pinta el CSS (foto con
     object-fit:cover + velo marino) sobre las fotos reales del repo, y se
     queda con el PEOR PIXEL bajo el texto: el mas CLARO, porque el texto
     del hero es claro.
  3. Repite los velos contra una foto blanca pura (peor caso absoluto), para
     que cambiar la foto no pueda romper el contraste.

Los valores de abajo son espejo de assets/css/style.css: si se toca la
paleta o el velo del hero alli, hay que tocarlos aqui.

Uso:  python scripts/verifica-contraste.py
Sale con codigo 1 si algo baja de su minimo.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'img')

AA = 4.5       # texto
AA_UI = 3.0    # foco visible y componentes graficos

P = dict(
    white='#ffffff', bg2='#f2f6fa',
    text='#0e1b2a', ink2='#33445a', muted='#56677b',
    navy='#0a2540', navy2='#103253',
    ondark='#f2f7fb', ondarkmuted='#a9bdd0',
    b='#2a8fd6', bdark='#0f5e9c', bdeep='#0b4a7d', bsky='#7cc4f4', bchip='#e6f1fa',
    a='#ffb224', ahover='#f5a300', adeep='#8a5200', achip='#fff3dc',
    urg='#b42318', urgchip='#fff1ef',
)

fallos = []


# ----------------------------------------------------------------- WCAG ----
def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    return 0.2126 * _lin(rgb[0]) + 0.7152 * _lin(rgb[1]) + 0.0722 * _lin(rgb[2])


def hex_rgb(hx):
    hx = hx.lstrip('#')
    return tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))


def ratio(a, b):
    la, lb = lum(a), lum(b)
    if la < lb:
        la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)


def comprueba(etiqueta, r, minimo=AA):
    ok = r >= minimo
    if not ok:
        fallos.append(f'{etiqueta}: {r:.2f} (min {minimo})')
    print(f"    {etiqueta:<52} {r:6.2f}:1  {'OK' if ok else 'FALLA'}")


# ---- 1. PARES PLANOS -------------------------------------------------------
print("\n=== 1 · Paleta plana ===")
PARES = [  # (texto, fondo, minimo, uso)
    ('text', 'white', AA, 'titulares'),
    ('text', 'bg2', AA, 'titulares, seccion alterna'),
    ('ink2', 'white', AA, 'parrafos'),
    ('ink2', 'bg2', AA, 'parrafos, seccion alterna'),
    ('muted', 'white', AA, 'secundario'),
    ('muted', 'bg2', AA, 'secundario, seccion alterna'),
    ('muted', 'bchip', AA, 'secundario sobre chip azul'),
    ('bdark', 'white', AA, 'texto azul'),
    ('bdark', 'bg2', AA, 'texto azul, seccion alterna'),
    ('bdeep', 'white', AA, 'azul en hover'),
    ('bdeep', 'bchip', AA, 'texto sobre chip azul'),
    ('adeep', 'white', AA, 'texto ambar'),
    ('adeep', 'bg2', AA, 'texto ambar, seccion alterna'),
    ('adeep', 'achip', AA, 'texto sobre chip ambar'),
    ('text', 'a', AA, 'boton ambar y etiqueta DEMO'),
    ('text', 'ahover', AA, 'boton ambar en hover'),
    ('ondark', 'navy', AA, 'texto sobre marino'),
    ('ondark', 'navy2', AA, 'texto sobre superficie marina'),
    ('ondarkmuted', 'navy', AA, 'secundario sobre marino'),
    ('ondarkmuted', 'navy2', AA, 'secundario sobre superficie marina'),
    ('a', 'navy', AA, 'ambar como texto sobre marino'),
    ('a', 'navy2', AA, 'ambar sobre superficie marina'),
    ('bsky', 'navy', AA, 'azul claro sobre marino'),
    ('bsky', 'navy2', AA, 'azul claro sobre superficie marina'),
    ('white', 'bdark', AA, 'blanco sobre azul'),
    ('white', 'bdeep', AA, 'blanco sobre azul en hover'),
    ('urg', 'urgchip', AA, 'aviso de urgencia'),
    ('urg', 'white', AA, 'aviso de urgencia sobre blanco'),
    ('bdark', 'white', AA_UI, 'foco visible sobre claro'),
    ('bdark', 'bg2', AA_UI, 'foco visible, seccion alterna'),
    ('a', 'navy', AA_UI, 'foco visible sobre marino'),
]
for t, f, m, uso in PARES:
    comprueba(f'--{t} sobre --{f} · {uso}', ratio(hex_rgb(P[t]), hex_rgb(P[f])), m)


# ---- 2. HERO: peor pixel real ----------------------------------------------
NAVY = hex_rgb(P['navy'])


def _stop(stops, t):
    """Interpola [(pos, alfa), ...] en t (0..1)."""
    if t <= stops[0][0]:
        return stops[0][1]
    for i in range(1, len(stops)):
        p0, a0 = stops[i - 1]
        p1, a1 = stops[i]
        if t <= p1:
            return a0 if p1 == p0 else a0 + (a1 - a0) * (t - p0) / (p1 - p0)
    return stops[-1][1]


def sobre(alfa, base):
    """Marino con alfa (0..1) sobre un color opaco."""
    return tuple(NAVY[j] * alfa + base[j] * (1 - alfa) for j in range(3))


def cover(im, bw, bh):
    """object-fit:cover con object-position 50% 50% en una caja bw x bh."""
    W, H = im.size
    sc = max(bw / W, bh / H)
    sw, sh = max(bw, round(W * sc)), max(bh, round(H * sc))
    im = im.resize((sw, sh), Image.BILINEAR)
    x, y = (sw - bw) // 2, (sh - bh) // 2
    return im.crop((x, y, x + bw, y + bh))


def peor(im, capas, box, step=3):
    """Pixel mas CLARO de la banda tras componer las capas (la primera, arriba)."""
    W, H = im.size
    px = im.load()
    x0, y0, x1, y1 = box
    wl, worst = -1.0, None
    for y in range(int(y0 * H), max(int(y0 * H) + 1, int(y1 * H)), step):
        for x in range(int(x0 * W), int(x1 * W), step):
            base = px[x, y]
            for capa in reversed(capas):
                base = sobre(capa(x / W, y / H), base)
            l = lum(base)
            if l > wl:
                wl, worst = l, base
    return worst


def informe(nombre, rgb, textos):
    print(f"  {nombre} -> peor pixel rgb({rgb[0]:.0f},{rgb[1]:.0f},{rgb[2]:.0f})")
    for t in textos:
        comprueba(f'{nombre} · --{t}', ratio(hex_rgb(P[t]), rgb))


# Espejo de .hero-bg .scrim (solo la capa horizontal: la vertical unicamente
# oscurece, asi que ignorarla es el caso conservador) y de .nav.
SCRIM_DESKTOP = lambda fx, fy: _stop([(0.0, .97), (0.58, .96), (0.78, .62), (1.0, .28)], fx)
SCRIM_MOVIL = lambda fx, fy: _stop([(0.0, .93), (0.55, .88), (1.0, .96)], fy)
NAV = lambda fx, fy: .86
TEXTO_HASTA = 0.58      # la columna de texto nunca pasa del 58% del ancho
COPY_VW, COPY_MAX = 0.54, 620   # .hero-copy{max-width:min(620px,54vw)}
MAXW = 1240

HERO_TXT = ['ondark', 'ondarkmuted', 'a', 'bsky']
NAV_TXT = ['ondark', 'ondarkmuted']

print("\n=== 2 · HERO · peor pixel real bajo el texto ===")
im = Image.open(os.path.join(IMG, 'hero-cobre.jpg')).convert('RGB')
for vw, vh in ((901, 700), (1024, 768), (1280, 800), (1440, 900), (1920, 1080)):
    pad = 32 if vw > 900 else 22
    izq = max(0, (vw - MAXW) / 2) + pad
    fin = (izq + min(COPY_MAX, COPY_VW * vw)) / vw
    print(f"\n[{vw}x{vh} · escritorio] el texto llega al {fin:.1%} del ancho (limite {TEXTO_HASTA:.0%})")
    if fin > TEXTO_HASTA:
        fallos.append(f'hero {vw}: el texto se sale de la zona opaca del velo')
        print("    EL TEXTO SE SALE DE LA ZONA OPACA DEL VELO")
    caja = cover(im, vw, vh)
    informe(f'hero {vw}', peor(caja, [SCRIM_DESKTOP], (0.0, 0.0, TEXTO_HASTA, 1.0)), HERO_TXT)
    informe(f'nav {vw}', peor(caja, [NAV, SCRIM_DESKTOP], (0.0, 0.0, 1.0, 76 / vh)), NAV_TXT)

im = Image.open(os.path.join(IMG, 'hero-cobre-900.jpg')).convert('RGB')
for vw, vh in ((360, 740), (390, 844), (600, 900), (768, 1024), (900, 700)):
    print(f"\n[{vw}x{vh} · movil] texto a todo el ancho, velo casi plano")
    caja = cover(im, vw, vh)
    informe(f'hero {vw}', peor(caja, [SCRIM_MOVIL], (0.0, 0.0, 1.0, 1.0)), HERO_TXT)
    informe(f'nav {vw}', peor(caja, [NAV, SCRIM_MOVIL], (0.0, 0.0, 1.0, 76 / vh)), NAV_TXT)

print("\n=== 3 · Peor caso absoluto · una foto blanca pura debajo ===")
blanca = Image.new('RGB', (200, 200), (255, 255, 255))
informe('hero escritorio sobre blanco', peor(blanca, [SCRIM_DESKTOP], (0.0, 0.0, TEXTO_HASTA, 1.0)), HERO_TXT)
informe('hero movil sobre blanco', peor(blanca, [SCRIM_MOVIL], (0, 0, 1, 1)), HERO_TXT)
informe('nav sobre blanco', peor(blanca, [NAV], (0, 0, 1, 1)), NAV_TXT)

# ---------------------------------------------------------------------------
print()
if fallos:
    print(f"RESULTADO: {len(fallos)} comprobacion(es) por debajo de su minimo")
    for f in fallos:
        print("  - " + f)
    sys.exit(1)
print("RESULTADO: 0 fallos · todo el texto por encima de 4.5:1 (AA)")
