"""Fetch five distinct CC0 scores from their author-published OpenGameArt pages.

Original recordings stay outside the Web data file, in Unity's ignored Music~ folder.
Run encode_carrot_music.py in Blender afterwards. Existing scores are never replaced.
"""
import concurrent.futures
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Assets/Resources/Carrot/Audio/Music~'
LICENSES = ROOT / 'Assets/Resources/Carrot/Audio/Licenses'
TRACKS = [
    ('Orchard', 'Battle Theme', 'Wolfgang_ (Theodore Kerr)', 'https://opengameart.org/node/16611', 'https://opengameart.org/sites/default/files/Battle.mp3'),
    ('Tornado', 'Battle Theme A', 'cynicmusic', 'https://opengameart.org/content/battle-theme-a', 'https://opengameart.org/sites/default/files/battleThemeA.mp3'),
    ('Zombie', 'Col Legno', 'Vehicle', 'https://opengameart.org/content/col-legno', 'https://opengameart.org/sites/default/files/Vehicle%20-%20OGA%20-%20Col%20Legno.wav'),
    ('Eyeball', 'Pressure', 'yd', 'https://opengameart.org/content/pressure', 'https://opengameart.org/sites/default/files/Pressure.ogg'),
    ('Portal', 'Epic Boss Battle', 'Juhani Junkala / SubspaceAudio', 'https://opengameart.org/content/boss-battle-music', 'https://opengameart.org/sites/default/files/Juhani%20Junkala%20-%20Epic%20Boss%20Battle%20%5BSeamlessly%20Looping%5D.wav'),
]

def fetch(track):
    kind, title, author, page, url = track
    SOURCE.mkdir(parents=True, exist_ok=True)
    LICENSES.mkdir(parents=True, exist_ok=True)
    out = SOURCE / ('Music' + kind + Path(url).suffix)
    if not out.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'CornellCGS-AssetPreparation/1.0'}), timeout=90) as response:
            out.write_bytes(response.read())
    if out.stat().st_size < 100000:
        raise ValueError('Unexpected audio download: ' + str(out))
    return {'track': 'Music' + kind, 'title':title, 'author':author, 'sourcePage':page, 'download':url, 'license':'CC0-1.0', 'licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/', 'sourceFile':out.name, 'sourceBytes':out.stat().st_size, 'sourceSha256':hashlib.sha256(out.read_bytes()).hexdigest()}

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        tracks = list(pool.map(fetch, TRACKS))
    (LICENSES / 'expansion-music.json').write_text(json.dumps(tracks, indent=2)+'\n')
    print('\n'.join(x['track']+': '+x['title'] for x in tracks))
