"""Pack the Unity-rendered portraits into WebP sheets plus portraits.json (characters stream, giant update).

Input: the raw linear half-float frames written by CarrotTD.CarrotCharacterStudio.Portraits (<group>-<name>.rgbah over black and
<group>-<name>.w.rgbah over white, square, bottom-up rows; coverage = 1 - (white - black)) and its index.json. Each frame is tonemapped with the ACES filmic fit (the game's grade uses ACES), downsampled
2x with premultiplied alpha, and placed in a 256 px cell. Sheets: towers-<kind>.webp (tiers I-V in a row), creatures.webp,
minibosses.webp and bosses.webp (the guardians and the carrot hero). Asuna keeps the approved 46-asuna-portrait.png.

  python3 Tools/pack_carrot_portraits.py <raw dir> <out dir>   (Python 3, numpy, Pillow with WebP)

portraits.json is {kind: {tier: [sheet, x, y, w, h]}} with sheet paths relative to the json, as the page reads it.
"""
import json, sys, hashlib
from pathlib import Path
import numpy as np
from PIL import Image

CELL = 256
EXPOSURE = .82
QUALITY = 80
TOWERS = ["seed", "frost", "mortar", "prism", "storm", "blossom", "starfruit", "gravity", "book", "thunder",
          "bamboo", "chili", "lotus", "magnet", "orchid", "mushroom", "cactus", "clockflower", "dragonfruit", "moonflower"]
CREATURES = ["nibble", "dash", "shell", "swarm", "moth", "shaman", "burrow", "crystal", "mite", "beetle", "slug", "wisp", "bat",
             "scarab", "firefly", "sporeling", "tinyZombie", "riftling", "shardling", "mimic"]
MINIBOSSES = ["warDrummer", "frostHerald", "witherPriest", "stormWarden", "graveCaller", "mirrorKnight", "riftStalker", "mossGolem",
              "emberBoar", "venomQueen", "ironSnail", "lanternLeech", "chronoMoth", "thornBeast", "portalSentinel"]
BOSSES = [("garden", "boss-garden"), ("marsh", "boss-marsh"), ("frost", "boss-frost"), ("orchard", "boss-orchard"), ("zombie", "boss-zombie"),
          ("tornado", "boss-tornado"), ("eyeball", "boss-eyeball"), ("portal", "boss-portal"), ("carrot", "hero-Carrot")]


def aces(x):
    a, b, c, d, e = 2.51, .03, 2.43, .59, .14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)


def lin2srgb(x):
    return np.where(x <= .0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - .055)


def load(raw_dir, key, size):
    data = np.frombuffer((raw_dir / (key + ".rgbah")).read_bytes(), dtype=np.float16).astype(np.float32).reshape(size, size, 4)[::-1]
    rgb, alpha = data[..., :3], np.clip(data[..., 3:4], 0, 1)
    over_white = raw_dir / (key + ".w.rgbah")
    if over_white.exists():
        # Coverage from the black/white pair: white - black = 1 - alpha in linear light (exact for any blend of the scene).
        white = np.frombuffer(over_white.read_bytes(), dtype=np.float16).astype(np.float32).reshape(size, size, 4)[::-1][..., :3]
        alpha = np.clip(1 - (white - rgb).mean(-1, keepdims=True), 0, 1)
    # The camera cleared to transparent black, so colour is already premultiplied by coverage; tonemap the straight colour.
    straight = np.where(alpha > 1e-4, rgb / np.maximum(alpha, 1e-4), 0)
    display = aces(straight * EXPOSURE) * alpha
    # 2x box downsample of premultiplied colour and alpha (supersampled edges), then back to straight alpha.
    h = size // 2
    display = display.reshape(h, 2, h, 2, 3).mean((1, 3)); alpha = alpha.reshape(h, 2, h, 2, 1).mean((1, 3))
    straight = np.where(alpha > 1e-4, display / np.maximum(alpha, 1e-4), 0)
    img = np.concatenate([lin2srgb(straight), alpha], -1)
    im = Image.fromarray(np.round(np.clip(img, 0, 1) * 255).astype(np.uint8), "RGBA")
    return im.resize((CELL, CELL), Image.LANCZOS) if im.size[0] != CELL else im


def main():
    raw_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    index = json.loads((raw_dir / "index.json").read_text())
    size = next(iter(index.values()))["size"]
    mapping, sheets = {}, {}

    def sheet(name, keys, columns):
        rows = (len(keys) + columns - 1) // columns
        canvas = Image.new("RGBA", (columns * CELL, rows * CELL), (0, 0, 0, 0))
        placed = []
        for i, (kind, tier, key) in enumerate(keys):
            if key not in index:
                raise SystemExit("missing render: " + key)
            x, y = (i % columns) * CELL, (i // columns) * CELL
            canvas.alpha_composite(load(raw_dir, key, size), (x, y))
            mapping.setdefault(kind, {})[str(tier)] = [name, x, y, CELL, CELL]
            placed.append(key)
        path = out / name
        canvas.save(path, "WEBP", quality=QUALITY, method=6)
        sheets[name] = {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "cells": placed}

    for kind in TOWERS:
        sheet("towers-%s.webp" % kind, [(kind, t, "tower-%s-%d" % (kind, t)) for t in range(1, 6)], 5)
    sheet("creatures.webp", [(k, 1, "creature-" + k) for k in CREATURES], 5)
    sheet("minibosses.webp", [(k, 1, "miniboss-" + k) for k in MINIBOSSES], 5)
    sheet("bosses.webp", [(k, 1, key) for k, key in BOSSES], 5)
    # Asuna keeps the approved portrait rendered from the private pose (licensed art is never re-rendered or used as input).
    asuna = out.parent / "46-asuna-portrait.png"
    if asuna.exists():
        w, h = Image.open(asuna).size
        mapping["asuna"] = {"1": ["../46-asuna-portrait.png", 0, 0, w, h]}
    (out / "portraits.json").write_text(json.dumps(mapping, indent=1, sort_keys=True) + "\n")
    total = sum(v["bytes"] for v in sheets.values())
    (out / "portraits-provenance.json").write_text(json.dumps({
        "generator": "CarrotTD.CarrotCharacterStudio.Portraits (Unity 6000.3.18f1, URP, Carrot/Storybook) + Tools/pack_carrot_portraits.py",
        "source": "the shipped in-game prefabs under Assets/Resources/Carrot/Models (project's own models; CC0 Quaternius rigs for the original creatures)",
        "render": {"size": size, "cell": CELL, "downsample": 2, "tonemap": "ACES fit", "exposure": EXPOSURE, "webpQuality": QUALITY,
                   "camera": "pitch 16, yaw -6, fov 24", "lights": "key 2.4 (38,-42), fill .55 (-10,140), rim .85 (24,168), ambient trilight x.72"},
        "licence": "original renders of project models (project licence); asuna uses the existing approved portrait",
        "sheets": sheets, "totalBytes": total}, indent=1) + "\n")
    print("PORTRAITS", len(mapping), "kinds", len(sheets), "sheets", total, "bytes")


if __name__ == "__main__":
    main()
