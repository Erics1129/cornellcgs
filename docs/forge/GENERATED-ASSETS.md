# Generated asset ledger

Created with the built-in image-generation tool in this task; original artwork, no external reference-site files. Original PNGs for material/fire assets are versioned under `unity/ForgeOrFold/Assets/Resources/Forge`. WebP encoding was a delivery conversion only, not an artistic edit. Unity imports the source PNGs with a 1024px maximum and compressed textures.

| Asset | Website file | Unity resource | Role |
|---|---|---|---|
| Workshop | `public/assets/minigames/forge/workshop.webp` | — | Loading screen only; 1672×941, 316,516 bytes |
| Wood | `public/assets/minigames/forge/wood.webp` | `Forge/Wood.png` | 1254×1254 smoked wood material |
| Stone | `public/assets/minigames/forge/stone.webp` | `Forge/Stone.png` | 1254×1254 forge masonry material |
| Fire | `public/assets/minigames/forge/fire-atlas.webp` | `Forge/Fire.png` | 16-frame 4×4 animated flame atlas |

Prompt specifications used:

1. **Workshop:** Photorealistic medieval blacksmith interior, soot-dark stone, oak roof beams, cool daylight from a left window and orange furnace glow, hanging tools and leather/aprons at the rear. Empty central working space; no people, UI, words or logo. Cinematic realistic materials and light. This image is atmosphere for the loading screen, not a substitute for interactive geometry.
2. **Wood:** Square photorealistic PBR base-color material, old smoked walnut/oak broad horizontal planks, fine grain, nicks, soot and subtle wear, uniform diffuse illumination; no objects, perspective or baked directional shadows.
3. **Stone:** Square photographic rough charcoal stone/refractory brick material, cracked mortar, soot, neutral flat PBR illumination, no objects or directional highlights.
4. **Fire:** Exact 4×4 equal-cell sheet of sixteen consecutive realistic orange/gold forge-flame phases. Same centered base, framing and scale in every cell; margins between flames; left-to-right then top-to-bottom order; pure black background for additive compositing; no labels, text, grid borders or cartoon treatment.

Generated master identifiers: room `exec-6b193ecc-7191-4aa4-83e4-d8d8f37708aa`, wood `exec-5e660ac3-990d-4593-8307-296195fc33b1`, stone `exec-d1f8a2f2-b5c5-493f-a99c-b031e362f57f`, fire `exec-234d67c3-c79f-4269-a88d-bebe4c2bfa56`.

Knives, the reflection environment, workshop models, portraits, particles and audio are generated in code. Assets were inspected in the resulting Unity browser scene. Fire is an animated atlas; the remaining materials are static textures applied to real 3D geometry.

## Human character and locomotion

The rigged male worker, idle/walk/run FBX clips and albedo/normal textures are from [Unity Technologies Standard Assets Characters](https://github.com/Unity-Technologies/Standard-Assets-Characters). They are imported for Unity only under the [Unity Companion License](https://unity.com/legal/licenses/unity-companion-license), with the source notice retained alongside the assets and in the public Web build. The controller, leather apron, hand IK, carrying, hammer pose and station interaction logic are custom. No external controller code or audio was imported.
