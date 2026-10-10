# Forge or Fold: Unity art direction

An original, enclosed blacksmith workshop with soot-stained masonry, dark oak beams, cool window light and a warm furnace. The fixed camera looks across a real 3D bench toward the room. Anvil and held knife are the focal objects. Charcoal-green panels and restrained brass type sit over the scene, with distinct mobile controls below it.

Unity 6000.3.18f1 renders the game. The room uses bevelled geometry, textured wood and stone, a forged-profile anvil, four-slot blade rack, fuel, tongs, tool rail, shop ingots, scale and lantern. The eight knife families are extruded from shared original profiles and gain silhouette/detail changes at levels 3, 6, 9, 12 and 15. A physically based shader gives separate roughness/metalness, folded Damascus bands, an Auricite interference tint, and a tip-to-handle heat gradient. An original code-generated cube environment supplies metal reflections.

The Unity hammer drives the contact event; only then does the rules engine resolve the hit. Short impact stop, camera displacement and point-light flash are disabled under reduced motion. Springs drive carried knives. Pooled fragments bounce off the bench; gold, dust, metal and sparks use different material/motion treatments. Evolution lifts the knife, changes its geometry, blooms through emissive material and emits a ring. The generated 4×4 flame sheet animates at 14 frames per second.

Performance choices: one Unity update loop, static room batching, a maximum of 160 impact fragments, reusable fragment objects, 1024px source texture import limit, resolution cap, and automatic shadow reduction. The HUD only reacts to actions and a one-second timer. No claim of sustained 60 fps on physical mid-range phones is made without a device test.

The generated workshop still is used only while loading. The playable room is Unity geometry. See [generated assets](GENERATED-ASSETS.md). No art or models were extracted from the visual reference.
