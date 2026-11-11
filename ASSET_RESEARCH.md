# Reference research for the four requested scenes

Research and downloads: 2026-11-11. The images in `assets/references/` are photographic references, not a five-phase time-lapse set. No source examined supplied dawn, morning, noon, evening and night from one perfectly fixed camera. Switching between unrelated source photos would visibly change geometry, so the final assets use a single generated master per scene followed by separate lighting-only edits.

## Mount Fuji from Hirano-no-hama, Lake Yamanaka

This is a specifically verified **east/Hirano-shore** viewpoint, not a generic Mount Fuji photograph and not Lake Kawaguchi or Chureito Pagoda.

- Day reference: `assets/references/fuji-hirano-day-panorama.jpg`, 6660 × 2055. Photograph by **Алексей Чикишев**, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Primary source: [Wikimedia file page](https://commons.wikimedia.org/wiki/File:Hirano,_Yamanakako,_Minamitsuru_District,_Yamanashi_Prefecture_401-0502,_Japan_-_panoramio_(78).jpg).
- [Original JPEG](https://upload.wikimedia.org/wikipedia/commons/3/35/Hirano%2C_Yamanakako%2C_Minamitsuru_District%2C_Yamanashi_Prefecture_401-0502%2C_Japan_-_panoramio_%2878%29.jpg).
- Primary-source camera location: **35.426739 N, 138.872791 E**. Date: 2016-04-26. Filename explicitly identifies Hirano, Yamanakako. Visually inspected: Fuji across the lake, small opposite-shore buildings, broad mountain profile, lake foreground.
- Night lighting reference: `assets/references/fuji-hirano-night.jpg`, 1800 × 1269; **Jun** from Kanagawa, [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/). [Wikimedia file page](https://commons.wikimedia.org/wiki/File:Night_view_of_Mt._Fuji.jpg), [original JPEG](https://upload.wikimedia.org/wikipedia/commons/8/83/Night_view_of_Mt._Fuji.jpg). Primary-source coordinates **35.426826, 138.878602** put it nearby on the eastern side; it has a tighter composition and foreground boats and is unsuitable for direct crossfades with the day image. Downloaded as a lighting/geography reference only, not used as the generation target.

Five final generated images now exist at `assets/landscapes/fuji-{dawn,morning,noon,evening,night}.png`. The noon image was generated from the exact day reference, expanding sky/lake to approximately 16:9 and removing foreground stakes. Each other phase is independently edited from that same noon image. See [fuji-PROMPTS.md](assets/landscapes/fuji-PROMPTS.md) for exact prompts, transformation description, attribution and QA notes. These are AI-generated interpretations of the reference, not documentary or live photographs. Retain reference attribution when distributing the adapted imagery.

## Manhattan from inside a residential-style high-rise window

- Reference: `assets/references/manhattan-apartment-day.jpg`, 2560 × 3840 downloaded derivative.
- **Andrea Davis**, [White and Brown High Rise Buildings](https://www.pexels.com/photo/white-and-brown-high-rise-buildings-10812975/), Pexels photograph ID 10812975. Original 3349 × 5024, source says New York, NY and describes the skyline from a modern apartment window.
- [Download JPEG](https://images.pexels.com/photos/10812975/pexels-photo-10812975.jpeg?auto=compress&cs=tinysrgb&w=2560).
- [Pexels License](https://www.pexels.com/license/). Source page identifies it as free to use. Viewed locally: window mullions, nearby Manhattan buildings, domestic chair edge. The portrait composition is useful as an architectural/perspective reference and would need a new wide composition for the full-screen scene. No claim is made that the private interior is a specific named residential property.

## Medieval European old town

- Reference: `assets/references/rothenburg-day.jpg`, 2560 × 3840 downloaded derivative.
- **Florian Süß**, [Quaint Alleyway in Rothenburg ob der Tauber](https://www.pexels.com/photo/quaint-alleyway-in-rothenburg-ob-der-tauber-30035565/), Pexels ID 30035565. Original 4621 × 6931. Source location Rothenburg ob der Tauber, Bavaria, Germany.
- [Download JPEG](https://images.pexels.com/photos/30035565/pexels-photo-30035565.jpeg?auto=compress&cs=tinysrgb&w=2560).
- [Pexels License](https://www.pexels.com/license/). Viewed locally: cobbled lane, Markus tower/clock, historic hotel facades and warm existing lamps. It is a portrait reference, not a ready wide-screen master.
- Additional primary-source night collection: [Night in Rothenburg ob der Tauber on Wikimedia](https://commons.wikimedia.org/wiki/Category:Night_in_Rothenburg_ob_der_Tauber). Licenses differ by file; category listing alone is not a license for any photo.

## Kyoto historic streets

- Reference: `assets/references/kyoto-yasaka-evening.jpg`, 2560 × 1920 downloaded derivative.
- **Rizk Nas**, [Scenic View of Kyoto Pagoda at Sunset](https://www.pexels.com/photo/scenic-view-of-kyoto-pagoda-at-sunset-31713582/), Pexels ID 31713582. Original 5164 × 3873, location Kyoto, Japan.
- [Download JPEG](https://images.pexels.com/photos/31713582/pexels-photo-31713582.jpeg?auto=compress&cs=tinysrgb&w=2560).
- [Pexels License](https://www.pexels.com/license/). Viewed locally: traditional tiled roofs/wood facades and Yasaka-area pagoda at sunset. The image emphasizes roofs and pagoda rather than a complete street floor; generation should establish a consistent wider old-street view.
- Night reference candidates discovered but not downloaded: [Historic Kyoto Street at Night with Traditional Houses](https://www.pexels.com/photo/historic-kyoto-street-at-night-with-traditional-houses-35195397/) by MacroLingo LLC (2628 × 1752, Pexels), and [Streets of Gion, Kyoto - Gion7709](https://commons.wikimedia.org/wiki/File:Streets_of_Gion,_Kyoto_-_Gion7709.jpg) by lumoplank (5105 × 3403, source states CC0). These have different viewpoints and should be lighting references rather than alternated as if recorded by one fixed camera.

## Licensing and provenance notes

Pexels permits free use and modification and appreciates attribution; consult the [complete license](https://www.pexels.com/license/) for its restrictions, including separate redistribution through stock-photo or wallpaper platforms. The source photographs' licenses apply independently of the project's code license. No purchased Unsplash+ images were downloaded. No generated asset existed in the original workspace; existing `alpine-lake.jpg`, `forest.jpg` and `ocean-coast.jpg` were from the earlier landscape brief and are unrelated to the exact four new locations.
