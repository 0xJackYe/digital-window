# Medieval European old town · generated landscape set

Created 2026-11-11 with the built-in `image_gen` tool, following the imagegen skill. No CLI/API fallback was used. These are generated illustrative scenes inspired by Prague, rather than documentary photographs of a verified real viewpoint.

Files: `medieval-dawn.png`, `medieval-morning.png`, `medieval-noon.png`, `medieval-evening.png`, `medieval-night.png`. Every lighting edit used `medieval-noon.png` as its single edit target. The master and all four edits were visually inspected; architecture, camera and crop stay aligned for crossfading.

## Noon master prompt

Use case: photorealistic-natural

Asset type: fullscreen landscape background for a digital window desktop application, wide 16:9 composition.

Primary request: A highly photorealistic, cozy authentic medieval European old town, inspired by Prague Mala Strana, viewed from an upper floor residential viewpoint looking over beautiful red terracotta rooftops and along a narrow curving cobblestone lane toward historic Gothic church towers. Cream and pale ochre old stone and plaster houses, weathered masonry, small leaded windows, warm terracotta tiles, a few leafy trees. Architecture feels authentic and lived in, with exquisite realistic detail.

Composition: continuous edge-to-edge outdoor view, landscape orientation; eye-level from a second or third floor; layered rooftops occupy lower two thirds and open pale blue sky above; inviting quiet atmosphere, natural 35mm architectural photography, realistic proportions and straight structures. The viewpoint implies looking outside but absolutely no visible window, frame, sill, wall, balcony railing or interior foreground.

Lighting: bright clear late-spring midday, natural neutral sunlight, detailed readable stone textures, gentle natural shadows, subtle light clouds.

Constraints: no people, no modern skyscrapers, no vehicles, no signs or text, no watermark, no fantasy castle, no exaggerated spires, no artificial illustration look. This is the NOON master image whose scene geometry will be preserved for later lighting-only edits. Deliver one wide 16:9 full-bleed photographic image.

## Dawn edit prompt

Use case: lighting-weather.

Edit target: the attached noon master of Prague-inspired medieval red rooftops and cobblestone lane. Produce its DAWN lighting variant for pixel-aligned fullscreen crossfades.

Change only the lighting, sky brightness/color, natural shadow softness and a few existing window lights. It is early dawn just before sunrise: pale lavender-blue upper sky blending soft peach and rosy gold at the horizon, very low gentle warm light touching roof edges and towers, cool blue shadows on stone facades and the empty lane, a few existing windows glow faint amber. Scene remains readable, calm and photorealistic.

Strict invariants: identical camera, crop, aspect ratio, roof and tower geometry, all house/window positions, street, trees and leaves. Preserve every object and architectural detail; do not add/remove buildings, streets, people, foreground objects, frames or text. No visible sun disc. Keep photographic detail. No modern buildings or people. Only transform time-of-day light, keeping the original scene layout exactly.

## Morning edit prompt

Use case: lighting-weather.

Edit target: attached noon master of Prague-inspired medieval red-tile rooftops, old stone houses and cobblestone lane. Produce its MORNING lighting variant for pixel-aligned fullscreen crossfades.

Change only time-of-day lighting: fresh clear morning around 8:30, warm gentle sunlight from the left, long natural shadows following existing roof/wall forms, soft golden highlights on the terracotta and worn plaster, fresh pale blue sky and delicate high clouds. A tranquil bright morning with neutral readable shadows, slightly cooler than midday shade and softer contrast.

Strict invariants: preserve the exact camera, crop, wide 16:9 ratio, all architecture/towers/window geometry, houses, street, tree/leaf positions and every object. No new or removed buildings, people, objects or text; no frame or interior. Do not redesign or recompose the image. Maintain realistic detailed architectural photography. Only alter sun illumination, sky light/color and shadows.

## Evening edit prompt

Use case: lighting-weather.

Edit target: attached noon master of Prague-inspired medieval red-tile rooftops and cobblestone street. Create its EVENING / SUNSET lighting variant for pixel-aligned fullscreen crossfades.

Change only sky, illumination and shadows to rich believable sunset: warm amber-orange light grazing roofs and Gothic tower edges, soft rose and apricot clouds against a lavender-blue sky, long violet shadows filling the narrow lane, restrained golden sunlight on upper stone facades, a few existing windows softly lit amber. The scene is cozy, still, natural and photorealistic rather than over-saturated. Sky has a gentle peach horizon and lavender above; do not show a sun disc.

Strict invariants: preserve exact camera, crop, aspect ratio and every roofline, dome, tower, window, tree/leaf position, street and object. No architecture change, no extra/missing objects or people, no text, no frame or sill. Lighting and sky only; photographic details remain crisp and realistically readable.

## Night edit prompt

Use case: lighting-weather.

Edit target: attached noon master of Prague-inspired medieval red-tile rooftops, stone houses, Gothic towers and an empty cobblestone lane. Create its NIGHT lighting variant for pixel-aligned fullscreen crossfades.

Change only lighting and sky: quiet believable European old-town night after blue hour. Deep indigo star-sparse night sky, soft cool moonlit roof edges and dark blue shadows, warm amber light spilling from a tasteful minority of the EXISTING house windows, existing wrought-iron street lanterns glowing gently and pooling light on the SAME cobbled lane, restrained subtle warm architectural illumination on the existing church towers. No added lamp posts or fixtures. Cozy, natural, dark but detailed enough to see architecture; convincing photographic dynamic range, no orange wash.

Strict invariants: exact same camera/crop/16:9 ratio, every building, roofline, dome, tower, window, street, tree/leaf position and all objects remain unchanged. No newly invented architecture or ornaments, no people or traffic, no text/watermark, no visible window frame or sill. Do not add a moon disc. Only transform the night sky, natural darkness, existing window/lantern illumination and shadows.
