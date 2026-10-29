from pathlib import Path

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT_ROOT / "build" / "icon-bull-market-v1.png"
PNG_OUTPUT = PROJECT_ROOT / "build" / "icon.png"
ICO_OUTPUT = PROJECT_ROOT / "build" / "icon.ico"


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")

    # 图像生成器会在圆角图标外留下近黑色方角。只从四角做连通填充，
    # 因此不会碰到金色边框以内的深蓝背景。
    draw = ImageDraw.Draw(image)
    corners = [
        (0, 0),
        (image.width - 1, 0),
        (0, image.height - 1),
        (image.width - 1, image.height - 1),
    ]
    for corner in corners:
        ImageDraw.floodfill(image, corner, (0, 0, 0, 0), thresh=20)

    resampling = getattr(Image, "Resampling", Image).LANCZOS
    icon_512 = image.resize((512, 512), resampling)
    icon_512.save(PNG_OUTPUT, format="PNG", optimize=True)
    icon_512.save(
        ICO_OUTPUT,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"PNG: {PNG_OUTPUT}")
    print(f"ICO: {ICO_OUTPUT}")


if __name__ == "__main__":
    main()
