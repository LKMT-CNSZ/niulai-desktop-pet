from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "artifacts" / "minecraft-skin"
SKIN_PATH = OUT_DIR / "牛来-Minecraft皮肤-PCL.png"
PREVIEW_PATH = OUT_DIR / "牛来-Minecraft皮肤-预览.png"


ORANGE = (218, 112, 22, 255)
ORANGE_LIGHT = (237, 139, 34, 255)
ORANGE_HIGHLIGHT = (247, 158, 48, 255)
ORANGE_DARK = (164, 67, 12, 255)
ORANGE_SHADOW = (188, 78, 13, 255)
CREAM = (242, 211, 150, 255)
CREAM_LIGHT = (255, 232, 180, 255)
CREAM_SHADOW = (205, 166, 104, 255)
BROWN = (91, 42, 19, 255)
BLACK = (35, 24, 17, 255)
WHITE = (247, 240, 218, 255)
TRANSPARENT = (0, 0, 0, 0)


skin = Image.new("RGBA", (64, 64), TRANSPARENT)
draw = ImageDraw.Draw(skin)


def rect(x, y, w, h, color):
    draw.rectangle((x, y, x + w - 1, y + h - 1), fill=color)


def fur_face(x, y, w, h, base, light=ORANGE_LIGHT, dark=ORANGE_SHADOW):
    """Fill one UV face with restrained, deterministic one-pixel fur variation."""
    rect(x, y, w, h, base)
    for py in range(y, y + h):
        for px in range(x, x + w):
            value = (px * 17 + py * 29 + px * py * 3) % 23
            if value == 0:
                draw.point((px, py), fill=light)
            elif value == 1:
                draw.point((px, py), fill=dark)


def cuboid_base(top, bottom, side_a, front, side_b, back):
    fur_face(*top, ORANGE_LIGHT, ORANGE_HIGHLIGHT, ORANGE)
    fur_face(*bottom, ORANGE_DARK, ORANGE_SHADOW, BROWN)
    fur_face(*side_a, ORANGE_SHADOW, ORANGE, ORANGE_DARK)
    fur_face(*front, ORANGE, ORANGE_LIGHT, ORANGE_SHADOW)
    fur_face(*side_b, ORANGE_SHADOW, ORANGE, ORANGE_DARK)
    fur_face(*back, ORANGE_SHADOW, ORANGE, ORANGE_DARK)


# Opaque base layer: classic/Steve 4-pixel arms, Java 64x64 skin layout.
cuboid_base((8, 0, 8, 8), (16, 0, 8, 8), (0, 8, 8, 8),
             (8, 8, 8, 8), (16, 8, 8, 8), (24, 8, 8, 8))
cuboid_base((20, 16, 8, 4), (28, 16, 8, 4), (16, 20, 4, 12),
             (20, 20, 8, 12), (28, 20, 4, 12), (32, 20, 8, 12))
cuboid_base((44, 16, 4, 4), (48, 16, 4, 4), (40, 20, 4, 12),
             (44, 20, 4, 12), (48, 20, 4, 12), (52, 20, 4, 12))
cuboid_base((4, 16, 4, 4), (8, 16, 4, 4), (0, 20, 4, 12),
             (4, 20, 4, 12), (8, 20, 4, 12), (12, 20, 4, 12))
cuboid_base((36, 48, 4, 4), (40, 48, 4, 4), (32, 52, 4, 12),
             (36, 52, 4, 12), (40, 52, 4, 12), (44, 52, 4, 12))
cuboid_base((20, 48, 4, 4), (24, 48, 4, 4), (16, 52, 4, 12),
             (20, 52, 4, 12), (24, 52, 4, 12), (28, 52, 4, 12))


# Face: 牛来的粗眉、白眼、棕色瞳孔和奶油色方口鼻。
rect(9, 9, 3, 1, BLACK)
rect(13, 9, 3, 1, BLACK)
rect(9, 10, 3, 2, WHITE)
rect(13, 10, 3, 2, WHITE)
draw.point((11, 11), fill=BROWN)
draw.point((14, 11), fill=BROWN)
rect(9, 12, 7, 4, CREAM)
rect(10, 12, 5, 1, CREAM_LIGHT)
draw.point((10, 13), fill=BROWN)
draw.point((14, 13), fill=BROWN)
rect(11, 15, 4, 1, CREAM_SHADOW)
rect(12, 15, 2, 1, BROWN)

