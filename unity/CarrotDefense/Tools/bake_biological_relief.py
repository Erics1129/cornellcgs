"""Bake original, tileable technical normal/roughness data; no source image edits.

The heights model shallow surface structure, not silhouette displacement.  Every
surface uses its own pattern and energy response; none reuses stone/wood relief.
Run with standard Python. Outputs are imported by CarrotModels.Prepare().
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import zlib

SIZE = 512
TAU = math.tau
ROOT = Path(__file__).resolve().parents[1] / "Assets/Resources/Carrot/Models/Materials"


def hashed(x, y, seed):
    n = ((x * 374761393) ^ (y * 668265263) ^ (seed * 1274126177)) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535


def noise(u, v, count, seed=0):
    x, y = u * count, v * count
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = hashed(ix % count, iy % count, seed)
    b = hashed((ix + 1) % count, iy % count, seed)
    c = hashed(ix % count, (iy + 1) % count, seed)
    d = hashed((ix + 1) % count, (iy + 1) % count, seed)
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy


def surface(kind, u, v):
    grain = noise(u, v, 64, 29)
    variation = noise(u, v, 8, 7)
    if kind == "Carrot":
        # Broken transverse growth creases with much smaller skin pores.
        phase = TAU * (v * 13 + .12 * math.sin(TAU * u * 3) + .06 * math.sin(TAU * u * 7))
        crease = math.exp(-((math.sin(phase) / .20) ** 2))
        broken = .2 + .8 * noise(u, v, 16, 13)
        height = -.0014 * crease * broken + .00036 * (grain - .5)
        rough = .62 + .11 * variation + .045 * crease
    elif kind == "Leaf":
        # Raised midrib and oblique secondary veins, plus quiet cell texture.
        x = (u + .025 * math.sin(TAU * v * 2)) % 1 - .5
        midrib = math.exp(-((x / .011) ** 2))
        branch = math.exp(-((math.sin(TAU * (v * 7 - abs(x) * 3.5)) / .16) ** 2))
        taper = max(0, 1 - abs(x) * 1.8)
        height = .0017 * midrib + .00075 * branch * taper + .00019 * (grain - .5)
        rough = .39 + .13 * variation + .035 * branch
    elif kind == "Fur":
        # Long, narrow fibers within broader wavering locks; no pebbled skin noise.
        drift = .13 * math.sin(TAU * v * 2) + .07 * math.sin(TAU * v * 5)
        fibers = math.sin(TAU * (u * 57 + drift))
        locks = math.sin(TAU * (u * 11 + .11 * math.sin(TAU * v * 2)))
        height = .00063 * fibers + .00105 * locks + .00008 * (grain - .5)
        rough = .84 + .075 * variation + .025 * (1 - fibers) * .5
    else:
        # Soft irregular dermal bumps of a cephalopod, not fish armor scales.
        count = 24
        px, py = u * count, v * count
        ix, iy = math.floor(px), math.floor(py)
        distance = 10
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                x, y = ix + ox, iy + oy
                cx = x + .18 + .64 * hashed(x % count, y % count, 61)
                cy = y + .18 + .64 * hashed(x % count, y % count, 83)
                distance = min(distance, (px - cx) ** 2 + (py - cy) ** 2)
        bump = math.exp(-distance * 7)
        height = .0020 * bump + .00017 * (grain - .5)
        rough = .27 + .095 * variation + .055 * (1 - bump)
    return height, max(.05, min(.98, rough))


def png(path, pixels):
    # Technical RGB texture data, written directly with a standard PNG encoder.
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    rows = b"".join(b"\0" + bytes(pixels[y * SIZE * 3:(y + 1) * SIZE * 3]) for y in range(SIZE))
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows, 8)) + chunk(b"IEND", b"")
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    records = []
    for kind in ("Carrot", "Leaf", "Fur", "Scale"):
        heights, rough = [], []
        for y in range(SIZE):
            for x in range(SIZE):
                h, r = surface(kind, x / SIZE, y / SIZE)
                heights.append(h)
                rough.append(r)
        normal_pixels, rough_pixels = bytearray(), bytearray()
        max_slope, mean_slope = 0, 0
        for y in range(SIZE):
            for x in range(SIZE):
                dx = (heights[y * SIZE + (x + 1) % SIZE] - heights[y * SIZE + (x - 1) % SIZE]) * SIZE * .5
                dy = (heights[((y + 1) % SIZE) * SIZE + x] - heights[((y - 1) % SIZE) * SIZE + x]) * SIZE * .5
                slope = math.hypot(dx, dy)
                max_slope, mean_slope = max(max_slope, slope), mean_slope + slope
                length = math.sqrt(dx * dx + dy * dy + 1)
                # PNG rows run downward; Unity tangent V runs upward (OpenGL/Y+).
                normal_pixels.extend(round((v / length * .5 + .5) * 255) for v in (-dx, dy, 1))
                gray = round(rough[y * SIZE + x] * 255)
                rough_pixels.extend((gray, gray, gray))
        records.append({"category": kind, "size": SIZE, "source": "Original deterministic analytic heightfield; not reconstructed from albedo or a borrowed rock surface.",
                        "normal": kind + "MicroNormal.png", "normalSHA256": png(ROOT / (kind + "MicroNormal.png"), normal_pixels),
                        "roughness": kind + "MicroRoughness.png", "roughnessSHA256": png(ROOT / (kind + "MicroRoughness.png"), rough_pixels),
                        "roughnessRange": [round(min(rough), 4), round(max(rough), 4)],
                        "maxNormalSlope": round(max_slope, 4), "meanNormalSlope": round(mean_slope / SIZE ** 2, 4),
                        "normalConvention": "Tangent space, OpenGL Y+, imported as Unity NormalMap; roughness is linear data."})
        print(kind, records[-1]["roughnessRange"], "mean slope", records[-1]["meanNormalSlope"])
    (ROOT / "biological-relief-provenance.json").write_text(json.dumps(records, indent=2) + "\n")


if __name__ == "__main__":
    main()
