"""Bake the giant-update detail normals and the tornado wind-streak sheet (all original, deterministic).

Detail normals are fine, tileable tangent-space relief that Storybook whiteout-blends on top of a
material's main normal (_DetailNormal / _DetailScale / _DetailStrength). They never change albedo.
The tornado sheet is an RGBA texture: white RGB with alpha streaks, read by the FxAlpha shells.

Run with Python 3 and numpy (Blender's bundled Python works):
  /Applications/Blender.app/Contents/Resources/4.5/python/bin/python3.11 Tools/bake_detail_normals.py
Outputs go to Assets/Resources/Carrot/Models/Materials; hashes and parameters to
Assets/Resources/Carrot/Models/Materials/detail-normal-provenance.json.
"""
from pathlib import Path
import hashlib, json, struct, zlib
import numpy as np

SIZE = 512
ROOT = Path(__file__).resolve().parents[1] / "Assets/Resources/Carrot/Models/Materials"
TAU = np.pi * 2


def hash2(ix, iy, seed):
    n = (ix.astype(np.uint64) * np.uint64(374761393)) ^ (iy.astype(np.uint64) * np.uint64(668265263)) ^ np.uint64(seed * 1274126177)
    n &= np.uint64(0xffffffff)
    n = ((n ^ (n >> np.uint64(13))) * np.uint64(1274126177)) & np.uint64(0xffffffff)
    return ((n ^ (n >> np.uint64(16))) & np.uint64(0xffff)).astype(np.float64) / 65535.0


def value_noise(u, v, count, seed):
    x, y = u * count, v * count
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = hash2(ix % count, iy % count, seed); b = hash2((ix + 1) % count, iy % count, seed)
    c = hash2(ix % count, (iy + 1) % count, seed); d = hash2((ix + 1) % count, (iy + 1) % count, seed)
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy


def fbm(u, v, base, octaves, seed):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total = total + amp * value_noise(u, v, base * 2 ** o, seed + o * 31)
        norm += amp; amp *= .5
    return total / norm


def cells(u, v, count, seed, jitter=.7, ids=False):
    """Tileable Worley: distance to nearest and second-nearest feature point (cell units), optionally the nearest cell's wrapped id."""
    px, py = u * count, v * count
    ix, iy = np.floor(px).astype(np.int64), np.floor(py).astype(np.int64)
    d1 = np.full(u.shape, 9.0); d2 = np.full(u.shape, 9.0)
    nx = np.zeros(u.shape, np.int64); ny = np.zeros(u.shape, np.int64); fx = np.zeros(u.shape); fy = np.zeros(u.shape)
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            x, y = ix + ox, iy + oy
            cx = x + .5 + jitter * (hash2(x % count, y % count, seed) - .5)
            cy = y + .5 + jitter * (hash2(x % count, y % count, seed + 7) - .5)
            d = np.sqrt((px - cx) ** 2 + (py - cy) ** 2)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d)); d1 = np.where(closer, d, d1)
            nx = np.where(closer, x % count, nx); ny = np.where(closer, y % count, ny)
            fx = np.where(closer, px - cx, fx); fy = np.where(closer, py - cy, fy)
    if ids:
        return d1, d2, nx, ny, fx, fy
    return d1, d2


def leaf_splat(count=3200, seed=7):
    """Tileable mass of overlapping leaves: each an ellipse with a random heading, a domed cross-section, a lighter tip and a
    faint midrib, splatted back-to-front with wrap-around. Returns (height, shade) on SIZE x SIZE."""
    rng = np.random.default_rng(seed)
    height = np.full((SIZE, SIZE), -.6); shade = np.full((SIZE, SIZE), .36)
    for _ in range(count):
        cx, cy = rng.uniform(0, SIZE, 2); ang = rng.uniform(0, np.pi * 2); L = rng.uniform(9, 15); W = L * rng.uniform(.36, .5)
        lift = rng.uniform(-.2, .3); value = rng.uniform(.80, 1.0); ca, sa = np.cos(ang), np.sin(ang)
        r = int(L) + 2; xs = np.arange(int(cx) - r, int(cx) + r + 1); ys = np.arange(int(cy) - r, int(cy) + r + 1)
        X, Y = np.meshgrid(xs, ys); dx, dy = X - cx, Y - cy
        a = (dx * ca + dy * sa) / L; b = (-dx * sa + dy * ca) / W   # along / across the blade
        inside = a * a + b * b < 1
        if not inside.any():
            continue
        dome = np.sqrt(np.clip(1 - a * a - b * b, 0, 1))
        h = lift + .35 * dome + .25 * a                                # tips curl up toward the light
        sh = value * (.78 + .22 * (a * .5 + .5)) * (1 - .12 * np.exp(-(b / .08) ** 2))
        yi, xi = Y[inside] % SIZE, X[inside] % SIZE
        height[yi, xi] = h[inside]; shade[yi, xi] = sh[inside]
    return height, shade