# Head sides/back: warm ear interiors and a darker nape.
rect(1, 10, 4, 3, ORANGE_DARK)
rect(2, 11, 3, 1, CREAM_SHADOW)
rect(19, 10, 4, 3, ORANGE_DARK)
rect(19, 11, 3, 1, CREAM_SHADOW)
rect(24, 14, 8, 2, ORANGE_DARK)

# Rounded lighter belly on the base torso.
belly_rows = {
    22: (23, 4), 23: (22, 6), 24: (21, 7), 25: (21, 7),
    26: (21, 7), 27: (21, 7), 28: (21, 7), 29: (22, 6),
    30: (23, 4),
}
for py, (px, width) in belly_rows.items():
    rect(px, py, width, 1, ORANGE_LIGHT if py not in (29, 30) else ORANGE_SHADOW)
draw.point((24, 23), fill=ORANGE_HIGHLIGHT)
draw.point((26, 26), fill=ORANGE_HIGHLIGHT)


def add_hand(front_x, side_a_x, side_b_x, back_x, y=20):
    for x in (side_a_x, front_x, side_b_x, back_x):
        rect(x, y + 9, 4, 3, CREAM)
        rect(x, y + 11, 4, 1, CREAM_SHADOW)
    rect(front_x + 1, y + 10, 1, 2, CREAM_LIGHT)
    rect(front_x + 2, y + 10, 1, 2, CREAM_LIGHT)
    draw.point((front_x + 2, y + 11), fill=BROWN)


add_hand(44, 40, 48, 52)
add_hand(36, 32, 40, 44, 52)


def add_hoof(front_x, side_a_x, side_b_x, back_x, y):
    for x in (side_a_x, front_x, side_b_x, back_x):
        rect(x, y + 9, 4, 3, CREAM)
        rect(x, y + 11, 4, 1, CREAM_SHADOW)
    draw.point((front_x + 1, y + 10), fill=CREAM_LIGHT)
    draw.point((front_x + 2, y + 10), fill=CREAM_LIGHT)
    draw.point((front_x + 1, y + 11), fill=BROWN)
    draw.point((front_x + 2, y + 11), fill=BROWN)


add_hoof(4, 0, 8, 12, 20)
add_hoof(20, 16, 24, 28, 52)

# A subtle dark divide between the two legs when viewed from the front.
rect(7, 20, 1, 9, ORANGE_DARK)
rect(23, 52, 1, 9, ORANGE_DARK)


# Outer head layer: ears/horn highlights and slightly raised signature features.
rect(33, 9, 5, 4, ORANGE_DARK)
rect(34, 10, 4, 2, CREAM_SHADOW)
rect(50, 9, 5, 4, ORANGE_DARK)
rect(50, 10, 4, 2, CREAM_SHADOW)
rect(40, 8, 2, 2, CREAM_LIGHT)
rect(46, 8, 2, 2, CREAM_LIGHT)
rect(41, 9, 3, 1, BLACK)
rect(45, 9, 3, 1, BLACK)
rect(41, 12, 7, 4, CREAM)
rect(42, 12, 5, 1, CREAM_LIGHT)
draw.point((42, 13), fill=BROWN)
draw.point((46, 13), fill=BROWN)
rect(43, 15, 3, 1, BROWN)
rect(40, 1, 2, 2, CREAM_LIGHT)
rect(46, 1, 2, 2, CREAM_LIGHT)

# Torso outer layer: raised belly, back tail with cream tuft.
outer_belly = {
    37: (23, 4), 38: (22, 6), 39: (21, 7), 40: (21, 7),
    41: (21, 7), 42: (21, 7), 43: (21, 7), 44: (22, 6),
    45: (23, 4),
}
for py, (px, width) in outer_belly.items():
    tone = ORANGE_HIGHLIGHT if py < 42 else ORANGE_LIGHT
    rect(px, py, width, 1, tone)
