#!/usr/bin/env python3
"""Process generated RGB assets into transparent 512x720 game sprites."""
from PIL import Image, ImageFilter
import numpy as np
from pathlib import Path
import sys

SRC = Path('/opt/cursor/artifacts/assets')

def flood_mask(rgb, tol=32):
    h, w, _ = rgb.shape
    corners = [rgb[2, 2], rgb[2, w-3], rgb[h-3, 2], rgb[h-3, w-3]]
    bg = np.median(corners, axis=0).astype(np.float32)
    dist = np.linalg.norm(rgb.astype(np.float32) - bg, axis=2)
    gdist = np.linalg.norm(rgb.astype(np.float32) - np.array([0, 255, 0], np.float32), axis=2)
    is_bg = (dist < tol) | (gdist < 70)
    vis = np.zeros((h, w), bool)
    q = []
    for x in range(w):
        for y in (0, h-1):
            if is_bg[y, x]:
                vis[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w-1):
            if is_bg[y, x] and not vis[y, x]:
                vis[y, x] = True; q.append((y, x))
    i = 0
    while i < len(q):
        y, x = q[i]; i += 1
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and is_bg[ny, nx]:
                vis[ny, nx] = True; q.append((ny, nx))
    return vis

def process_one(src, dest):
    rgb = np.array(Image.open(src).convert('RGB'))
    bg = flood_mask(rgb)
    alpha = np.where(bg, 0, 255).astype(np.float32)
    dist_w = np.linalg.norm(rgb.astype(np.float32) - np.array([255, 255, 255], np.float32), axis=2)
    alpha[(dist_w < 40) & (~bg)] *= 0.3
    a = np.array(Image.fromarray(alpha.astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.1)))
    rgba = Image.fromarray(np.dstack([rgb, a]), 'RGBA')
    bbox = rgba.getbbox()
    if not bbox:
        print('EMPTY', src); return False
    out = rgba.crop(bbox)
    tw, th = 512, 720
    ow, oh = out.size
    s = min(tw * 0.88 / ow, th * 0.88 / oh)
    nw, nh = max(1, int(ow * s)), max(1, int(oh * s))
    out = out.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    canvas.paste(out, ((tw - nw) // 2, th - nh - int(th * 0.04)), out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, 'PNG', optimize=True, compress_level=9)
    print('OK', dest)
    return True

def process_map(edition, mapping):
    OUT = Path('icons/skins') / edition
    miss = []
    for slug, hx in mapping:
        src = SRC / f'{slug}.png'
        if not src.exists():
            miss.append(slug); continue
        process_one(src, OUT / f'{hx}.png')
    print(edition, 'missing', miss, 'count', len(list(OUT.glob('*.png'))) if OUT.exists() else 0)

if __name__ == '__main__':
    # args unused; caller imports process_map
    pass
