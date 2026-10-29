import argparse
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
import trimesh
from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HUNYUAN_ROOT = PROJECT_ROOT / ".tools" / "Hunyuan3D-2"
TOOLS_ROOT = PROJECT_ROOT / ".tools"
HF_CACHE = TOOLS_ROOT / "hf-cache"
INPUTS_DIR = TOOLS_ROOT / "bull-multiview-inputs"

os.environ.setdefault("HF_HOME", str(HF_CACHE))
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HY3DGEN_MODELS", str(TOOLS_ROOT / "hy3d-models"))
sys.path.insert(0, str(HUNYUAN_ROOT))

from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline


DEFAULT_REFERENCE = Path(
    "C:/Users/Ray/Documents/xwechat_files/"
    "wxid_vavlwqsimvon21_d937/temp/RWTemp/2026-08/"
    "9e20f478899dc29eb19741386f9343c8/"
    "f3d82dd7b2c18a18ffb25a8a622fc174.jpg"
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate the desktop bull GLB from the supplied three-view reference."
    )
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE)
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "assets" / "models" / "bull.glb",
    )
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--resolution", type=int, default=380)
    parser.add_argument("--seed", type=int, default=20260818)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--recolor-only", action="store_true")
    return parser.parse_args()


def crop_reference(reference):
    width, height = reference.size
    boxes = {
        "front": (0.025, 0.055, 0.36, 0.91),
        "left": (0.35, 0.055, 0.66, 0.91),
        "back": (0.64, 0.055, 0.995, 0.91),
    }
    return {
        name: reference.crop(
            (
                round(x0 * width),
                round(y0 * height),
                round(x1 * width),
                round(y1 * height),
            )
        )
        for name, (x0, y0, x1, y1) in boxes.items()
    }


def center_on_transparent_canvas(image, size=768, fill_ratio=0.9):
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Background removal produced an empty image.")
    subject = rgba.crop(bbox)
    max_side = max(subject.size)
    scale = size * fill_ratio / max_side
    resized = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    left = (size - resized.width) // 2
    top = (size - resized.height) // 2
    canvas.alpha_composite(resized, (left, top))
    return canvas


def remove_uniform_background(image):
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    height, width = rgb.shape[:2]
    border = max(4, round(min(width, height) * 0.025))
    border_pixels = np.concatenate(
        [
            rgb[:border].reshape(-1, 3),
            rgb[-border:].reshape(-1, 3),
            rgb[:, :border].reshape(-1, 3),
            rgb[:, -border:].reshape(-1, 3),
        ],
        axis=0,
    )
    background = np.median(border_pixels, axis=0)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    saturation = hsv[:, :, 1].astype(np.float32)
    value = hsv[:, :, 2].astype(np.float32)
    background_value = float(np.median(border_pixels.max(axis=1)))

    # The sheet background and floor shadows are pale and almost unsaturated;
    # the fur/skin is saturated while horns and hooves are distinctly darker.
    # Combining both cues removes the shadows without cutting off gray details.
    binary = (
        ((saturation > 16.0) & (distance > 9.0))
        | (value < background_value - 25.0)
    ).astype(np.uint8)
    binary[:border] = 0
    binary[-border:] = 0
    binary[:, :border] = 0
    binary[:, -border:] = 0
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
    floor_start = round(height * 0.85)
    floor_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 7))
    binary[floor_start:] = cv2.morphologyEx(
        binary[floor_start:], cv2.MORPH_OPEN, floor_kernel, iterations=1
    )

    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if component_count <= 1:
        raise RuntimeError("Could not isolate the character from the reference background.")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    subject = (labels == largest).astype(np.uint8) * 255
    subject = cv2.morphologyEx(subject, cv2.MORPH_CLOSE, kernel, iterations=1)

    # Restore enclosed bright details such as the eye whites after the color
    # threshold, while leaving open background gaps between limbs untouched.
    inverse = (subject == 0).astype(np.uint8)
    inverse_count, inverse_labels = cv2.connectedComponents(inverse, 8)
    border_labels = set(inverse_labels[0]) | set(inverse_labels[-1])
    border_labels |= set(inverse_labels[:, 0]) | set(inverse_labels[:, -1])
    for label in range(1, inverse_count):
        if label not in border_labels:
            subject[inverse_labels == label] = 255
    alpha = cv2.GaussianBlur(subject, (0, 0), 0.8)

    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, mode="RGBA")


def prepare_views(reference_path):
    reference = Image.open(reference_path).convert("RGB")
    raw_views = crop_reference(reference)
    prepared = {}
    INPUTS_DIR.mkdir(parents=True, exist_ok=True)

    for name, raw in raw_views.items():
        cutout = remove_uniform_background(raw)
        view = center_on_transparent_canvas(cutout)
        view.save(INPUTS_DIR / f"{name}.png")
        prepared[name] = view

    # Keep a mirrored right-side image for color projection/debugging, but feed
    # only the three real views to the shape model.  Hunyuan's official
    # multiview examples use front/left/back; a synthetic fourth view can create
    # doubled limbs when small pose differences are mirrored.
    ImageOps.mirror(prepared["left"]).save(INPUTS_DIR / "right.png")

    return prepared


