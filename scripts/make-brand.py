#!/usr/bin/env python3
"""Builds the wordmark / lockup SVGs (text converted to paths, so they need no font): uvx --from fonttools python scripts/make-brand.py"""
import urllib.request, io
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

URL = 'https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9U6as8bTXq_nANBjzKo3IeZx8z6up5BeSl5jBNz_19PpbpMXuECpwUxJBOm_OJWiaaD30YfKfjZZoLvZvlyM0.ttf'
font = TTFont(io.BytesIO(urllib.request.urlopen(URL).read()))  # the CSS API serves a static weight-800 instance
gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm
S = 100 / upm * 1.0
def text_path(txt, size=100, x0=0, y0=0):
    s = size / upm; x = x0; d = []
    for ch in txt:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs, ntos=lambda v: f'{v:.1f}'.rstrip('0').rstrip('.'))
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, y0)))
        d.append(pen.getCommands()); x += gs[g].width * s
    return ' '.join(d), x
# the glyph outlines decide the height (g and the tail of Q go below the baseline)
asc = font['hhea'].ascent * 100 / upm
d, w = text_path('Song Quiz', 100, 0, asc)
bp = BoundsPen(gs)
for ch in 'Song Quiz': gs[cmap[ord(ch)]].draw(bp)
top, bottom = asc - bp.bounds[3] * 100 / upm, asc - bp.bounds[1] * 100 / upm   # svg y of the highest / lowest point
PAD = 6
y0, H = top - PAD, bottom - top + 2 * PAD
ICON = '<rect width="64" height="64" rx="16" fill="#14111c"/><circle cx="32" cy="32" r="22" fill="#ff4f8b"/><path d="M27 20v19.5a5 5 0 1 0 3 4.6V26l10 2.5v8.8a5 5 0 1 0 3 4.6V22.2z" fill="#fff"/>'
def svg(vb, body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{body}</svg>\n'
def word(fill): return svg(f'0 {y0:.1f} {w:.0f} {H:.1f}', f'<path d="{d}" fill="{fill}"/>')
def lockup(fill):  # icon 100 high, centred on the text block, then the wordmark
    cy = y0 + H / 2
    return svg(f'0 {min(y0, cy - 50):.1f} {128 + w:.0f} {max(H, 100):.1f}', f'<g transform="translate(0 {cy - 50:.1f}) scale(1.5625)">{ICON}</g><g transform="translate(128 0)"><path d="{d}" fill="{fill}"/></g>')
open('public/brand/wordmark.svg', 'w').write(word('#f4f1fa'))
open('public/brand/wordmark-on-light.svg', 'w').write(word('#14111c'))
open('public/brand/logo-lockup.svg', 'w').write(lockup('#f4f1fa'))
open('public/brand/logo-lockup-on-light.svg', 'w').write(lockup('#14111c'))
print('wordmark', round(w), 'x', round(H), 'top', round(y0))
