#!/usr/bin/env python3
"""Resize screenshot1.png … screenshot6.png to exactly 1600×900 using Lanczos.

If the source aspect ratio differs from 16∶9, the image is uniformly scaled to
fit inside the canvas (no stretching) and centered on a white background."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SCREEN_DIR = Path(__file__).resolve().parent
TARGET_W, TARGET_H = 1600, 900
PAD = (255, 255, 255)


def resize_contain(im: Image.Image, target_w: int, target_h: int) -> Image.Image:
    iw, ih = im.size
    scale = min(target_w / iw, target_h / ih)
    nw = max(1, round(iw * scale))
    nh = max(1, round(ih * scale))
    out = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (target_w, target_h), PAD)
    ox = (target_w - nw) // 2
    oy = (target_h - nh) // 2
    if out.mode in ("RGBA", "P"):
        out = out.convert("RGB")
    canvas.paste(out, (ox, oy))
    return canvas


def main() -> None:
    for i in range(1, 7):
        path = SCREEN_DIR / f"screenshot{i}.png"
        if not path.exists():
            raise SystemExit(f"Missing {path.name}")
        img = Image.open(path)
        out = resize_contain(img, TARGET_W, TARGET_H)
        out.save(path, "PNG", compress_level=6)
        print(f"{path.name}: {img.size} → {out.size}")


if __name__ == "__main__":
    main()
