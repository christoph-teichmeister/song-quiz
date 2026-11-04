#!/usr/bin/env python3
"""Resolve curated (title, artist) lists to YouTube video ids: python3 scripts/seed-songs.py scripts/seed/<list>.txt
Input lines: title | artist | [German]   Output: public/songs/<list>.json (embeddable videos only, checked via oEmbed).
Needs `uvx yt-dlp` (uv). Review the output: the first good search hit is taken, a wrong hit means fix the query line."""
import json, re, subprocess, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BAD = re.compile(r'reaction|cover|remix|karaoke|tutorial|piano|guitar|lofi|slowed|nightcore|8d|parody|ranking|top \d|compilation|all intros|megamix|1 hour|10 hours', re.I)

def embeddable(vid):
    try:
        urllib.request.urlopen(f'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}', timeout=15)
        return True
    except urllib.error.URLError:
        return False

def resolve(line):
    title, artist, *flag = [x.strip() for x in line.split('|')]
    q = f'{title} {"Titelmusik Intro" if flag else "intro theme song"} {artist}'
    out = subprocess.run(['uvx', 'yt-dlp', f'ytsearch6:{q}', '--flat-playlist', '--dump-json', '--no-warnings'], capture_output=True, text=True).stdout
    for l in out.splitlines():
        try: v = json.loads(l)
        except ValueError: continue
        d = v.get('duration') or 0
        if 15 <= d <= 480 and not BAD.search(v.get('title', '')) and embeddable(v['id']):
            return {'id': v['id'], 'title': title, 'artist': artist, 'duration': int(d), 'ytTitle': v.get('title', '')}
    print('NO HIT:', line, file=sys.stderr)

src = sys.argv[1]; name = src.rsplit('/', 1)[-1].rsplit('.', 1)[0]
lines = [l for l in open(src, encoding='utf8').read().splitlines() if l.strip() and not l.startswith('#')]
with ThreadPoolExecutor(6) as ex: res = [r for r in ex.map(resolve, lines) if r]
seen = set(); res = [r for r in res if not (r['id'] in seen or seen.add(r['id']))]
json.dump(res, open(f'public/songs/{name}.json', 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print(f'{name}: {len(res)}/{len(lines)} resolved')