_LEAVES = None
def leaves():
    global _LEAVES
    if _LEAVES is None:
        _LEAVES = leaf_splat()
    return _LEAVES


def heightfield(kind, u, v):
    if kind == "MushroomPore":
        # Felted cap skin: soft radial-free wrinkles and scattered shallow pores.
        wrinkle = fbm(u, v, 6, 3, 11)
        d1, _ = cells(u, v, 40, 23, .8)
        pores = np.exp(-(d1 / .16) ** 2)
        return .55 * wrinkle - .35 * pores + .08 * value_noise(u, v, 128, 5)
    if kind == "ChitinPlate":
        # Overlapping exoskeleton plates: Worley borders as grooves, a slight dome per plate, fine dimples.
        d1, d2 = cells(u, v, 9, 41, .65)
        groove = np.exp(-((d2 - d1) / .07) ** 2)
        dome = 1 - np.clip(d1 / .75, 0, 1) ** 2
        e1, _ = cells(u, v, 64, 3, .9)
        dimple = np.exp(-(e1 / .2) ** 2)
        return .45 * dome - .65 * groove - .08 * dimple
    if kind == "GelRipple":
        # Slime: slow lumps and faint surface tension ripples.
        lumps = fbm(u, v, 4, 3, 71)
        ripple = np.sin(TAU * (u * 9 + .6 * fbm(u, v, 3, 2, 5))) * np.sin(TAU * (v * 7 + .5 * fbm(u, v, 3, 2, 9)))
        return .7 * lumps + .12 * ripple
    if kind == "IceFacet":
        # Fractured ice: flat Voronoi facets (each tilted its own way) with sharp hairline cracks.
        d1, d2, nx, ny, fx, fy = cells(u, v, 7, 97, .9, ids=True)
        crack = np.exp(-((d2 - d1) / .03) ** 2)
        # Each facet is a plane through its own feature point, tilted by a per-cell hash (continuous inside a cell).
        tx = hash2(nx, ny, 13) - .5; ty = hash2(nx, ny, 17) - .5
        facet = fx * tx + fy * ty
        return .55 * facet - .5 * crack + .05 * value_noise(u, v, 96, 19)
    if kind == "SkinPore":
        # Fine plant-skin pores and lenticels for the carrot hero, finer than the growth creases already in CarrotMicroNormal.
        d1, _ = cells(u, v, 56, 59, .85)
        lent = np.exp(-(d1 / .12) ** 2)
        streak = np.sin(TAU * (v * 3 + .3 * value_noise(u, v, 6, 3))) * .1
        return -.6 * lent + .25 * fbm(u, v, 16, 2, 29) + streak
    if kind == "FurStrand":
        # Dense directional strands, finer than FurMicroNormal's locks; drives the sheen highlight breakup.
        drift = .08 * np.sin(TAU * v * 3) + .05 * fbm(u, v, 4, 2, 41)
        # Per-strand phase noise breaks the regular comb into wavering, broken fibres.
        phase = value_noise(u * 96 % 1, v, 8, 47) * 2.5 + fbm(u, v, 24, 2, 53) * 1.5
        strands = np.sin(TAU * (u * 96 + drift * 6) + phase)
        clumps = fbm(u, v, 12, 2, 43)
        return .35 * strands * (.5 + .5 * clumps) * (.6 + .4 * value_noise(u, v, 32, 59)) + .35 * clumps
    if kind == "LeafCluster":
        # Massed leaves on a canopy clump: overlapping domed blades with random headings (leaf_splat), tips curling up.
        return leaves()[0]
    raise ValueError(kind)


DETAILS = {
    # name: (slope gain, notes)
    "MushroomPore": (3.0, "felted cap wrinkles and pores"),
    "ChitinPlate": (4.0, "exoskeleton plate grooves and dimples"),
    "GelRipple": (4.5, "slime lumps and ripples"),
    "IceFacet": (3.4, "tilted ice facets and hairline cracks"),
    "SkinPore": (2.4, "plant-skin lenticels and pores"),
    "FurStrand": (2.6, "fine directional strands"),
    "LeafCluster": (2.4, "massed, overlapping leaf blades on canopy clumps"),
}


