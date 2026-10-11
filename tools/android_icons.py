#!/usr/bin/env python3
"""Put the WhatsTrix logo into the generated Capacitor Android project (launcher icons + launch splash).
usage: python3 tools/android_icons.py <android res dir> <folder with icon-512.png and icon-maskable-512.png>"""
import sys, glob, os
from PIL import Image, ImageDraw

res, src = sys.argv[1], sys.argv[2]
full = Image.open(os.path.join(src, 'icon-512.png')).convert('RGBA')
fg = Image.open(os.path.join(src, 'icon-maskable-512.png')).convert('RGBA')
logo_path = os.path.join(src, 'logo.png')
logo = Image.open(logo_path).convert('RGBA') if os.path.exists(logo_path) else full

SIZES = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}
for d, (legacy, fore) in SIZES.items():
    out = os.path.join(res, 'mipmap-' + d)
    os.makedirs(out, exist_ok=True)
    full.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(out, 'ic_launcher.png'))
    r = full.resize((legacy, legacy), Image.LANCZOS)
    mask = Image.new('L', (legacy, legacy), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
    r.putalpha(mask)
    r.save(os.path.join(out, 'ic_launcher_round.png'))
    fg.resize((fore, fore), Image.LANCZOS).save(os.path.join(out, 'ic_launcher_foreground.png'))

# adaptive icon background -> black
bg = os.path.join(res, 'values', 'ic_launcher_background.xml')
if os.path.exists(bg):
    s = open(bg, encoding='utf-8').read()
    open(bg, 'w', encoding='utf-8').write(s.replace('#FFFFFF', '#000000'))

# launch splash: black with the logo in the middle, same pixel size as the template files
n = 0
for f in glob.glob(os.path.join(res, 'drawable*', 'splash.png')):
    w, h = Image.open(f).size
    canvas = Image.new('RGB', (w, h), (0, 0, 0))
    k = int(min(w, h) * 0.42)
    l = logo.resize((k, k), Image.LANCZOS)
    canvas.paste(l, ((w - k) // 2, (h - k) // 2), l)
    canvas.save(f)
    n += 1
print('icons written; splash images replaced:', n)
