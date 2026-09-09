# Earth journey: media, licensing, and integration

The main World chapter moves from a satellite-data globe to real photographs of Liberty Island, Jatiluwih, and the Nā Pali Coast. The place captions describe geography only; they do not assert that Cornell CGS has members, operations, events, or affiliations in those places. The existing `world.heading`, `world.text`, and single `/world/` community link are retained.

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
- **Provenance:** an actual satellite-data monthly composite, with topographic/bathymetric relief shading. It is not a single photograph, live weather, or street-level imagery. The continent and coastline approach uses this geographically referenced source; the following Liberty Island photograph supplies real ground-level detail.
- **Derivative:** source resized to 4096 × 2048, WebP encoded, with original orientation/projection unchanged. The shader adds illustrative lighting and sphere projection. The visible opening credit links to NASA Earth Observatory.
- **Previous texture:** `/assets/scenes/earth-map.webp` was a generated illustrative map. It is untouched and is not the source for the new 4K texture. It may remain available as an explicitly illustrative fallback, but should not be used for the coastline approach.

### Renderer contract

Use the full public URL **`/assets/earth-journey/earth-nasa-july-4096.webp`** for the Earth entry in `SceneCanvas`'s `ASSETS`. It is outside `/assets/scenes/`; do not prepend that directory. Main owns this renderer integration.

`src/effects/earthShader.ts` exports `EARTH_SHADER`, a string defining `vec3 earth()`. Interpolate it into the parent fragment shader, replacing the earlier Earth function. It relies on existing `v_uv`, `u_size`, `u_pointer`, `u_progress`, `u_compact`, `u_image`, `PI`, and `rotate()`. It has no time uniform dependency and does not change other scene functions.

- Full-root progress: `top top` → `bottom bottom`, 0…1.
- North-up equirectangular image: longitude −180…180° across the width; latitude +90…−90° top to bottom. The existing WebGL upload flips the image vertically.
- Apply `nn.yz` latitude rotation **before** `nn.xz` longitude rotation. With the parent's matrix convention, the central surface normal samples `(cos(latitude) sin(longitude), sin(latitude), cos(latitude) cos(longitude))`.
- Initial longitude 115°E; orbit settles at approximately 38°N, 100°W. The final approach moves toward 40.7°N, 74°W, near New York Harbor. The source's resolution does not resolve the statue itself.
- Reduced-motion Earth uniform: **`.12`**, so the initial static globe remains alongside the original community copy.

## Scroll and accessibility behavior

The enhanced World root is 700svh on desktop and 600svh on compact/portrait viewports. Its 100svh stage uses native sticky positioning, without a scroll lock or a nested scroller. The static/reduced-motion layout has natural document height and displays all three photo figures in order.

| Root progress | Visual |
| --- | --- |
| 0…0.30 | Longer orbit; community heading, body, and link are visible early, then fade from 0.20…0.30 |
| 0.30…0.53 | Move toward North America, then the New York coast; continent caption appears 0.345…0.39 and fades 0.475…0.51 |
| 0.50…0.58 | Dissolve into Liberty Island |
| 0.67…0.75 | Dissolve into Jatiluwih |
| 0.84…0.92 | Dissolve into Nā Pali |
| 0.92…1 | Hold the final place while its gentle scroll pan/zoom completes |

Photo motion uses only GPU-friendly transforms and opacity, directly scrubbed by scroll. There is no autoplay, repeating motion, animated blur, per-frame React state, or continuous photo rAF loop. The outgoing photograph remains opaque under the incoming dissolve to avoid a brightness dip. Captions stay still and fade separately, without moving readable text. The globe box is removed after 0.59 so its renderer's IntersectionObserver suspends WebGL while the photos cover it; scrolling backward restores the box.

Figures have descriptive alternative text, geographic captions, and visible source/license links. Keyboard focus on a photo credit seeks the corresponding scene, including when reversing with Shift+Tab. The original community link and NASA credit seek the introductory globe. Hidden layers do not intercept pointer input. Reduced motion removes the sticky sequence and transforms; the community content and all photographs remain accessible in ordinary page flow. The timeline and media listener are reverted on cleanup or preference changes.