def png(path, rgba):
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[y].tobytes() for y in range(h))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def bake_normal(kind, gain):
    t = (np.arange(SIZE) + .5) / SIZE
    u, v = np.meshgrid(t, t)
    h = heightfield(kind, u, v)
    h = (h - h.mean()) / (h.std() + 1e-9)
    # Central differences with wrap: tileable by construction.
    du = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * .5
    dv = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * .5
    k = gain / SIZE * 16
    n = np.stack([-du * k, -dv * k, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    slope = np.sqrt(1 - n[..., 2] ** 2)
    rgba = np.empty((SIZE, SIZE, 4), np.uint8)
    rgba[..., :3] = np.clip(np.round((n * .5 + .5) * 255), 0, 255).astype(np.uint8)
    rgba[..., 3] = 255
    # Row 0 of a PNG is the top; Unity's v=0 is the bottom, so flip to keep +Y (OpenGL) handedness.
    return rgba[::-1].copy(), float(slope.max()), float(slope.mean()), float(abs(h[:, 0] - h[:, -1]).mean())


def bake_streaks():
    """Tornado wind sheet: 512 x 256, white with alpha streaks that run along U (around the funnel)."""
    w, hgt = 512, 256
    u, v = np.meshgrid((np.arange(w) + .5) / w, (np.arange(hgt) + .5) / hgt)
    bands = np.zeros_like(u)
    for i, (freq, seed, weight) in enumerate([(5, 3, .55), (11, 7, .3), (23, 13, .15)]):
        # Streaks: thin in V, long in U, broken up by low-frequency noise drifting along U.
        warp = .06 * fbm(u, v, 3, 2, seed)
        s = np.sin(TAU * (v * freq + warp * freq * .5 + u * (i + 1)))
        bands += weight * np.clip(s, 0, 1) ** 3 * (.45 + .55 * fbm(u * 2 % 1, v, 4, 2, seed + 50))
    gaps = np.clip(fbm(u, v, 6, 3, 91) * 1.6 - .35, 0, 1)
    alpha = np.clip(.05 + 1.25 * bands * gaps, 0, 1)
    rgba = np.empty((hgt, w, 4), np.uint8)
    # RGB stays white so the shells' baked vertex colour is the albedo; only coverage (alpha) carries the streaks.
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = 255
    rgba[..., 3] = np.round(alpha * 255).astype(np.uint8)
    return rgba[::-1].copy(), float(alpha.mean())


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    rows = []
    for kind, (gain, note) in DETAILS.items():
        rgba, smax, smean, seam = bake_normal(kind, gain)
        name = kind + "Detail.png"
        rows.append({"name": name, "kind": "detail normal", "size": SIZE, "gain": gain, "pattern": note,
                     "sha256": png(ROOT / name, rgba), "maxSlope": round(smax, 4), "meanSlope": round(smean, 4),
                     "seamMismatch": round(seam, 6), "generator": "Tools/bake_detail_normals.py", "licence": "original work (project licence)",
                     "normalConvention": "Tangent space, OpenGL Y+, imported as Unity NormalMap"})
    rgba, mean_alpha = bake_streaks()
    rows.append({"name": "TornadoStreaks.png", "kind": "FxAlpha wind sheet", "size": [512, 256], "meanAlpha": round(mean_alpha, 4),
                 "sha256": png(ROOT / "TornadoStreaks.png", rgba), "generator": "Tools/bake_detail_normals.py", "licence": "original work (project licence)"})
    # Foliage albedo breakup: the same leaf cells as LeafClusterDetail as a grey multiplier (dark gaps, per-blade value shifts),
    # loaded by CarrotModels.Surface as the Foliage material's _MainTex (Foliage<Detail>.png convention).
    shade = np.clip(.42 + .62 * leaves()[1], 0, 1)
    g = np.round(shade * 255).astype(np.uint8); fol = np.stack([g, g, g, np.full_like(g, 255)], -1)[::-1].copy()
    rows.append({"name": "FoliageDetail.png", "kind": "albedo multiplier (grey)", "size": SIZE, "meanShade": round(float(shade.mean()), 4),
                 "sha256": png(ROOT / "FoliageDetail.png", fol), "generator": "Tools/bake_detail_normals.py", "licence": "original work (project licence)"})
    # Zombie albedo multiplier: the sRGB tint the view used to lerp in every frame (lerp(white, (.46,.55,.38), .7)).
    tint = np.zeros((4, 4, 4), np.uint8); tint[..., 0], tint[..., 1], tint[..., 2], tint[..., 3] = 159, 175, 144, 255
    rows.append({"name": "ZombieHideTint.png", "kind": "flat sRGB albedo multiplier", "size": [4, 4], "value": [159, 175, 144],
                 "sha256": png(ROOT / "ZombieHideTint.png", tint), "generator": "Tools/bake_detail_normals.py", "licence": "original work (project licence)"})
    (ROOT / "detail-normal-provenance.json").write_text(json.dumps(rows, indent=2) + "\n")
    for r in rows:
        print(r["name"], r["sha256"][:12], r.get("meanSlope", r.get("meanAlpha")))


if __name__ == "__main__":
    main()
