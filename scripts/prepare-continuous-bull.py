"""Prepare the image-reconstructed bull mesh for real-time skeletal rigging.

The source mesh is generated from the supplied front/side/back reference by
Hunyuan3D.  This script keeps its continuous sculpted surface, removes tiny
scan fragments, reduces polygon count, applies the requested proportion fixes,
and paints stable vertex colours for the desktop renderer.
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import numpy as np
import pymeshlab
import trimesh


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / ".tools" / "results" / "bull-projected-colors-rejected.glb"
DEFAULT_OUTPUT = PROJECT_ROOT / ".tools" / "results" / "bull-continuous-prepared.glb"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare the continuous Niulai mesh")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--faces", type=int, default=42000)
    return parser.parse_args()


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - edge0) / max(edge1 - edge0, 1e-8), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def recolour(mesh: trimesh.Trimesh) -> None:
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals)
    x, y, z = vertices.T
    colours = np.tile(np.array([190, 113, 42, 255], dtype=np.float64), (len(vertices), 1))

    # Slight vertical warmth variation suggests short fur without relying on a
    # dense texture that becomes noisy when the pet is only ~80 pixels tall.
    warmth = np.clip((y - 0.15) / 2.05, 0.0, 1.0)
    colours[:, 0] += 10.0 * warmth
    colours[:, 1] += 5.0 * warmth

    hoof = (y < 0.19) & (np.abs(x) > 0.10)
    colours[hoof, :3] = [112, 103, 94]

    hand = (y < 0.78) & (y > 0.42) & (np.abs(x) > 0.40)
    colours[hand, :3] = [178, 132, 102]

    horn = (y > 1.96) & (np.abs(x) > 0.22)
    horn_shade = np.clip((y[horn] - 1.96) / 0.34, 0.0, 1.0)[:, None]
    colours[horn, :3] = np.array([126, 116, 106]) * (1.0 - 0.18 * horn_shade)

    inner_ear = (
        (y > 1.79)
        & (y < 2.06)
        & (np.abs(x) > 0.38)
        & (z > 0.015)
        & (normals[:, 2] > 0.12)
    )
    colours[inner_ear, :3] = [167, 91, 82]

    muzzle_ellipse = (x / 0.37) ** 2 + ((y - 1.66) / 0.27) ** 2
    muzzle = (muzzle_ellipse < 1.0) & (z > 0.19) & (normals[:, 2] > -0.02)
    muzzle_mix = np.clip(1.0 - muzzle_ellipse[muzzle], 0.0, 1.0)[:, None]
    pink = np.array([211.0, 145.0, 143.0])
    colours[muzzle, :3] = colours[muzzle, :3] * (1.0 - muzzle_mix) + pink * muzzle_mix

    for centre_x in (-0.105, 0.105):
        nostril = (
            ((x - centre_x) / 0.030) ** 2 + ((y - 1.755) / 0.021) ** 2 < 1.0
        ) & (z > 0.325)
        colours[nostril, :3] = [61, 37, 34]

    mouth = (
        (np.abs(x) < 0.275)
        & (np.abs(y - 1.535) < 0.011)
        & (z > 0.32)
    )
    colours[mouth, :3] = [83, 43, 43]

    for centre_x in (-0.14, 0.14):
        eye = (
            ((x - centre_x) / 0.075) ** 2 + ((y - 1.935) / 0.017) ** 2 < 1.0
        ) & (z > 0.29)
        colours[eye, :3] = [42, 29, 23]

        brow = (
            (np.abs(x - centre_x) < 0.115)
            & (np.abs(y - (2.015 + 0.10 * abs(x - centre_x))) < 0.012)
            & (z > 0.275)
        )
        colours[brow, :3] = [35, 23, 18]

    tail_tip = (z < -0.31) & (y < 0.64) & (np.abs(x) < 0.20)
    colours[tail_tip, :3] = [83, 48, 26]
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh,
        vertex_colors=np.clip(colours, 0, 255).astype(np.uint8),
    )


def prepare_mesh(source: Path, target_faces: int) -> trimesh.Trimesh:
    loaded = trimesh.load(source, force="mesh", process=False)
    components = loaded.split(only_watertight=False)
    if not components:
        raise RuntimeError("The reconstructed model does not contain a mesh")
    mesh = max(components, key=lambda part: len(part.faces)).copy()
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()

    # Normalize to the existing Three.js character contract: +Y up, +Z front,
    # feet on y=0, approximately 2.28 world units tall.
    bounds = mesh.bounds
    scale = 2.28 / max(bounds[1, 1] - bounds[0, 1], 1e-8)
    mesh.vertices *= scale
    mesh.vertices[:, 1] -= mesh.bounds[0, 1]
    mesh.vertices[:, 0] -= (mesh.bounds[0, 0] + mesh.bounds[1, 0]) * 0.5
    mesh.vertices[:, 2] -= (mesh.bounds[0, 2] + mesh.bounds[1, 2]) * 0.5

    vertices = mesh.vertices
    x, y, z = vertices.T

    # Requested proportion adjustment: retain the stout body but make the belly
    # a little less spherical. Arms are excluded so their silhouette stays long.
    belly_y = smoothstep(0.52, 0.82, y) * (1.0 - smoothstep(1.34, 1.56, y))
    torso = np.clip(1.0 - np.abs(x) / 0.46, 0.0, 1.0)
    belly_weight = belly_y * torso
    vertices[:, 0] *= 1.0 - 0.055 * belly_weight
    vertices[:, 2] *= 1.0 - 0.04 * belly_weight

    # Preserve the broad, forward muzzle that identifies the character at small
    # sizes. This edits the reconstructed surface itself, not an attached shape.
    face_y = smoothstep(1.43, 1.58, y) * (1.0 - smoothstep(1.86, 2.00, y))
    face_x = np.clip(1.0 - np.abs(x) / 0.40, 0.0, 1.0)
    face_front = smoothstep(0.15, 0.36, z)
    muzzle_weight = face_y * face_x * face_front
    vertices[:, 0] *= 1.0 + 0.095 * muzzle_weight
    vertices[:, 2] += 0.075 * muzzle_weight

    # Collapse the small unwanted anatomical/navel protrusion back into the
    # pelvis surface while keeping the gap and silhouette of both legs.
    centre = np.clip(1.0 - np.abs(x) / 0.13, 0.0, 1.0)
    lower = smoothstep(0.29, 0.43, y) * (1.0 - smoothstep(0.70, 0.79, y))
    front = smoothstep(-0.22, -0.10, z)
    cleanup = centre * lower * front
    vertices[:, 1] += (0.73 - vertices[:, 1]) * cleanup
    vertices[:, 2] -= 0.12 * cleanup

    # Replace the centre-front scan relief with a smooth belly profile. This
    # removes the navel/anatomical dents instead of merely painting over them.
    belly_profile = np.interp(
        y,
        [0.58, 0.70, 0.82, 0.96, 1.10, 1.22, 1.34],
        [0.07, 0.18, 0.26, 0.32, 0.33, 0.30, 0.22],
    )
    centre_front = (
        np.clip(1.0 - np.abs(x) / 0.15, 0.0, 1.0)
        * smoothstep(0.56, 0.70, y)
        * (1.0 - smoothstep(1.24, 1.38, y))
        * smoothstep(-0.04, 0.14, z)
    )
    vertices[:, 2] += (belly_profile - vertices[:, 2]) * centre_front

    with tempfile.TemporaryDirectory(prefix="niulai-continuous-") as temp_dir:
        source_ply = Path(temp_dir) / "source.ply"
        target_ply = Path(temp_dir) / "decimated.ply"
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
    recolour(result)
    return result


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(args.input)
    mesh = prepare_mesh(args.input, args.faces)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(args.output, file_type="glb")
    print(
        f"Saved {args.output} with {len(mesh.vertices):,} vertices, "
        f"{len(mesh.faces):,} faces, bounds={np.round(mesh.bounds, 4).tolist()}"
    )


if __name__ == "__main__":
    main()