draw.point((23, 38), fill=(255, 177, 59, 255))
rect(35, 38, 2, 7, ORANGE_DARK)
rect(34, 44, 4, 2, ORANGE)
rect(34, 46, 4, 2, CREAM)
draw.point((35, 47), fill=CREAM_SHADOW)
draw.point((36, 47), fill=CREAM_SHADOW)

# Small outer-layer highlights on hands and hooves.
rect(44, 46, 4, 2, CREAM_LIGHT)
rect(52, 46, 4, 2, CREAM_LIGHT)
rect(36, 62, 4, 2, CREAM_LIGHT)
rect(52, 62, 4, 2, CREAM_LIGHT)
rect(4, 46, 4, 2, CREAM_LIGHT)
rect(20, 62, 4, 2, CREAM_LIGHT)


def crop(box):
    return skin.crop(box)


def layer(base_box, overlay_box):
    out = crop(base_box)
    out.alpha_composite(crop(overlay_box))
    return out


def make_flat_model(back=False):
    canvas = Image.new("RGBA", (20, 32), TRANSPARENT)
    if not back:
        head = layer((8, 8, 16, 16), (40, 8, 48, 16))
        torso = layer((20, 20, 28, 32), (20, 36, 28, 48))
        r_arm = layer((44, 20, 48, 32), (44, 36, 48, 48))
        l_arm = layer((36, 52, 40, 64), (52, 52, 56, 64))
        r_leg = layer((4, 20, 8, 32), (4, 36, 8, 48))
        l_leg = layer((20, 52, 24, 64), (4, 52, 8, 64))
    else:
        head = layer((24, 8, 32, 16), (56, 8, 64, 16))
        torso = layer((32, 20, 40, 32), (32, 36, 40, 48))
        r_arm = layer((52, 20, 56, 32), (52, 36, 56, 48))
        l_arm = layer((44, 52, 48, 64), (60, 52, 64, 64))
        r_leg = layer((12, 20, 16, 32), (12, 36, 16, 48))
        l_leg = layer((28, 52, 32, 64), (12, 52, 16, 64))
    canvas.alpha_composite(head, (6, 0))
    canvas.alpha_composite(torso, (6, 8))
    canvas.alpha_composite(r_arm, (2, 8))
    canvas.alpha_composite(l_arm, (14, 8))
    canvas.alpha_composite(r_leg, (6, 20))
    canvas.alpha_composite(l_leg, (10, 20))
    return canvas


OUT_DIR.mkdir(parents=True, exist_ok=True)
skin.save(SKIN_PATH, optimize=False)

# Nearest-neighbour inspection sheet (not for importing).
preview = Image.new("RGBA", (1200, 720), (241, 232, 214, 255))
pd = ImageDraw.Draw(preview)
pd.rounded_rectangle((35, 35, 1165, 685), radius=28, fill=(250, 246, 237, 255), outline=(214, 187, 145, 255), width=3)
front = make_flat_model(False).resize((300, 480), Image.Resampling.NEAREST)
back = make_flat_model(True).resize((300, 480), Image.Resampling.NEAREST)
preview.alpha_composite(front, (80, 125))
preview.alpha_composite(back, (410, 125))
texture = skin.resize((384, 384), Image.Resampling.NEAREST)
preview.alpha_composite(texture, (765, 160))
pd.text((180, 75), "FRONT", fill=(91, 42, 19, 255), anchor="mm", stroke_width=0)
pd.text((510, 75), "BACK", fill=(91, 42, 19, 255), anchor="mm", stroke_width=0)
pd.text((957, 75), "64 x 64 JAVA SKIN", fill=(91, 42, 19, 255), anchor="mm", stroke_width=0)
pd.text((600, 650), "NIULAI  |  CLASSIC 4px ARMS  |  PCL READY", fill=(134, 75, 31, 255), anchor="mm")
preview.save(PREVIEW_PATH)

print(SKIN_PATH)
print(PREVIEW_PATH)
