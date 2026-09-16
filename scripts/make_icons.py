"""Generates Metakai app icons: three concentric activity rings on black."""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "app" / "assets"
SS = 4  # supersampling for smooth arcs

RED = (255, 69, 58, 255)
WHITE = (255, 255, 255, 255)
GREY = (120, 120, 128, 255)
TRACK = (38, 38, 42, 255)


def rings(size: int, scale: float, colors, track=True, bg=None) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s / 2
    outer = s * 0.36 * scale
    stroke = outer * 0.2
    gap = stroke * 1.25
    sweeps = [300, 250, 200]
    for i, (color, sweep) in enumerate(zip(colors, sweeps)):
        r = outer - i * gap
        box = [c - r, c - r, c + r, c + r]
        if track:
            d.arc(box, 0, 360, fill=TRACK, width=int(stroke))
        start = -90
        end = start + sweep
        d.arc(box, start, end, fill=color, width=int(stroke))
        # round caps
        import math
        for ang in (start, end):
            a = math.radians(ang)
            mid = r - stroke / 2
            x, y = c + mid * math.cos(a), c + mid * math.sin(a)
            d.ellipse([x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2], fill=color)
    return img.resize((size, size), Image.LANCZOS)


def main():
    black = (0, 0, 0, 255)
    rings(1024, 1.0, [RED, WHITE, GREY], bg=black).save(ASSETS / "icon.png")
    rings(1024, 0.72, [RED, WHITE, GREY]).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGBA", (1024, 1024), black).save(ASSETS / "android-icon-background.png")
    rings(1024, 0.72, [WHITE, WHITE, WHITE], track=False).save(ASSETS / "android-icon-monochrome.png")
    rings(512, 1.0, [RED, WHITE, GREY], track=True).save(ASSETS / "splash-icon.png")
    rings(96, 1.0, [RED, WHITE, GREY], bg=black).save(ASSETS / "favicon.png")


if __name__ == "__main__":
    main()
