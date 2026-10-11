# First-person workshop — 10 October 2026

Reference: [ForgeTax's Steam listing and gameplay trailer](https://store.steampowered.com/app/5245810/ForgeTax/), viewed on 10 October. The visual targets are its close first-person forging view, dark masonry workshop, amber light, central weapon, and compact odds board. Forge or Fold retains its own name, generated textures, geometry, seven-day rules, economy, and interface text. This is an original Unity implementation following that art direction, not a port of the Steam game's assets or renderer.

## Implementation

- The camera follows the player's eyes at 1.62 metres, with a restrained walk bob. WASD, shift, touch movement, and drag-to-look remain available. Work focus turns the eye-level camera toward the anvil rather than switching to an external overhead shot.
- Rebuilt the workshop at human scale: approximately a metre-high anvil, a 35 cm hammer handle, and close-view procedural blades. Station meshes, masonry joints, floor slabs, barrel staves, chain links, and tools are actual 3D geometry.
- The humanoid arm rig uses hand and elbow IK. A separate humanoid finger layer closes the grip. The head and torso are excluded from the first-person mesh, avoiding camera clipping through the character.
- The hammer has a windup, fast downstroke, contact event, recoil, and recovery. Only the contact event changes game state. Smaller metal fragments and ember trails replace the previous oversized chips; routine strikes no longer produce a large neon circle.
- PBR materials use image-generated wood, brick, iron, and leather surfaces. The workshop is captured once into a 128-pixel reflection probe so metals reflect the actual scene. Surface relief, mixed roughness, warm work light, cold window spill, furnace flicker, bloom, and fog supply depth.
- The HUD now uses charcoal and worn brass tones, a compact central odds board, and short labels. The direct buy/sell flow remains available from anywhere. Portrait mode uses a wider field of view and brings the held hammer inward.

## Generated texture source

Original: `unity/ForgeOrFold/Assets/ArtSource/MaterialsV3.png`.

The import step extracts four mipmapped surface maps into `Assets/Resources/Forge`. The previous generated polished-steel texture and animated fire atlas are retained. Gameplay remains animated 3D; the workshop loading illustration is not the playable scene.

Prompt used:

> Use case: photorealistic natural. Asset type: square 2x2 seamless material texture atlas for a realistic first-person medieval blacksmith Unity game. Generate four equal square quadrants edge to edge without borders or labels. Top left: worn smoked oak dark brown fine longitudinal grain, hammer dents and irregular scratches, no plank gaps. Top right: single rough fired clay brick surface ochre dark umber soot mottling, NO brick grid or mortar. Bottom left: hammer-forged gunmetal steel, dense subtle pits, worn silvery burnished grain, no objects. Bottom right: supple dark brown weathered leather with fine creases and close grain, no stitches. Flat orthographic surface scans, even neutral diffuse lighting, no shadows or perspective, no vignette, no text. Highly realistic tactile fine detail, restrained brown charcoal palette; each quadrant independently tileable. Texture only, not a scene.

## Scope and limits

No rules, leaderboard validation, or game balance changed. The existing backend setup requirement remains. The game uses runtime geometry and generated texture scans, not photogrammetry or a purchased high-resolution character pack. Browser tests are not certification of performance on a physical mid-range phone.

## Validation

- Unity WebGL build succeeded, including the new hand-grip animation layer and glove shader. The final close-up material has no shadow-acne patches on the fingers.
- Browser inspected at desktop 1280×720, portrait 390×844 and landscape 844×390. The new eye-level perspective, large blade, held hammer, masonry, material textures and compact odds board are visible.
- Drag-to-look rotates the view toward the furnace. Touch movement moved the player's x position from 0 to −0.2784 and released normally. The Forge action returns to the anvil from movement.
- A completed phone strike changed stamina from 17 to 16 and Flow from 3/10 to 4/10, with the Dull result preserving level 2. Controls unlocked after recovery.
- Buying Iron immediately deducted 85 gold (180 → 95), added the fourth knife, and reduced stock from 3 to 2. Refresh retained the run.
- No browser runtime errors were reported during final portrait/landscape checks. Unity's frame counter on the desktop test host reported 120 fps; that is not a phone-device performance measurement.
- The existing automated tests pass for the rules and backend score replay. Lint and the production TypeScript/site build pass.