def sample_rgba(image_array, u, v):
    height, width = image_array.shape[:2]
    x = np.clip(np.rint(u * (width - 1)).astype(np.int64), 0, width - 1)
    y = np.clip(np.rint(v * (height - 1)).astype(np.int64), 0, height - 1)
    return image_array[y, x]


def project_reference_colors(mesh, views):
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    center = (vertices.min(axis=0) + vertices.max(axis=0)) * 0.5
    height = max(vertices[:, 1].max() - vertices[:, 1].min(), 1e-6)
    scale = 0.9 / height

    front = np.asarray(views["front"], dtype=np.float32)
    back = np.asarray(views["back"], dtype=np.float32)
    left = np.asarray(views["left"], dtype=np.float32)
    right = left[:, ::-1].copy()

    # Hunyuan's output is Y-up with the character facing +Z.  The supplied
    # profile faces left, corresponding to a camera on the +X side.
    vertical = 0.5 - (vertices[:, 1] - center[1]) * scale
    front_u = 0.5 + (vertices[:, 0] - center[0]) * scale
    back_u = 0.5 - (vertices[:, 0] - center[0]) * scale
    left_u = 0.5 - (vertices[:, 2] - center[2]) * scale
    right_u = 0.5 + (vertices[:, 2] - center[2]) * scale

    samples = np.stack(
        [
            sample_rgba(front, front_u, vertical),
            sample_rgba(back, back_u, vertical),
            sample_rgba(left, left_u, vertical),
            sample_rgba(right, right_u, vertical),
        ],
        axis=1,
    )
    direction_weights = np.stack(
        [
            np.clip(normals[:, 2], 0, 1),
            np.clip(-normals[:, 2], 0, 1),
            np.clip(normals[:, 0], 0, 1),
            np.clip(-normals[:, 0], 0, 1),
        ],
        axis=1,
    )
    direction_weights = np.power(direction_weights + 0.035, 3.0)
    alpha_weights = samples[:, :, 3] / 255.0
    weights = direction_weights * alpha_weights
    weight_sum = weights.sum(axis=1, keepdims=True)

    fallback = np.array([184.0, 111.0, 46.0], dtype=np.float32)
    colors = np.full((len(vertices), 3), fallback, dtype=np.float32)
    valid = weight_sum[:, 0] > 1e-5
    colors[valid] = (
        samples[valid, :, :3] * weights[valid, :, None]
    ).sum(axis=1) / weight_sum[valid]
    colors = np.power(np.clip(colors, 0, 255) / 255.0, 0.82) * 255.0

    rgba = np.concatenate(
        [np.clip(colors, 0, 255), np.full((len(vertices), 1), 255.0)], axis=1
    ).astype(np.uint8)
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=rgba)


def orient_for_threejs(mesh):
    # Trimesh's glTF exporter performs the Z-up -> Y-up conversion required by
    # glTF/Three.js.  Applying a second conversion here would make the desktop
    # camera look down the character's vertical axis.
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()


def main():
    args = parse_args()
    if not args.reference.exists():
        raise FileNotFoundError(f"Reference image not found: {args.reference}")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for high-detail multiview generation.")

    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print("Preparing front, left and back views...")
    views = prepare_views(args.reference)
    if args.prepare_only:
        print(f"Saved prepared views to {INPUTS_DIR}")
        return
    if args.recolor_only:
        if not args.output.exists():
            raise FileNotFoundError(f"Mesh to recolor not found: {args.output}")
        mesh = trimesh.load(args.output, force="mesh")
        project_reference_colors(mesh, views)
        mesh.export(args.output, file_type="glb")
        print(f"Recolored existing mesh and saved {args.output}")
        return

    print("Loading Tencent Hunyuan3D multiview model...")
    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2mv",
        subfolder="hunyuan3d-dit-v2-mv",
        variant="fp16",
        use_safetensors=True,
        device="cuda",
    )

    print("Generating high-detail mesh...")
    mesh = pipeline(
        image=views,
        num_inference_steps=args.steps,
        octree_resolution=args.resolution,
        num_chunks=20000,
        generator=torch.Generator(device="cuda").manual_seed(args.seed),
        output_type="trimesh",
    )[0]

    if mesh is None or len(mesh.vertices) == 0:
        raise RuntimeError("Hunyuan3D returned an empty mesh.")

    print("Projecting original multiview colors onto the generated mesh...")
    project_reference_colors(mesh, views)
    orient_for_threejs(mesh)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(args.output, file_type="glb")
    print(
        f"Saved {args.output} with {len(mesh.vertices):,} vertices "
        f"and {len(mesh.faces):,} faces."
    )


if __name__ == "__main__":
    main()
