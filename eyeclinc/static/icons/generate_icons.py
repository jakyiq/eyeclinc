#!/usr/bin/env python3
"""
generate_icons.py
─────────────────
Run this ONCE to generate the PWA icons.
It creates two PNG files in static/icons/.

Usage:
    python generate_icons.py

Requires: Pillow
    pip install Pillow
"""

import os
import struct
import zlib

ICONS_DIR = os.path.join(os.path.dirname(__file__), "static", "icons")
os.makedirs(ICONS_DIR, exist_ok=True)


def make_icon_png(size: int, output_path: str):
    """
    Generate a simple PNG icon: navy background + white eye SVG-inspired shape.
    Pure Python — no external dependencies except stdlib + a tiny PNG writer.
    Uses Pillow if available, falls back to a minimal raw PNG.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
        img  = Image.new("RGBA", (size, size), (30, 58, 95, 255))   # navy
        draw = ImageDraw.Draw(img)

        # Rounded rectangle background (slightly lighter)
        r = size // 8
        draw.rounded_rectangle([0, 0, size-1, size-1], radius=r,
                                fill=(30, 58, 95, 255))

        # Draw a simple eye shape in white
        cx, cy = size // 2, size // 2
        ew = int(size * 0.55)   # eye width
        eh = int(size * 0.28)   # eye height

        # Outer eye
        draw.ellipse([cx - ew//2, cy - eh//2, cx + ew//2, cy + eh//2],
                     fill=(255, 255, 255, 255))
        # Pupil (navy)
        pr = int(size * 0.12)
        draw.ellipse([cx - pr, cy - pr, cx + pr, cy + pr],
                     fill=(30, 58, 95, 255))
        # Highlight
        hr = int(size * 0.04)
        draw.ellipse([cx - pr//2 - hr, cy - pr//2 - hr,
                      cx - pr//2 + hr, cy - pr//2 + hr],
                     fill=(255, 255, 255, 255))

        img.save(output_path, "PNG")
        print(f"✓ Generated {output_path} ({size}×{size})")

    except ImportError:
        # Pillow not available — write a minimal 1×1 navy PNG scaled up
        # This is a valid PNG but very basic — install Pillow for proper icons
        _write_minimal_png(size, output_path)
        print(f"✓ Generated minimal {output_path} ({size}×{size}) — install Pillow for better icons")


def _write_minimal_png(size: int, path: str):
    """Write a solid-color PNG without Pillow using raw PNG chunks."""
    width = height = size
    # Navy color: R=30 G=58 B=95
    row   = b'\x00' + bytes([30, 58, 95] * width)   # filter byte + RGB pixels
    raw   = row * height
    idat  = zlib.compress(raw)

    def chunk(name: bytes, data: bytes) -> bytes:
        c    = name + data
        crc  = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    sig   = b'\x89PNG\r\n\x1a\n'
    ihdr  = chunk(b'IHDR', struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    idat_ = chunk(b'IDAT', idat)
    iend  = chunk(b'IEND', b'')

    with open(path, 'wb') as f:
        f.write(sig + ihdr + idat_ + iend)


if __name__ == "__main__":
    make_icon_png(192, os.path.join(ICONS_DIR, "icon-192.png"))
    make_icon_png(512, os.path.join(ICONS_DIR, "icon-512.png"))
    print("\nDone. Icons saved to static/icons/")
    print("Add these to your project and deploy.")
