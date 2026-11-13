# Third-party notices

## Lunar ephemeris: SunCalc / Meeus series

The adapted lunar and coordinate series in `src/celestial.js` comes from
[SunCalc](https://github.com/mourner/suncalc), revision
`5b6cedd154a8138c51c061b2980090ddacc4f963`. The full notice is retained in source
and reproduced here for source and binary distributions.

Copyright (c) 2026, Volodymyr Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

## Photographs

See [ASSET_CREDITS.md](ASSET_CREDITS.md) for the Commons and Unsplash
photographs, their independent licenses and runtime presentation changes.
The application displays still photographs with their original illumination.
The default captured sequence interpolates actual recorded day/night frames;
it does not include a reconstructed city or an external 3D engine.

Version 1.6 defaults to the captured day/night video "CUHK in a day" by
See-ming Lee / SML Photography / SML Universe Limited, Copyright 2013
See-ming Lee, licensed CC BY 3.0 Unported. Source and author statement:
https://www.flickr.com/photos/seeminglee/8555883879/
License: https://creativecommons.org/licenses/by/3.0/
The end credit slate and soundtrack were removed; scene frames were
re-encoded for seeking, with attribution retained in the app and bundled
ASSET_CREDITS.md and assets/cycles/cuhk/source.json. Original still-photo
scenes now preserve their original illumination instead of claiming that
grading can create authentic night scenes. The captured-cycle implementation
was written independently; no GPL code from the researched wallpaper apps
was copied into this MIT project.

## Electron and Chromium

The portable application includes the runtime's `LICENSE` and
`LICENSES.chromium.html`. The application code's MIT license is delivered as
`PROJECT_LICENSE.txt` so it does not replace Electron's license file.
