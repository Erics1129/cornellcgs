# Generated art — close-up forge redesign

Generated with the built-in image generation tool. Original artwork; no Steam game assets were copied. The Steam page is an art-direction reference for close framing and atmosphere, not an asset source.

## Saved assets

- `unity/ForgeOrFold/Assets/ArtSource/MaterialsV2.png`: generated four-material atlas. `ForgeMaterialImport` splits it into WoodV2, StoneV2, SteelV2 and LeatherV2 during the Unity build. These textures are used on the actual 3D room, equipment, apron, handles and blades.
- `public/assets/forge/generated/steel-v2.png`: steel atlas tile reused inside the matching knife silhouette portraits.
- `public/assets/forge/generated/trade-v2.png`: trade panel artwork.
- `public/assets/forge/generated/workshop-v2.png`: loading screen artwork. The playable scene remains real-time Unity geometry; this illustration is not presented as gameplay.

## Final prompts

### forge-materials-v2

Use case: stylized-concept. Asset type: production PBR diffuse texture atlas for a realistic Unity blacksmith workshop. Generate a square 2048x2048 image with EXACTLY FOUR equal square quadrants, touching with no border or margin, not a collage of objects. Top left: flat close-up weathered smoked brown oak wood grain along horizontal X, finely scratched, subtle scorched patches, no large cracks. Top right: flat soot-stained dark grey medieval stone masonry, small irregular rectangular stones and narrow mortar, believable charcoal blue grey stone. Bottom left: flat dark forged steel surface with thousands of tiny hammer pits and subtle diagonal brushed scratches, neutral grey metal, not shiny white, no objects. Bottom right: flat worn cognac-brown leather, fine pores and subtle scuffs, no seams. All four are orthographic perfectly flat evenly lit albedo material textures, edge to edge, no perspective, no cast shadows, no reflected objects, no text, no labels, no frames. Very high realistic photographic microdetail. Materials from one dark atmospheric premium PC forging game. These will be split into material textures mapped onto real 3D geometry; do not draw a scene or any objects.

### forge-trade-v2

Use case: stylized-concept. Asset type: panoramic shop artwork for an original high quality dark fantasy blacksmith Unity game, 1536x1024 landscape. Cinematic realistic close photograph of a worn blacksmith trading desk: a carefully forged large beautiful polished steel hunting knife laid diagonally at center across dark cognac leather, short stacks of gold coins, two dark ingots, brass weighing scales softly out of focus behind right. Warm amber forge glow off frame left and cold moonlit rim from right. Detailed leather pores, hammered brass, hand-carved dark oak, fingerprints and heat patina. Very dark edges, luminous blade center, premium PC game art rather than website illustration. No lettering, no UI, no logos, no people, no watermark. Strong realistic physically based materials. Keep composition readable at small size, one hero knife, muted charcoal and amber palette.

### forge-workshop-v2

Use case: stylized-concept. Asset type: cinematic loading screen artwork for an original Unity blacksmith game, 1536x1024 landscape. Realistic first person view over a huge weathered steel anvil, a large glowing orange forged knife lying across its flat face, steel hammer resting at right, a roaring brick furnace left, worn oak workbenches and racks of swords behind, tall iron mullion window with cool blue moonlight and drifting smoke. Dark medieval stone workshop full of real material detail, tiny flying embers near glowing steel, restrained cinematic depth of field, intense volumetric lighting and grounded metal reflections, premium atmospheric PC game look. Blade is dominant foreground hero, camera close to anvil. No characters, no text, no lettering, no UI, no watermarks, no modern items. Image will be loading artwork, live game is actual Unity 3D.

