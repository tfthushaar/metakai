"""Generates store graphics into store/assets.

    python scripts/make_store_assets.py <folder of raw 1080x2400 phone screenshots>

Screenshots are matched by file name prefix (1-today.png, 2-progress.png, ...) to the captions below.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from make_icons import GREY, RED, WHITE, rings

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store" / "assets"
FONTS = ROOT / "app" / "node_modules" / "@expo-google-fonts" / "inter"
BOLD = FONTS / "700Bold" / "Inter_700Bold.ttf"
MEDIUM = FONTS / "500Medium" / "Inter_500Medium.ttf"

BLACK = (0, 0, 0)
MUTED = (152, 152, 159)
BORDER = (44, 44, 46)

CAPTIONS = {
    "1": ("Your day at a glance", "Calories, weight trend, readiness and training"),
    "2": ("See where you're heading", "Trend weight, goal date and weekly change"),
    "3": ("Rank every muscle group", "Strength and consistency against people like you"),
    "4": ("Train with a plan", "Splits, fast logging, GPS runs and history"),
    "5": ("Know what to adjust", "Weekly check-ins with measured maintenance"),
    "6": ("Earn and share badges", "Achievements across food, training and running"),
}

# Size, caption area and screenshot width for each store.
TARGETS = {
    "play": {"size": (1080, 1920), "title": 70, "sub": 36, "top": 120, "shot_y": 380, "shot_w": 860, "radius": 52},
    "appstore": {"size": (1320, 2868), "title": 92, "sub": 46, "top": 190, "shot_y": 560, "shot_w": 1110, "radius": 70},
}

# Raw captures include the Android status and gesture bars; crop them away.
CROP_TOP, CROP_BOTTOM = 96, 40


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius, fill=255)
    out = Image.new("RGBA", img.size)
    out.paste(img, (0, 0), mask)
    return out


def centered(draw: ImageDraw.ImageDraw, width: int, y: int, text: str, font, fill):
    w = draw.textlength(text, font=font)
    draw.text(((width - w) / 2, y), text, font=font, fill=fill)


def screenshot(raw: Path, key: str, store: str):
    t = TARGETS[store]
    W, H = t["size"]
    canvas = Image.new("RGB", (W, H), BLACK)
    draw = ImageDraw.Draw(canvas)
    title, sub = CAPTIONS[key]
    centered(draw, W, t["top"], title, ImageFont.truetype(str(BOLD), t["title"]), WHITE[:3])
    centered(draw, W, t["top"] + int(t["title"] * 1.35), sub, ImageFont.truetype(str(MEDIUM), t["sub"]), MUTED)

    shot = Image.open(raw).convert("RGB")
    shot = shot.crop((0, CROP_TOP, shot.width, shot.height - CROP_BOTTOM))
    w = t["shot_w"]
    h = round(shot.height * w / shot.width)
    shot = rounded(shot.resize((w, h), Image.LANCZOS), t["radius"])
    x = (W - w) // 2
    border = Image.new("RGBA", (w + 6, h + 6))
    ImageDraw.Draw(border).rounded_rectangle([0, 0, w + 5, h + 5], t["radius"] + 3, outline=BORDER, width=3)
    canvas.paste(border, (x - 3, t["shot_y"] - 3), border)
    canvas.paste(shot, (x, t["shot_y"]), shot)
    return canvas


def feature_graphic():
    W, H = 1024, 500
    img = Image.new("RGB", (W, H), BLACK)
    logo = rings(300, 1.0, [RED, WHITE, GREY])
    img.paste(logo, (70, (H - 300) // 2), logo)
    draw = ImageDraw.Draw(img)
    draw.text((410, 158), "Metakai", font=ImageFont.truetype(str(BOLD), 96), fill=WHITE[:3])
    body = ImageFont.truetype(str(MEDIUM), 34)
    draw.text((414, 284), "Food, training and progress.", font=body, fill=MUTED)
    draw.text((414, 330), "Private by design.", font=body, fill=MUTED)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rings(512, 1.0, [RED, WHITE, GREY], bg=(0, 0, 0, 255)).save(OUT / "play-icon-512.png")
    feature_graphic().save(OUT / "play-feature-graphic.png")
    if len(sys.argv) > 1:
        for raw in sorted(Path(sys.argv[1]).glob("*.png")):
            key = raw.name.split("-")[0]
            if key not in CAPTIONS:
                continue
            for store in TARGETS:
                screenshot(raw, key, store).save(OUT / f"{store}-{raw.stem}.png", optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
