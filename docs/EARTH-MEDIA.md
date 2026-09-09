# Earth journey: media, licensing, and integration

The main World chapter moves from a NASA-derived dotted globe through Jatiluwih, the Nā Pali Coast, the Dolomites, Skógafoss and Liberty Island, arriving at Cornell University in Ithaca. The place captions describe geography only; they do not assert that Cornell CGS has members, operations, events, or affiliations in those places. The existing `world.heading`, `world.text`, and single `/world/` community link are retained.

## Shipped assets

All paths below are relative to `public/assets/earth-journey/`. Sources and rights were checked on September 8, 2026. `credits.json` preserves each original download URL, original filename, creator, source page, rights link, capture/data date, original dimensions and byte count, original SHA-256, output dimensions and bytes, and modification notes. Attribution is also embedded in each WebP's EXIF metadata. Full-resolution downloaded originals and QA captures stay in `/tmp`, outside the website payload.

| File | Dimensions | Bytes | Credit and rights |
| --- | --- | ---: | --- |
| `liberty-island.webp` | 1920 × 1253 | 146,014 | National Park Service — public domain |
| `bali-jatiluwih.webp` | 1920 × 1152 | 374,660 | Jorge Franganillo — CC BY 2.0 |
| `hawaii-na-pali.webp` | 1920 × 1282 | 478,936 | Andrew Baerst — CC BY 2.0 |
| `earth-nasa-july-4096.webp` | 4096 × 2048 | 765,670 | NASA Earth Observatory — public-domain NASA imagery |

The three photographs total **999,610 bytes** (under 1 MB decimal). The additional 4K Earth texture brings all four images to **1,765,280 bytes**. Photos retain their original aspect ratios and are delivered as WebP at quality 79 (Liberty Island/Bali) and 70 (Nā Pali), with responsive CSS cropping. The map is WebP quality 86, preserving the source's 2:1 equirectangular geometry. No image has been generatively altered or had geographic features edited.

## Statue of Liberty / New York

