# Assets made by the scroll-core stream

Everything here is derived from files that were already in the repository. No third-party art,
footage, fonts or code was downloaded. Playwright (from the Codex runtime) is used only as a
headless browser to decode and re-encode images; Blender 4.5.1 (already installed on this Mac)
is used only as an H.264 encoder.

| File | Made from | How |
|---|---|---|
| `public/assets/blackhole-g6.mp4` (6.1 MB, 1280x720, 192 frames, 32 keyframes) | `public/assets/blackhole.mp4` (7.7 MB, one keyframe in 192 frames) | `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/cinema/encode/intra.py -- public/assets/blackhole.mp4 <tmp>/g6.mp4 6 MEDIUM` then `node scripts/cinema/encode/faststart.mjs <tmp>/g6.mp4 public/assets/blackhole-g6.mp4`. GOP of 6 frames, no B-frames, no audio, `moov` first. A seek now lands within one display frame; the old file needed to decode up to 191 frames per seek. |
| `public/assets/blackhole-g6-540.mp4` (4.0 MB, 960x540) | same source | same two commands with a fifth argument `0.75` (scale). Used on the phone and low tiers. |
| `public/assets/scenes/blackhole-000 … 100.webp` (9 files, 45 to 63 kB, 960x540) | `blackhole-g6.mp4` | `node scripts/cinema/stills.mjs`. Nine evenly spaced frames at the same playhead mapping the page uses. The two nearest are crossfaded under the video whenever the video is not exactly on the scroll's frame. |
| `public/soda/d/proxy.webp` (153 kB, 2560x540) and `public/soda/m/proxy.webp` (141 kB, 1440x960) | the 96 frames in `public/soda/d` and `public/soda/m` | `node scripts/cinema/soda-proxy.mjs`. All 96 frames at 160x90 (90x160 for the portrait set) in a 16x6 grid. Drawn scaled up when the sharp frame is not decoded yet. |
| `EARTH_LQIP` in `src/lib/earthJourney.ts` (6 data URIs, about 1 kB each) | the six photographs in `public/assets/earth-journey` (credits unchanged, in `journey-v2-credits.json` and on the page) | `node scripts/cinema/lqip.mjs`. Each photo at 48 px wide with a 1.2 px blur, WebP quality 0.5. |

`node scripts/cinema/assets.mjs` runs the last three scripts in order (stills depend on the encode,
so re-run it after any re-encode).

The old `public/assets/blackhole.mp4` is no longer referenced by the deck. It is kept in the
repository as the encode source.

Measured (headless Chromium, this Mac): the 12 s full-speed pass has no long task and no frame
over 34 ms on the desktop and phone-layout profiles; a simulated scrollbar drag (20 jumps in 20
frames) starts no video seek at all.
