"""Download original, freely licensed photographs; never resample or generate pixels.

Run from any working directory with Python + requests + Pillow. Metadata and
checksums are written beside the originals for attribution and reproducibility.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import time
from pathlib import Path

import requests
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets" / "landscapes" / "photos"
SOURCES = {
    "manhattan": "File:New York City 2.jpg",
    "medieval": "File:Old Town Square - panorama.jpg",
    "kyoto": "File:Yasaka-dori early morning with street lanterns and the Tower of Yasaka (Hokan-ji Temple), Kyoto, Japan.jpg",
    "fuji": "File:Hirano, Yamanakako, Minamitsuru District, Yamanashi Prefecture 401-0502, Japan - panoramio (78).jpg",
    "lake": "File:Moraine Lake panorama.jpg",
    "coast": "File:Palm tree and pier. Eriyadu, Maldives.jpg",
    "forest": "File:Forest sunrise.jpg",
}


def plain(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = "DigitalWindow/1.3 original-photo attribution downloader"
    entries = []
    for scene_id, title in SOURCES.items():
        response = session.get(
            "https://commons.wikimedia.org/w/api.php",
            params={"action": "query", "format": "json", "titles": title,
                    "prop": "imageinfo", "iiprop": "url|size|extmetadata|metadata"},
            timeout=40,
        )
        response.raise_for_status()
        page = next(iter(response.json()["query"]["pages"].values()))
        info = page["imageinfo"][0]
        metadata = info.get("extmetadata", {})
        field = lambda key: plain(metadata.get(key, {}).get("value", ""))
        target = DESTINATION / f"{scene_id}.jpg"
        # The Fuji original was already downloaded for the previous release.
        cached = ROOT / "assets" / "references" / "fuji-hirano-day-panorama.jpg"
        if scene_id == "fuji" and not target.exists() and cached.exists():
            shutil.copyfile(cached, target)
        if not target.exists():
            original = session.get(info["url"], timeout=120)
            for attempt in range(3):
                if original.status_code != 429:
                    break
                time.sleep(5 * (attempt + 1))
                original = session.get(info["url"], timeout=120)
            original.raise_for_status()
            target.write_bytes(original.content)
        with Image.open(target) as image:
            image.verify()
        with Image.open(target) as image:
            width, height = image.size
        assert [width, height] == [info["width"], info["height"]], "Native resolution mismatch"
        entries.append({
            "id": scene_id,
            "file": str(target.relative_to(ROOT)).replace("\\", "/"),
            "title": title.removeprefix("File:"),
            "author": field("Artist"),
            "license": field("LicenseShortName"),
            "licenseUrl": field("LicenseUrl"),
            "sourceUrl": info["descriptionurl"],
            "originalUrl": info["url"].split("?")[0],
            "nativeDimensions": {"width": width, "height": height},
            "description": field("ImageDescription"),
            "dateTimeOriginal": field("DateTimeOriginal"),
            "gpsLatitude": field("GPSLatitude"),
            "gpsLongitude": field("GPSLongitude"),
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "bytes": target.stat().st_size,
            "modifications": "Original downloaded bytes; no AI generation, upscaling, pixel editing, or resampling. Application crops to fill the display and applies optional continuous lighting at runtime.",
        })
        print(f"{scene_id}: {width} x {height}, {field('LicenseShortName')}, {target.stat().st_size} bytes", flush=True)
        (DESTINATION / "sources.json").write_text(json.dumps({
            "schemaVersion": 1, "retrievedDate": "2026-11-12", "kind": "original-photography",
            "images": entries,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
