# Portal expansion art and audio

Generated with the built-in image generation tool, 2026-10-13. The earlier plates and models remain intact. These interface paintings are separate from the actual Blender geometry and Unity animation. The two upgrade atlases contain 50 individual painted forms; they do not replace 3D models.

| Shipped asset | Layout and use | Source master |
|---|---|---|
| `38-expansion-towers.jpg` | Ten-family reference, 5×2, ordered as expansion.ts | `exec-69717f02-0190-4bd6-84c5-69829ae16cbe.png` |
| `40-portal-keyart.jpg` | Portal challenge card, loading art and cropped portrait | `exec-4dc42daa-4619-4d6b-8243-eafbdef21e53.png` |
| `41-minibosses.jpg` | 15 portraits, 5×3, ordered as expansion.ts | `exec-be45ba6f-0516-45d1-a720-634e589136d3.png` |
| `42-new-creatures.jpg` | 12 ordinary creature portraits, 4×3 | `exec-773ecc4b-dbac-4781-a3d7-a079996392da.png` |
| `43-expansion-tiers-a.jpg` | Five rows: Bamboo, Chili, Lotus, Magnet, Orchid. Five columns: I, II, III, IV, Super | `exec-c6cb1775-36a5-45e6-a675-ab5c1e4364fc.png` |
| `44-expansion-tiers-b.jpg` | Five rows: Dreamcap, Cactus, Clockflower, Dragonfruit, Moonflower. Same tier columns | `exec-3e0643ea-24ac-475a-bade-5d8243e779ae.png` |
| `Textures/PortalBioAtlas.png` | Four biological albedo quadrants: chitin, cap velvet, bamboo fiber, fruit peel | `exec-4fe7de39-9202-49af-bdf6-83b78b7b64b8.png` |

All source masters are retained in the session's generated_images directory. Website copies are JPEG quality88–90. Mode: image generation with references for tower/miniboss plates; new generation for Portal, ordinary creatures and albedo. Reference inputs were the existing `26-super-forms.jpg`, `32-challenge-bosses-menacing.jpg`, then the newly generated ten-family sheet and first upgrade atlas. Art direction: cinematic storybook, believable botanical/metal/stone materials, distinct anatomy and silhouettes, no typography, isolated equal cells, quiet backgrounds. Each tier adds geometry and mechanisms rather than merely a color change. Portal: carved basalt and oxidized brass concentric rings, cyan inward teeth, root cables, fractured observatory bridges and a warm carrot refuge. The biological image is generated color detail, not a measured PBR scan; model tools author corresponding relief separately.

Five new author-published CC0 scores make all eight encounter bosses musically distinct. Source URLs, authors, original checksums and license links are in `Assets/Resources/Carrot/Audio/Licenses/expansion-music.json`. Encoded Ogg and MP3 versions are streamed after the game loads. The original four compositions remain. New scores have measured RMS gain offsets (especially the dense Portal score), and share the existing ducking/crossfade/decoded-buffer release system.

84 short new creature cues layer the project's existing CC0 recordings by rubberduck, with different source pairs for each species, trimmed at active sound, mixed to mono, gain-limited and given short fades. Exact sources, pitch, duration, peak/RMS and checksums are in `Audio/Licenses/expansion-voices.json`. These are edited recordings, not generated voices. Creature voices retain a separate two-voice budget; effects retain the existing twelve-voice budget. Delayed effect sounds are additionally capped at96 pending cues, and recipient-only visual effects do not replay cast audio.
