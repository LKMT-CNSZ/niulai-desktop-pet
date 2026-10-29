"""Generate a continuous child-Niulai mesh from the approved turnaround.

The script first extracts the front/left/back panels into aligned transparent
inputs and can then run the locally cached Hunyuan3D-2mv checkpoint.  No model
download is required when the project-local checkpoint is present.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TURNAROUND = PROJECT_ROOT / "assets" / "concepts" / "niulai-child-turnaround-v1.png"
INPUT_DIR = PROJECT_ROOT / ".tools" / "niulai-child-multiview-inputs"
OUTPUT = PROJECT_ROOT / ".tools" / "results" / "niulai-child-reconstructed.glb"
HUNYUAN_ROOT = PROJECT_ROOT / ".tools" / "Hunyuan3D-2"
MODEL_ROOT = PROJECT_ROOT / ".tools" / "hy3d-models" / "tencent" / "Hunyuan3D-2mv"

# Pixel boxes in the approved 1624x969 turnaround.  They deliberately include
# a little neutral margin so silhouette extraction never clips ears or hooves.
PANEL_BOXES = {
    "front": (12, 34, 562, 920),
    "left": (585, 34, 1034, 920),
    "back": (1035, 34, 1598, 920),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the child Niulai multiview mesh")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--octree-resolution", type=int, default=380)
    parser.add_argument("--seed", type=int, default=24680)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    return parser.parse_args()


def largest_component(mask: np.ndarray) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        raise RuntimeError("No character silhouette was found in turnaround panel")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    component = np.where(labels == largest, 255, 0).astype(np.uint8)

    # Fill only the largest external silhouette.  Using a border flood-fill is
    # unsafe here because the studio ground line can enclose most of a panel.
    contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    filled = np.zeros_like(component)
    cv2.drawContours(filled, [contour], -1, 255, thickness=cv2.FILLED)
    return filled


def extract_panel(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    rgb = np.asarray(source.crop(box).convert("RGB"))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)

    # The reference has a saturation of roughly 0-5 on the neutral studio
    # backdrop and 40-230 on every character material.  A saturation mask also
    # avoids selecting the dark neutral ground line.
    raw_mask = np.where(hsv[:, :, 1] > 24, 255, 0).astype(np.uint8)
    raw_mask = cv2.morphologyEx(
        raw_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)),
        iterations=2,
    )
    alpha = largest_component(raw_mask)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)

    ys, xs = np.where(alpha > 8)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    rgba = np.dstack([rgb, alpha])[y0:y1, x0:x1]

    # All views use the same 1024 canvas, top margin and ground line.  Scaling
    # by height keeps the three Hunyuan inputs metrically consistent.
    target_height = 900
    scale = target_height / rgba.shape[0]
    target_width = max(1, round(rgba.shape[1] * scale))
    resized = cv2.resize(rgba, (target_width, target_height), interpolation=cv2.INTER_LANCZOS4)
    canvas = np.zeros((1024, 1024, 4), dtype=np.uint8)
    left = (1024 - target_width) // 2
    top = 62
    canvas[top : top + target_height, left : left + target_width] = resized
    return Image.fromarray(canvas, "RGBA")


def prepare_inputs() -> dict[str, Image.Image]:
    if not TURNAROUND.exists():
        raise FileNotFoundError(TURNAROUND)
    source = Image.open(TURNAROUND).convert("RGB")
    if source.size != (1624, 969):
        raise RuntimeError(f"Unexpected turnaround size: {source.size}")
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    images: dict[str, Image.Image] = {}
    for view, box in PANEL_BOXES.items():
        image = extract_panel(source, box)
        image.save(INPUT_DIR / f"{view}.png")
        images[view] = image
    return images


def generate_mesh(images: dict[str, Image.Image], args: argparse.Namespace) -> None:
    checkpoint = MODEL_ROOT / "hunyuan3d-dit-v2-mv" / "model.fp16.safetensors"
    if not checkpoint.exists():
        raise FileNotFoundError(f"Local Hunyuan checkpoint is missing: {checkpoint}")
    sys.path.insert(0, str(HUNYUAN_ROOT))
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        str(MODEL_ROOT),
        subfolder="hunyuan3d-dit-v2-mv",
        variant="fp16",
    )
    started = time.time()
    mesh = pipeline(
        image=images,
        num_inference_steps=args.steps,
        octree_resolution=args.octree_resolution,
        num_chunks=20000,
        generator=torch.Generator(device="cuda").manual_seed(args.seed),
        output_type="trimesh",
    )[0]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(args.output)
    print(
        f"Saved {args.output} in {time.time() - started:.1f}s; "
        f"vertices={len(mesh.vertices):,}, faces={len(mesh.faces):,}"
    )


def main() -> None:
    args = parse_args()
    images = prepare_inputs()
    print(f"Prepared multiview inputs in {INPUT_DIR}")
    if not args.prepare_only:
        generate_mesh(images, args)


if __name__ == "__main__":
    main()