- **Title:** The Statue of Liberty on Liberty Island.
- **Credit:** National Park Service; the source specifies “NPS Photo.” No individual photographer is named in the selected asset record.
- **Primary source and rights:** [NPS asset 3454fd91-1dd8-b71b-0b21-a93398840c35](https://npgallery.nps.gov/AssetDetail/3454fd91-1dd8-b71b-0b21-a93398840c35). The specific record lists **Public domain: Full Granting Rights**, independently of general NPS-site boilerplate.
- **Original:** [4211 × 2749 JPEG](https://www.nps.gov/npgallery/GetAsset/3454fd91-1dd8-b71b-0b21-a93398840c35/original), original filename `3457A073-1DD8-B71B-0BEB2FF4DD540CD5.jpg`.
- **Capture date:** September 20, 2010, according to the NPS embedded timestamp.
- **Changes:** resized and WebP encoded; viewport-dependent display crop, contrast scrim, and scroll transform. No retouching.
- **Visible attribution:** “Photo: National Park Service · Public domain,” linked to the asset/rights page.

## Jatiluwih / Bali

- **Title:** Bali- Jatiluwih rice terraces - 50281829296.jpg.
- **Photographer:** Jorge Franganillo.
- **Source and license record:** [Wikimedia Commons file page](https://commons.wikimedia.org/wiki/File:Bali-_Jatiluwih_rice_terraces_-_50281829296.jpg).
- **Photographer's original publication:** [Flickr / Jorge Franganillo](https://www.flickr.com/photos/franganillo/50281829296/).
- **Original file:** [4486 × 2692 JPEG](https://upload.wikimedia.org/wikipedia/commons/1/1b/Bali-_Jatiluwih_rice_terraces_-_50281829296.jpg).
- **License:** [Creative Commons Attribution 2.0 Generic](https://creativecommons.org/licenses/by/2.0/). Commons records a successful FlickreviewR 2 license review on August 30, 2020.
- **Capture date:** August 14, 2018.
- **Changes:** resized and WebP encoded; viewport-dependent display crop, contrast scrim, and scroll transform. No retouching.
- **Visible attribution:** photographer/source link and a separate “CC BY 2.0” license link. The source link's title describes the resizing, encoding, and display crop.

## Nā Pali Coast / Hawaiʻi

- **Title:** Na Pali Coast.
- **Photographer:** Andrew Baerst; the original embedded copyright credits “Andy Baerst — 2016.” Both forms are retained in `credits.json`.
- **Source and license record:** [Wikimedia Commons file page](https://commons.wikimedia.org/wiki/File:Na_Pali_Coast_(28915675361).jpg).
- **Photographer's original publication:** [Flickr / Andrew Baerst](https://www.flickr.com/photos/baerst/28915675361/).
- **Original file:** [4096 × 2734 JPEG](https://upload.wikimedia.org/wikipedia/commons/e/e3/Na_Pali_Coast_%2828915675361%29.jpg).
- **License:** [Creative Commons Attribution 2.0 Generic](https://creativecommons.org/licenses/by/2.0/). Commons records a successful FlickreviewR 2 license review on July 29, 2019.
- **Capture date:** June 29, 2016.
- **Changes:** resized and WebP encoded; viewport-dependent display crop, contrast scrim, and scroll transform. No retouching.
- **Visible attribution:** photographer/source link and a separate “CC BY 2.0” license link, with modification information in the source link's title.

The two CC licenses allow redistribution and adaptation with attribution. Credit the named photographers, retain source and license links, and identify modifications when reusing these derivatives. This use does not imply endorsement by a photographer or source organization.

## NASA Earth texture

- **Title:** Blue Marble: Next Generation, July 2004, with topography and bathymetry.
- **Credit:** NASA Earth Observatory. Produced by Reto Stöckli (NASA/GSFC).
- **Primary source:** [NASA Earth Observatory map collection, July](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/).
- **Credit guidance:** [NASA Earth Observations: Blue Marble Next Generation](https://neo.gsfc.nasa.gov/view.php?datasetId=BlueMarbleNG).
- **Original file:** [NASA 5400 × 2700 JPEG](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg).
- **Reuse guidance:** [NASA images and media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). NASA imagery is public domain unless a specific third-party restriction is noted. This use credits NASA Earth Observatory and does not imply NASA endorsement.
- **Provenance:** an actual satellite-data monthly composite, with topographic/bathymetric relief shading. It is not a single photograph, live weather, or street-level imagery. The continent and coastline approach uses this geographically referenced source; the following landscape photographs supply real ground-level detail.
- **Derivative:** source resized to 4096 × 2048, WebP encoded, with original orientation/projection unchanged. The shader adds illustrative lighting and sphere projection. The visible opening credit links to NASA Earth Observatory.
- **Previous texture:** `/assets/scenes/earth-map.webp` was a generated illustrative map. It is untouched and is not the source for the new 4K texture. It may remain available as an explicitly illustrative fallback, but should not be used for the coastline approach.

### Renderer contract

Use the full public URL **`/assets/earth-journey/earth-nasa-july-4096.webp`** for the Earth entry in `SceneCanvas`'s `ASSETS`. It is outside `/assets/scenes/`; do not prepend that directory. Main owns this renderer integration.

`src/effects/earthShader.ts` exports `EARTH_SHADER`, a string defining `vec3 earth()`. Interpolate it into the parent fragment shader, replacing the earlier Earth function. It relies on existing `v_uv`, `u_size`, `u_pointer`, `u_progress`, `u_compact`, `u_image`, `PI`, and `rotate()`. It has no time uniform dependency and does not change other scene functions.

- Full-root progress: `top top` → `bottom bottom`, 0…1.
- North-up equirectangular image: longitude −180…180° across the width; latitude +90…−90° top to bottom. The existing WebGL upload flips the image vertically.
- Apply `nn.yz` latitude rotation **before** `nn.xz` longitude rotation. With the parent's matrix convention, the central surface normal samples `(cos(latitude) sin(longitude), sin(latitude), cos(latitude) cos(longitude))`.
- Initial longitude 20°E, latitude 15°N. Orbit 0…0.24 reveals the Atlantic, Americas and Pacific. Approach 0.23…0.36 settles toward Bali at 115°E, 8.5°S. The dotted land mask is derived from the NASA texture; a blue–violet–gold atmospheric rim supplies illustrative lighting. The map does not resolve ground-level landmarks.
- Reduced-motion Earth uniform: **`.12`**, so the initial static globe remains alongside the original community copy.

## Journey v2 media (September 9, 2026)

`journey-v2-credits.json` retains original source records, hashes, licenses and modification notes for the three additions. Photographs are real, resized to 1920px wide and WebP quality 78. No generative edits.

| File | Bytes | Photographer / rights | Original source |
| --- | ---: | --- | --- |
| `dolomites.webp` | 276,254 | Simone Mainetti / CC BY-SA 4.0 | [Tre Cime di Lavaredo](https://commons.wikimedia.org/wiki/File:Tre_Cime_di_Lavaredo_al_Tramonto.jpg) |
| `iceland.webp` | 152,310 | Martin Falbisoner / CC BY-SA 4.0 | [Skógafoss](https://commons.wikimedia.org/wiki/File:Sk%C3%B3gafoss_July_2014.JPG) |
| `cornell-ithaca.webp` | 390,488 | P. Hughes / CC BY 4.0 | [McGraw Tower and Uris Library](https://commons.wikimedia.org/wiki/File:Cornell_University_-_Uris_Library,_McGraw_Tower_and_Olin_Library.jpg) |

New photos total 819,052 bytes. Each figure visibly links its source and license. CC BY-SA photo derivatives remain under that license. Runtime crops and grades each photograph: warm greens for Bali, cool coastal cyan for Hawaiʻi, warm alpine light, restrained cool Iceland, neutral New York, and warm natural Cornell. The source credit's title discloses cropping, grading and motion blur. These display treatments do not change geography or imply a source's endorsement.

## Scroll and accessibility behavior

The World root is 900svh on desktop and 780svh on compact/portrait viewports. Its stage uses native sticky positioning, without a scroll lock or nested scroller. The static/reduced-motion layout displays all six photographs in ordinary document flow.

| Root progress | Visual |
| --- | --- |
| 0…0.30 | Dotted orbit; community copy fades 0.20…0.30 |
| 0.23…0.36 | Approach Indonesia |
| 0.30…0.37 | Arrive in Bali; hold until 0.51 |
| 0.51…0.57 | Hawaiʻi; hold until 0.67 |
| 0.67…0.714 | Dolomites; hold until 0.78 |
| 0.78…0.810 | Iceland; hold until 0.85 |
| 0.85…0.874 | New York; hold until 0.90 |
| 0.90…0.922 | Cornell University, Ithaca |
| 0.922…1 | Quiet final Cornell hold |

`earthJourney.ts` is the shared clock for the two-texture WebGL compositor, the semantic photo/caption fallback, and keyboard navigation. Each transition accelerates a small camera push and shortens the scroll distance. Seven bounded radial samples create velocity-driven motion blur. It decays to exactly zero when scrolling stops; no photo animation plays on a timer. The last Cornell hold is almost static and framed below the navigation bar. Reversing scroll retraces the same composition.

`EarthTravel` loads photos near the chapter, caps canvas resolution and mobile texture sizes, and draws only while progress or residual blur changes. The globe renderer suspends after 0.375; the homepage city suspends while Earth covers the viewport. Context loss, unavailable graphics, or an image failure retain the underlying DOM photographs. Reduced motion removes the GPU photo sequence and exposes all figures normally. All resources and observers are cleaned up on unmount/preference changes.

Only the foremost photo accepts pointer input. Keyboard focus on a source/license seeks that photo's precise stop, including the short final transitions; Shift+Tab reverses correctly. Community and NASA links seek the globe. Alt text, captions, source links and print layout remain available independently of WebGL.
