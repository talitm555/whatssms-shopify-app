#!/usr/bin/env python3
"""Partial redaction for listing screenshot3 — blur middle segments only (IDs + phone)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

SCREENSHOT = Path(__file__).resolve().parent / "screenshot3.png"

# Light Shopify body text (~ sum(RGB) 740–765); threshold below background for stroke detection.
INK_THRESH = 752

MAIN_X0, MAIN_X1 = 520, 1220


def merged_ink_rows(
    img: Image.Image,
    y0: int,
    y1: int,
    x0: int,
    x1: int,
    *,
    gap: int = 14,
    thresh: int = INK_THRESH,
):
    rw = x1 - x0
    col_dark: list[int] = []
    for dx in range(rw):
        x = x0 + dx
        m = max(
            1 if sum(img.getpixel((x, y))) < thresh else 0 for y in range(y0, y1)
        )
        col_dark.append(m)

    segs: list[list[int]] = []
    i = 0
    while i < rw:
        if col_dark[i]:
            j = i
            while j < rw and col_dark[j]:
                j += 1
            segs.append([x0 + i, x0 + j - 1])
            i = j
        else:
            i += 1

    merged: list[list[int]] = []
    for s in segs:
        if not merged:
            merged.append(s)
        elif s[0] - merged[-1][1] <= gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return merged


def ink_density(img: Image.Image, x0: int, y0: int, x1: int, y1: int) -> int:
    return sum(
        1
        for yy in range(y0, y1)
        for xx in range(x0, x1 + 1)
        if sum(img.getpixel((xx, yy))) < INK_THRESH
    )


def find_whatsapp_band(img: Image.Image) -> tuple[int, int, int, int, int] | None:
    """Returns (y0, y1, xa, xb, width) for the widest ink band in main column."""
    best: tuple[int, int, int, int, int] | None = None
    for y0 in range(260, 560, 2):
        y1 = y0 + 18
        merged = merged_ink_rows(img, y0, y1, MAIN_X0, MAIN_X1)
        for a, b in merged:
            w = b - a + 1
            if w > 280:
                if best is None or w > best[4]:
                    best = (y0, y1, a, b, w)
    return best


def find_sms_gateway_band(
    img: Image.Image, whatsapp_y0: int
) -> tuple[int, int, int, int, int] | None:
    """Narrow hex/ID row above WhatsApp dropdown (same card)."""
    sms_best: tuple[int, int, int, int, int, int] | None = None
    top_limit = max(220, whatsapp_y0 - 115)
    for y0 in range(top_limit, whatsapp_y0 - 8, 2):
        y1 = y0 + 14
        merged = merged_ink_rows(img, y0, y1, MAIN_X0, MAIN_X1)
        for a, b in merged:
            w = b - a + 1
            # Gateway ID line is a short ink span inside the input (not the full dropdown row).
            if 65 <= w <= 145 and a >= 526:
                dens = ink_density(img, a, y0, b, y1 - 1)
                cand = (y0, y1, a, b, w, dens)
                if sms_best is None or dens > sms_best[5]:
                    sms_best = cand
    return sms_best[:5] if sms_best else None


def blur_rect(img: Image.Image, box: tuple[int, int, int, int], radius: int = 10) -> None:
    x0, y0, x1, y1 = box
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(img.size[0], x1)
    y1 = min(img.size[1], y1)
    if x1 <= x0 or y1 <= y0:
        return
    crop = img.crop((x0, y0, x1, y1))
    img.paste(crop.filter(ImageFilter.GaussianBlur(radius=radius)), (x0, y0))


def main() -> None:
    img = Image.open(SCREENSHOT).convert("RGB")

    wa = find_whatsapp_band(img)
    if wa is None:
        raise SystemExit(
            "Could not locate WhatsApp row for redaction — check screenshot layout."
        )
    wy0, wy1, wax, wbx, ww = wa

    sms = find_sms_gateway_band(img, wy0)
    if sms is None:
        raise SystemExit(
            "Could not locate SMS Gateway ID row — check screenshot layout."
        )

    sy0, sy1, sax, sbx, sw = sms
    # Obscure the middle ~55% of the gateway ID (leave ends readable).
    inner = max(28, int(sw * 0.55))
    scx = (sax + sbx) // 2
    sms_x0 = max(MAIN_X0 + 4, scx - inner // 2)
    sms_x1 = min(MAIN_X1 - 4, sms_x0 + inner)

    vy0 = max(0, sy0 - 4)
    vy1 = min(img.size[1], sy1 + 6)
    blur_rect(img, (sms_x0, vy0, sms_x1, vy1))

    xa, xb = wax, wbx
    seg_w = xb - xa + 1
    wy_pad0 = max(0, wy0 - 4)
    wy_pad1 = min(img.size[1], wy1 + 6)

    phone_x0 = xa + int(seg_w * 0.07)
    phone_x1 = xa + int(seg_w * 0.28)
    blur_rect(img, (phone_x0, wy_pad0, phone_x1, wy_pad1))

    id_x0 = xa + int(seg_w * 0.40)
    id_x1 = xa + int(seg_w * 0.74)
    blur_rect(img, (id_x0, wy_pad0, id_x1, wy_pad1))

    img.save(SCREENSHOT, "PNG", compress_level=6)
    print(f"Updated {SCREENSHOT}")


if __name__ == "__main__":
    main()
