"""Clean and optimize the reconstructed child-Niulai mesh for skinning."""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import numpy as np
import pymeshlab
import trimesh
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / ".tools" / "results" / "niulai-child-reconstructed.glb"
DEFAULT_OUTPUT = PROJECT_ROOT / ".tools" / "results" / "niulai-child-prepared.glb"
INPUTS_DIR = PROJECT_ROOT / ".tools" / "niulai-child-multiview-inputs"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare the child Niulai mesh")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--faces", type=int, default=90000)
    return parser.parse_args()


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - edge0) / max(edge1 - edge0, 1e-8), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def sample_rgba(image: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    pixel_x = np.clip(np.rint(u * (width - 1)).astype(np.int64), 0, width - 1)
    pixel_y = np.clip(np.rint(v * (height - 1)).astype(np.int64), 0, height - 1)
    return image[pixel_y, pixel_x]


def project_turnaround_colours(mesh: trimesh.Trimesh) -> None:
    """Project the approved orthographic panels onto their matching surfaces.

    The generated inputs place the character on a shared 1024px canvas with a
    900px subject height.  Matching that exact framing preserves small authored
    features such as brows, pupils, nostrils, the mouth seam and hoof splits.
    """
    views = {
        name: np.asarray(Image.open(INPUTS_DIR / f"{name}.png").convert("RGBA"), dtype=np.float32)
        for name in ("front", "left", "back")
    }
    views["right"] = views["left"][:, ::-1].copy()

    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    centre = (vertices.min(axis=0) + vertices.max(axis=0)) * 0.5
    height = max(np.ptp(vertices[:, 1]), 1e-8)
    scale = (900.0 / 1024.0) / height
    vertical = 0.5 - (vertices[:, 1] - centre[1]) * scale
    coordinates = (
        ("front", 0.5 + (vertices[:, 0] - centre[0]) * scale),
        ("back", 0.5 - (vertices[:, 0] - centre[0]) * scale),
        ("left", 0.5 - (vertices[:, 2] - centre[2]) * scale),
        ("right", 0.5 + (vertices[:, 2] - centre[2]) * scale),
    )
    samples = np.stack(
        [sample_rgba(views[name], horizontal, vertical) for name, horizontal in coordinates],
        axis=1,
    )

    facing = np.stack(
        [
            np.clip(normals[:, 2], 0.0, 1.0),
            np.clip(-normals[:, 2], 0.0, 1.0),
            np.clip(normals[:, 0], 0.0, 1.0),
            np.clip(-normals[:, 0], 0.0, 1.0),
        ],
        axis=1,
    )
    # A high exponent prevents the profile from washing across front-facing
    # eye and muzzle vertices, while the small floor retains seam continuity.
    weights = np.power(facing + 0.012, 7.0) * (samples[:, :, 3] / 255.0)
    totals = weights.sum(axis=1, keepdims=True)
    colours = np.tile(np.array([232.0, 117.0, 30.0]), (len(vertices), 1))
    valid = totals[:, 0] > 1e-5
    colours[valid] = (
        samples[valid, :, :3] * weights[valid, :, None]
    ).sum(axis=1) / totals[valid]

    # The final film-match build supplies eyes and brows as separate, curved
    # high-density parts.  Remove the low-frequency versions baked into the
    # generated body so the authored parts never double up in profile.
    x, y, z = vertices.T
    eye_underlay = (
        ((np.abs(x) - 0.145) / 0.110) ** 2
        + ((y - 1.810) / 0.047) ** 2
        < 1.0
    ) & (z > 0.155)
    brow_underlay = (
        (np.abs(x) > 0.045)
        & (np.abs(x) < 0.275)
        & (y > 1.882)
        & (y < 1.922)
        & (z > 0.145)
    )
    # Sample the clean centre-forehead strip at the same height so the repair
    # inherits the reference's vertical light gradient instead of forming a
    # flat painted patch around the eyes.
    forehead_fur = sample_rgba(
        views["front"], np.full(len(vertices), 0.5), vertical
    )[:, :3]
    colours[eye_underlay | brow_underlay] = forehead_fur[eye_underlay | brow_underlay]

    srgb = np.clip(colours / 255.0, 0.0, 1.0)
    linear = np.where(
        srgb <= 0.04045,
        srgb / 12.92,
        np.power((srgb + 0.055) / 1.055, 2.4),
    )
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh,
        vertex_colors=np.column_stack(
            [np.rint(linear * 255.0).astype(np.uint8), np.full(len(vertices), 255, dtype=np.uint8)]
        ),
    )


