# Fuji / Hirano-no-hama generation prompts

Generated on 2026-11-11 with the built-in `image_gen` tool in the `imagegen` skill default mode. No API/CLI fallback or pixel-edit scripts were used.

## Reference and attribution

Geographic reference: [Hirano, Yamanakako … panoramio (78)](https://commons.wikimedia.org/wiki/File:Hirano,_Yamanakako,_Minamitsuru_District,_Yamanashi_Prefecture_401-0502,_Japan_-_panoramio_(78).jpg), photograph by **Алексей Чикишев**, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Local reference: `assets/references/fuji-hirano-day-panorama.jpg`. Commons camera coordinates: **35.426739, 138.872791**, eastern/Hirano shore of Lake Yamanaka; date 2016-04-26. The generated noon image adapts the source composition to an approximately 16:9 frame, expands sky/lake, removes foreground stakes/boats and reconstructs detail. Other phases change the generated noon image's illumination and atmosphere. These outputs are AI-generated visual interpretations, not documentary photographs of the site or live views. This attribution applies to the reference and adapted imagery independently of the code license.

## Method and visual QA

The exact geographic reference was opened with `view_image` before generating. The noon master was saved locally and inspected. Each of the four other phases was a separate lighting/weather edit referencing the same **noon master**, never a previous phase. This avoids cascading camera drift. Each output was inspected inline: Fuji profile, summit, snow boundaries, shoreline and main buildings remain visually aligned; lake ripples/light reflections may vary naturally. No pagoda, cherry blossom frame, boat, text or UI was introduced. Night includes generated sparse stars and existing shore window illumination.

All five final PNGs have dimensions **1672 × 941** (the built-in tool's approximately 16:9 output; no post-generation crop or resizing).

## Exact prompts

### noon

Final: `assets/landscapes/fuji-noon.png`

```text
Use case: photorealistic-natural. Asset type: single full-screen digital-window landscape photograph, 16:9 horizontal, ideally 2560x1440 or larger. Input image 1 is an exact geographic reference: Mount Fuji viewed southwest from Hirano-no-hama on the eastern shore of Lake Yamanaka, Japan, camera location 35.426739 N 138.872791 E. Create one faithful NOON photograph of this same actual viewpoint. Keep the reference's precise Fuji profile, broad symmetrical snow-covered summit, volcanic flank geometry, relative lakeshore buildings, distant tree line and viewpoint perspective. Expand the sky and calm lake vertically as needed for a natural 16:9 composition, without changing geographic geometry. Fuji centered, summit at about 26% image height, distant shoreline around 64%, lake fills lower third, subtle water ripples. Clear neutral midday sunlight, natural blue sky and true snow/forest/water textures, high photographic realism, no stylization. This must look like a real view from the Hirano beach across Lake Yamanaka, never Lake Kawaguchi, never Chureito. Remove foreground stakes/boats from reference, no people, swans, foreground structures, pagoda, torii, cherry blossoms, signage, borders, UI, labels, watermark, lens flare or added sun disc. A single continuous image, no collage or split panels. This noon image will be the fixed camera master for later lighting-only edits, so use clean stable geometry.
```

### dawn

Final: `assets/landscapes/fuji-dawn.png`

```text
Use case: lighting-weather. Asset type: full-screen digital-window landscape, one photograph. Input image 1 is the EDIT TARGET and immutable camera master. Change ONLY illumination, sky color, and atmospheric exposure to PRE-SUNRISE DAWN at Hirano-no-hama, eastern Lake Yamanaka, Japan. Maintain exactly the same 16:9 dimensions, crop, mountain outline, snow patch boundaries, trees, shoreline buildings, lake horizon, relative feature positions, focal length and every solid object as the supplied noon image. No zooming or camera movement. Fuji stays exactly centered at the same pixel scale. Dawn: sun still just below eastern horizon behind the camera; softly glowing pale rose and lavender sky above the southwest-facing Fuji view, delicate pink alpenglow on the snow, cool blue lower mountain and lake, small natural water ripples and faint reflected pink dawn glow. Photo-real dawn with visible detail, a clearly different time from morning and noon; no fog hiding geography. Do not add sun disc, moon, stars, clouds that change terrain, boats, people, swans, structures, cherry blossoms, pagoda, text, UI, labels, border or watermark. Single continuous landscape, never collage. Preserve all geometry, change only light and color.
```

### morning

Final: `assets/landscapes/fuji-morning.png`

```text
Use case: lighting-weather. Asset type: full-screen digital-window landscape, one photograph. Input image 1 is the EDIT TARGET and immutable camera master. Change ONLY illumination and atmospheric color to CLEAR EARLY MORNING around 08:00 at Hirano-no-hama, eastern Lake Yamanaka, Japan. Maintain exactly the same 16:9 dimensions, crop, mountain outline, snow patch boundaries, trees, shoreline buildings, lake horizon, relative feature positions, focal length and every solid object as supplied. No zooming or camera movement. Fuji stays exactly centered at the same pixel scale. Morning: low sun in the east behind the camera, gentle warm cream sunlight illuminates the snow and upper slopes, fresh clear pale blue sky, warmer highlighted eastern mountain face with cool shaded crevices, delicate morning haze at lower slopes that does not hide details, fresh turquoise-blue lake with fine ripples, natural subtle warm reflection. Brighter than dawn, gentler and warmer than the neutral midday master, no pink/purple dawn gradient. High photographic realism. Do not add sun disc, moon, stars, boats, people, swans, structures, cherry blossoms, pagoda, text, UI, labels, border or watermark. Single continuous landscape, never collage. Preserve all geography/geometry, change only light and color.
```

### evening

Final: `assets/landscapes/fuji-evening.png`

```text
Use case: lighting-weather. Asset type: full-screen digital-window landscape, one photograph. Input image 1 is the EDIT TARGET and immutable camera master. Change ONLY illumination, sky color, reflections and atmospheric exposure to WARM EVENING TWILIGHT immediately after sunset at Hirano-no-hama, eastern Lake Yamanaka, Japan. Maintain exactly the same 16:9 dimensions, crop, mountain outline, snow patch boundaries, trees, shoreline buildings, lake horizon, relative feature positions, focal length and every solid object as supplied noon image. No zooming or camera movement. Fuji stays exactly centered at the same pixel scale. Evening: sun has set in the west/southwest beyond Fuji; luminous amber-apricot and soft coral horizon behind mountain, fading upward to subdued blue. Fuji foreground slopes in believable cool silhouette, snowy summit still softly visible, warm glow at the horizon and its natural muted golden-coral reflection on calm rippled lake. Several existing tiny shore buildings have sparse warm window lights, but no new buildings. Cinematic but restrained real landscape photography, clear detail. No sun disc at all, no fake Diamond Fuji flare, no extra clouds hiding mountain, no moon, stars, boats, people, swans, foreground structures, cherry blossoms, pagoda, text, UI, labels, border or watermark. Single continuous landscape, never collage. Preserve all geography/geometry, change only light and color.
```

### night

Final: `assets/landscapes/fuji-night.png`

```text
Use case: lighting-weather. Asset type: full-screen digital-window landscape, one photograph. Input image 1 is the EDIT TARGET and immutable camera master. Change ONLY illumination, sky, reflections and atmospheric exposure to TRUE CLEAR NIGHT around 22:00 at Hirano-no-hama, eastern Lake Yamanaka, Japan. Maintain exactly the same 16:9 dimensions, crop, mountain outline, snow patch boundaries, trees, shoreline buildings, lake horizon, relative feature positions, focal length and every solid object as supplied noon image. No zooming or camera movement. Fuji stays exactly centered at the same pixel scale. Night: deep inky midnight blue sky with a restrained sparse scattering of faint real stars; natural cool ambient moonlight from outside the frame softly reveals snow cap and mountain shape while dark forest and foothills fall into rich dark silhouettes. Existing shoreline buildings have small warm yellow window lights at their same locations, reflected as short delicate streaks in dark calm lake. Lake truly night-dark, lower ripples just readable, no noon-like brightness. Keep the result believable as a night long exposure, atmospheric and quiet, not a blue daytime filter. No visible moon or sun disc, no Milky Way, artificial horizon flare, fog hiding terrain, boats, people, swans, foreground structures, cherry blossoms, pagoda, text, UI, labels, border or watermark. Single continuous landscape, never collage. Preserve all geography/geometry, change only light and color.
```