def recolour_fallback(mesh: trimesh.Trimesh) -> None:
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    x, y, z = vertices.T
    colours = np.tile(np.array([226, 116, 31, 255], dtype=np.float64), (len(vertices), 1))

    # Warm vertical variation remains readable at desktop-pet size without
    # using expensive strand fur or a noisy high-frequency texture.
    warmth = np.clip(y / 2.10, 0.0, 1.0)
    colours[:, 0] += 7.0 * warmth
    colours[:, 1] += 4.0 * warmth

    cream = np.array([238.0, 207.0, 157.0])
    hoof = (y < 0.22) & (np.abs(x) > 0.09)
    colours[hoof, :3] = cream

    hand = (y > 0.48) & (y < 0.82) & (np.abs(x) > 0.38)
    colours[hand, :3] = cream

    muzzle_ellipse = (x / 0.36) ** 2 + ((y - 1.66) / 0.285) ** 2
    muzzle = (muzzle_ellipse < 1.0) & (z > 0.13) & (normals[:, 2] > -0.18)
    muzzle_weight = np.clip(1.0 - muzzle_ellipse[muzzle], 0.0, 1.0)[:, None]
    colours[muzzle, :3] = colours[muzzle, :3] * (1.0 - muzzle_weight) + cream * muzzle_weight

    # Keep the iconic film face readable in an untextured preview.
    for centre_x in (-0.145, 0.145):
        eye = (
            ((x - centre_x) / 0.085) ** 2 + ((y - 1.88) / 0.055) ** 2 < 1.0
        ) & (z > 0.27)
        colours[eye, :3] = [91, 65, 44]

        brow_y = 1.985 - 0.10 * abs(x - centre_x)
        brow = (
            (np.abs(x - centre_x) < 0.115)
            & (np.abs(y - brow_y) < 0.018)
            & (z > 0.23)
        )
        colours[brow, :3] = [47, 30, 21]

    for centre_x in (-0.105, 0.105):
        nostril = (
            ((x - centre_x) / 0.034) ** 2 + ((y - 1.735) / 0.026) ** 2 < 1.0
        ) & (z > 0.34)
        colours[nostril, :3] = [91, 55, 43]

    mouth = (np.abs(x) < 0.29) & (np.abs(y - 1.535) < 0.014) & (z > 0.34)
    colours[mouth, :3] = [88, 48, 39]

    inner_ear = (
        (y > 1.78)
        & (y < 2.04)
        & (np.abs(x) > 0.38)
        & (z > 0.0)
        & (normals[:, 2] > 0.05)
    )
    colours[inner_ear, :3] = [210, 130, 104]

    tail_tip = (z < -0.28) & (y < 0.65) & (np.abs(x) < 0.16)
    colours[tail_tip, :3] = [151, 72, 24]
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh,
        vertex_colors=np.clip(colours, 0, 255).astype(np.uint8),
    )


def prepare(source: Path, target_faces: int) -> trimesh.Trimesh:
    loaded = trimesh.load(source, force="mesh", process=False)
    components = loaded.split(only_watertight=False)
    if not components:
        raise RuntimeError("The reconstructed model does not contain a mesh")
    mesh = max(components, key=lambda part: len(part.faces)).copy()
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()

    # Hunyuan already uses +Y up and +Z front.  Normalize to the app contract.
    height = mesh.bounds[1, 1] - mesh.bounds[0, 1]
    mesh.vertices *= 2.10 / max(height, 1e-8)
    mesh.vertices[:, 1] -= mesh.bounds[0, 1]
    mesh.vertices[:, 0] -= (mesh.bounds[0, 0] + mesh.bounds[1, 0]) * 0.5
    mesh.vertices[:, 2] -= (mesh.bounds[0, 2] + mesh.bounds[1, 2]) * 0.5

    with tempfile.TemporaryDirectory(prefix="niulai-child-") as temp_dir:
        source_ply = Path(temp_dir) / "source.ply"
        target_ply = Path(temp_dir) / "prepared.ply"
        mesh.export(source_ply)
        mesh_set = pymeshlab.MeshSet()
        mesh_set.load_new_mesh(str(source_ply))
        mesh_set.apply_filter(
            "meshing_decimation_quadric_edge_collapse",
            targetfacenum=int(target_faces),
            preservenormal=True,
            preserveboundary=True,
            preservetopology=True,
            optimalplacement=True,
            autoclean=True,
        )
        mesh_set.apply_filter("apply_coord_taubin_smoothing", stepsmoothnum=2)
        mesh_set.save_current_mesh(str(target_ply))
        result = trimesh.load(target_ply, force="mesh", process=False)

    result.remove_unreferenced_vertices()
    result.fix_normals()
    if all((INPUTS_DIR / f"{name}.png").exists() for name in ("front", "left", "back")):
        project_turnaround_colours(result)
    else:
        recolour_fallback(result)
    return result


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(args.input)
    mesh = prepare(args.input, args.faces)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(args.output, file_type="glb")
    print(
        f"Saved {args.output} with {len(mesh.vertices):,} vertices, "
        f"{len(mesh.faces):,} faces, bounds={np.round(mesh.bounds, 4).tolist()}"
    )


if __name__ == "__main__":
    main()
