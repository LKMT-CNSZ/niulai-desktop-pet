import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((value) => {
        this.result = value;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }).catch((error) => this.onerror?.(error));
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((value) => {
        const mime = blob.type || 'application/octet-stream';
        this.result = `data:${mime};base64,${Buffer.from(value).toString('base64')}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      }).catch((error) => this.onerror?.(error));
    }
  };
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_RIG = path.join(PROJECT_ROOT, 'assets', 'models', 'bull-rigged-primitive-v3.glb');
const SOURCE_MESH = path.join(PROJECT_ROOT, '.tools', 'results', 'niulai-child-hires-base.glb');
const SOURCE_DETAILS = path.join(PROJECT_ROOT, 'assets', 'models', 'niulai-child-hires-static.glb');
const OUTPUT = path.join(PROJECT_ROOT, 'assets', 'models', 'niulai-child-rigged.glb');

async function loadGlb(filePath) {
  const buffer = await fs.readFile(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new GLTFLoader().parseAsync(arrayBuffer, '');
}

const [rigGltf, meshGltf, detailGltf] = await Promise.all([
  loadGlb(SOURCE_RIG),
  loadGlb(SOURCE_MESH),
  loadGlb(SOURCE_DETAILS)
]);
const loadedRigRoot = rigGltf.scene;
const model = loadedRigRoot.getObjectByName('NiulaiRiggedBull') || loadedRigRoot.children[0];
loadedRigRoot.remove(model);
const scene = new THREE.Scene();
scene.name = 'NiulaiChildHighDensityRigScene';
scene.add(model);
model.name = 'NiulaiChildHighDensityRig';

let sourceSkeleton = null;
const obsoleteMeshes = [];
model.traverse((object) => {
  if (!object.isMesh) return;
  if (!sourceSkeleton && object.isSkinnedMesh) sourceSkeleton = object.skeleton;
  obsoleteMeshes.push(object);
});
if (!sourceSkeleton) throw new Error('Source rig does not contain a skeleton');
for (const object of obsoleteMeshes) object.parent?.remove(object);

let sourceMesh = null;
meshGltf.scene.traverse((object) => {
  if (!sourceMesh && object.isMesh) sourceMesh = object;
});
if (!sourceMesh) throw new Error('Prepared child mesh is missing');

detailGltf.scene.updateMatrixWorld(true);
const detailSources = [];
detailGltf.scene.traverse((object) => {
  if (object.isMesh && object.name !== 'preparedply') detailSources.push(object);
});
if (detailSources.length !== 12) {
  throw new Error(`Expected 12 authored face detail meshes, found ${detailSources.length}`);
}

const bones = [...sourceSkeleton.bones];
const boneByName = new Map(bones.map((bone) => [bone.name, bone]));

function addHelper(name, parentName, position) {
  if (boneByName.has(name)) throw new Error(`Duplicate bone name: ${name}`);
  const parent = boneByName.get(parentName);
  if (!parent) throw new Error(`Missing helper parent: ${parentName}`);
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.fromArray(position);
  parent.add(bone);
  bones.push(bone);
  boneByName.set(name, bone);
  return bone;
}

// Deformation helpers are siblings of the kinematic chain, so they preserve IK
// reach while distributing rotation over shoulders, elbows, hips, knees and
// feet.  The following passes raise the rig from 96 to 128 bones. The final
// sixteen soft-tissue helpers are animated independently during large poses so
// armpits, elbows, groin and knees do not collapse into rigid hinges.
addHelper('abdomen_dfrm', 'pelvis', [0, 0.16, 0.03]);
addHelper('sternum_dfrm', 'chest', [0, 0.05, 0.10]);
addHelper('neck_dfrm', 'neck', [0, 0.08, 0.02]);

for (const side of ['l', 'r']) {
  const sign = side === 'l' ? -1 : 1;
  addHelper(`scapula_dfrm_${side}`, 'chest', [sign * 0.24, 0.06, -0.08]);
  addHelper(`upperarm_twist_01_${side}`, `upperarm_${side}`, [sign * 0.005, -0.10, 0]);
  addHelper(`upperarm_twist_02_${side}`, `upperarm_${side}`, [sign * 0.010, -0.21, 0.005]);
  addHelper(`forearm_twist_01_${side}`, `lowerarm_${side}`, [0, -0.09, 0.01]);
  addHelper(`forearm_twist_02_${side}`, `lowerarm_${side}`, [0, -0.20, 0.025]);
  addHelper(`wrist_dfrm_${side}`, `hand_${side}`, [0, -0.035, 0.025]);
  addHelper(`thumb_02_${side}`, `thumb_01_${side}`, [sign * -0.018, -0.045, 0.012]);
  addHelper(`index_02_${side}`, `index_01_${side}`, [0, -0.055, 0.008]);
  addHelper(`middle_02_${side}`, `middle_01_${side}`, [0, -0.058, 0.008]);

  addHelper(`hip_dfrm_${side}`, 'pelvis', [sign * 0.21, -0.10, 0]);
  addHelper(`thigh_twist_01_${side}`, `thigh_${side}`, [0, -0.085, 0]);
  addHelper(`thigh_twist_02_${side}`, `thigh_${side}`, [0, -0.18, 0.005]);
  addHelper(`shin_twist_01_${side}`, `shin_${side}`, [0, -0.075, 0.008]);
  addHelper(`shin_twist_02_${side}`, `shin_${side}`, [0, -0.17, 0.018]);
  addHelper(`ankle_dfrm_${side}`, `foot_${side}`, [0, -0.015, 0.055]);
}

addHelper('tail_05', 'tail_04', [0.035, -0.105, -0.06]);
addHelper('tail_06', 'tail_05', [0.02, -0.085, -0.04]);
addHelper('muzzle_upper', 'head', [0, -0.10, 0.34]);
addHelper('muzzle_lower', 'jaw', [0, -0.02, 0.13]);
addHelper('cheek_l', 'head', [-0.24, -0.07, 0.25]);
addHelper('cheek_r', 'head', [0.24, -0.07, 0.25]);
addHelper('mouth_corner_l', 'jaw', [-0.25, 0.015, 0.18]);
addHelper('mouth_corner_r', 'jaw', [0.25, 0.015, 0.18]);

for (const side of ['l', 'r']) {
  const sign = side === 'l' ? -1 : 1;
  addHelper(`ribcage_dfrm_${side}`, 'chest', [sign * 0.17, 0.015, 0.04]);
  addHelper(`shoulder_cap_${side}`, `clavicle_${side}`, [sign * 0.245, -0.02, 0]);
  addHelper(`elbow_dfrm_${side}`, `upperarm_${side}`, [sign * 0.01, -0.305, 0.01]);
  addHelper(`palm_dfrm_${side}`, `hand_${side}`, [0, -0.075, 0.035]);
  addHelper(`glute_dfrm_${side}`, 'pelvis', [sign * 0.20, -0.075, -0.12]);
  addHelper(`knee_dfrm_${side}`, `thigh_${side}`, [0, -0.265, 0.015]);
  addHelper(`heel_dfrm_${side}`, `foot_${side}`, [0, -0.015, 0.015]);
  addHelper(`toe_roll_${side}`, `toe_${side}`, [0, 0, 0.075]);
}

for (const side of ['l', 'r']) {
  const sign = side === 'l' ? -1 : 1;
  addHelper(`belly_side_${side}`, 'pelvis', [sign * 0.18, 0.11, 0.06]);
  addHelper(`flank_dfrm_${side}`, 'spine_01', [sign * 0.19, 0.04, 0.02]);
  addHelper(`armpit_dfrm_${side}`, 'chest', [sign * 0.28, -0.07, 0.05]);
  addHelper(`upperarm_soft_${side}`, `upperarm_${side}`, [sign * 0.006, -0.16, 0.035]);
  addHelper(`groin_dfrm_${side}`, 'pelvis', [sign * 0.12, -0.20, 0.05]);
  addHelper(`inner_thigh_dfrm_${side}`, `thigh_${side}`, [sign * -0.03, -0.13, 0.04]);
  addHelper(`elbow_soft_${side}`, `lowerarm_${side}`, [sign * 0.005, -0.025, 0.035]);
  addHelper(`knee_soft_${side}`, `shin_${side}`, [0, -0.025, 0.035]);
}

if (bones.length !== 128) throw new Error(`Expected 128 bones, found ${bones.length}`);
const boneIndex = new Map(bones.map((bone, index) => [bone.name, index]));

const geometry = sourceMesh.geometry.clone();
geometry.name = 'NiulaiChildContinuousGeometry';
const reconstructedIndex = geometry.getIndex();
if (!reconstructedIndex) throw new Error('Prepared child mesh must be indexed');
const reconstructedPosition = geometry.getAttribute('position');
const keptIndices = [];
let removedBridgeFaces = 0;
for (let offset = 0; offset < reconstructedIndex.count; offset += 3) {
  const ids = [
    reconstructedIndex.getX(offset),
    reconstructedIndex.getX(offset + 1),
    reconstructedIndex.getX(offset + 2)
  ];
  const xs = ids.map((id) => reconstructedPosition.getX(id));
  const ys = ids.map((id) => reconstructedPosition.getY(id));
  const zs = ids.map((id) => reconstructedPosition.getZ(id));
  const crossesCentre = Math.min(...xs) < 0 && Math.max(...xs) >= 0;
  const narrowBridge = Math.max(...xs.map(Math.abs)) < 0.055;
  const belowCrotch = Math.max(...ys) < 0.48;
  const notTail = zs.reduce((sum, value) => sum + value, 0) / 3 > -0.14;
  if (crossesCentre && narrowBridge && belowCrotch && notTail) {
    removedBridgeFaces += 1;
    continue;
  }
  keptIndices.push(...ids);
}
geometry.setIndex(keptIndices);
geometry.computeVertexNormals();
const position = geometry.getAttribute('position');
const skinIndices = new Uint16Array(position.count * 4);
const skinWeights = new Float32Array(position.count * 4);
const denseWeights = new Float32Array(position.count * bones.length);

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(edge1 - edge0, 1e-8), 0, 1);
  return t * t * (3 - 2 * t);
}

function storeInfluences(vertex, entries) {
  const merged = new Map();
  for (const [name, weight] of entries) {
    if (weight <= 0 || !boneIndex.has(name)) continue;
    merged.set(name, (merged.get(name) || 0) + weight);
  }
  const total = [...merged.values()].reduce((sum, value) => sum + value, 0) || 1;
  for (const [name, weight] of merged) {
    denseWeights[vertex * bones.length + boneIndex.get(name)] = weight / total;
  }
}

function blendNames(names, value) {
  if (names.length === 1) return [[names[0], 1]];
  const scaled = THREE.MathUtils.clamp(value, 0, 1) * (names.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(names.length - 1, low + 1);
  const mix = scaled - low;
  return low === high ? [[names[low], 1]] : [[names[low], 1 - mix], [names[high], mix]];
}

for (let vertex = 0; vertex < position.count; vertex += 1) {
  const x = position.getX(vertex);
  const y = position.getY(vertex);
  const z = position.getZ(vertex);
  const absX = Math.abs(x);
  const side = x < 0 ? 'l' : 'r';
  const isTail = z < -0.30 && y < 0.92 && absX < 0.18;
  const isEar = y > 1.76 && absX > 0.36;
  const isEye = y > 1.77 && y < 2.00 && z > 0.22 && absX > 0.035 && absX < 0.29;
  const isFace = y > 1.38 && z > 0.12 && absX < 0.42;
  const isArm = y > 0.45 && y < 1.58 && absX > 0.29;
  const isLeg = y < 0.54 || (y < 0.88 && absX > 0.085);

  if (isTail) {
    const tailT = THREE.MathUtils.clamp((0.88 - y) / 0.63, 0, 1);
    storeInfluences(vertex, blendNames(
      ['tail_01', 'tail_02', 'tail_03', 'tail_04', 'tail_05', 'tail_06'],
      tailT
    ));
  } else if (isEar) {
    storeInfluences(vertex, [[`ear_${side}`, 0.90], ['head', 0.10]]);
  } else if (isEye) {
    const browWeight = smoothstep(1.91, 2.01, y) * 0.62;
    storeInfluences(vertex, [
      [`eye_${side}`, 0.62 * (1 - browWeight)],
      [`eyelid_${side}`, 0.22 * (1 - browWeight)],
      [`brow_${side}`, browWeight],
      ['head', 0.16]
    ]);
  } else if (isFace) {
    const lower = 1 - smoothstep(1.62, 1.75, y);
    const corner = smoothstep(0.15, 0.31, absX);
    storeInfluences(vertex, lower
      ? [
          ['muzzle_lower', lower * (1 - corner) * 0.62],
          [`mouth_corner_${side}`, lower * corner * 0.72],
          ['jaw', lower * 0.22],
          [`cheek_${side}`, (1 - lower) * 0.24],
          ['head', 0.22]
        ]
      : [['muzzle_upper', 0.55], [`cheek_${side}`, 0.18], ['head', 0.27]]);
  } else if (isArm) {
    const shoulderToHand = THREE.MathUtils.clamp((1.43 - y) / 0.83, 0, 1);
    const armWeight = smoothstep(0.30, 0.53, absX)
      * (1 - 0.32 * smoothstep(0.20, 0.42, Math.abs(z)));
    const bodyBone = y > 1.29 ? 'chest' : y > 1.03 ? 'spine_02' : y > 0.78 ? 'abdomen_dfrm' : 'pelvis';
    let chain;
    if (shoulderToHand < 0.12) {
      chain = [
        [`scapula_dfrm_${side}`, 0.13], [`clavicle_${side}`, 0.16],
        [`armpit_dfrm_${side}`, 0.22], [`shoulder_cap_${side}`, 0.27],
        [`upperarm_${side}`, 0.22]
      ];
    } else if (shoulderToHand < 0.48) {
      chain = blendNames(
        [
          `upperarm_${side}`, `upperarm_soft_${side}`, `upperarm_twist_01_${side}`, `upperarm_twist_02_${side}`,
          `elbow_dfrm_${side}`, `lowerarm_${side}`
        ],
        shoulderToHand / 0.48
      );
    } else if (shoulderToHand < 0.86) {
      chain = blendNames(
        [
          `lowerarm_${side}`, `elbow_soft_${side}`, `forearm_twist_01_${side}`, `forearm_twist_02_${side}`,
          `wrist_dfrm_${side}`, `palm_dfrm_${side}`
        ],
        (shoulderToHand - 0.48) / 0.38
      );
    } else {
      const digit = x * (side === 'l' ? -1 : 1) > 0.50 ? 'index' : 'middle';
      chain = [
        [`hand_${side}`, 0.20],
        [`palm_dfrm_${side}`, 0.31],
        [`${digit}_01_${side}`, 0.29],
        [`${digit}_02_${side}`, 0.20]
      ];
    }
    storeInfluences(vertex, [
      ...chain.map(([name, weight]) => [name, weight * armWeight]),
      [bodyBone, 1 - armWeight]
    ]);
  } else if (isLeg) {
    const hipBand = 1 - smoothstep(0.52, 0.86, y);
    const lateralSeparation = smoothstep(0.08, 0.25, absX);
    const innerSeamRelease = y > 0.36 ? smoothstep(0.018, 0.105, absX) : 1;
    const legWeight = THREE.MathUtils.clamp(
      hipBand + (1 - hipBand) * lateralSeparation,
      0,
      1
    ) * innerSeamRelease;
    let chain;
    if (y > 0.61) {
      const rear = 1 - smoothstep(-0.24, -0.02, z);
      chain = [
        [`groin_dfrm_${side}`, 0.14], [`hip_dfrm_${side}`, 0.15],
        [`glute_dfrm_${side}`, 0.21 + rear * 0.16],
        [`inner_thigh_dfrm_${side}`, 0.15], [`thigh_${side}`, 0.35 - rear * 0.16]
      ];
    } else if (y > 0.40) {
      chain = blendNames(
        [
          `thigh_${side}`, `inner_thigh_dfrm_${side}`, `thigh_twist_01_${side}`, `thigh_twist_02_${side}`,
          `knee_dfrm_${side}`, `shin_${side}`
        ],
        (0.61 - y) / 0.21
      );
    } else if (y > 0.20) {
      chain = blendNames(
        [`shin_${side}`, `knee_soft_${side}`, `shin_twist_01_${side}`, `shin_twist_02_${side}`, `ankle_dfrm_${side}`],
        (0.40 - y) / 0.20
      );
    } else {
      const toeWeight = smoothstep(0.075, 0.25, z);
      chain = [
        [`ankle_dfrm_${side}`, 0.18 * (1 - toeWeight)],
        [`heel_dfrm_${side}`, 0.30 * (1 - toeWeight)],
        [`foot_${side}`, 0.30],
        [`toe_roll_${side}`, 0.34 * toeWeight],
        [`toe_${side}`, 0.22 * toeWeight],
        [`hoof_${side}`, 0.22]
      ];
    }
    storeInfluences(vertex, [
      ...chain.map(([name, weight]) => [name, weight * legWeight]),
      ['pelvis', 1 - legWeight]
    ]);
  } else if (y > 1.53) {
    storeInfluences(vertex, [['neck_dfrm', 0.18], ['neck', 0.24], ['head', 0.58]]);
  } else if (y > 1.29) {
    const sideWeight = smoothstep(0.12, 0.34, absX) * 0.28;
    storeInfluences(vertex, [
      ['spine_02', 0.16], ['sternum_dfrm', 0.30], ['chest', 0.54 - sideWeight],
      [`ribcage_dfrm_${side}`, sideWeight]
    ]);
  } else if (y > 1.02) {
    storeInfluences(vertex, [
      ['spine_01', 0.22], ['spine_02', 0.34], ['sternum_dfrm', 0.24],
      [`flank_dfrm_${side}`, 0.20]
    ]);
  } else if (y > 0.78) {
    storeInfluences(vertex, [
      ['pelvis', 0.18], ['abdomen_dfrm', 0.34], ['spine_01', 0.25],
      [`belly_side_${side}`, 0.23]
    ]);
  } else {
    storeInfluences(vertex, [
      ['pelvis', 0.54], ['abdomen_dfrm', 0.18], [`belly_side_${side}`, 0.16],
      [`groin_dfrm_${side}`, 0.12]
    ]);
  }
}

// Smooth weights over topology, then retain the four strongest normalized
// influences supported by glTF.  Ten conservative passes soften joint bands
// without bleeding face weights into the torso or limbs into the belly.
const neighbours = Array.from({ length: position.count }, () => new Set());
const geometryIndex = geometry.getIndex();
if (!geometryIndex) throw new Error('Prepared child mesh must be indexed');
for (let offset = 0; offset < geometryIndex.count; offset += 3) {
  const a = geometryIndex.getX(offset);
  const b = geometryIndex.getX(offset + 1);
  const c = geometryIndex.getX(offset + 2);
  neighbours[a].add(b); neighbours[a].add(c);
  neighbours[b].add(a); neighbours[b].add(c);
  neighbours[c].add(a); neighbours[c].add(b);
}

let smoothed = denseWeights;
for (let iteration = 0; iteration < 10; iteration += 1) {
  const next = new Float32Array(smoothed.length);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const adjacent = neighbours[vertex];
    const alpha = adjacent.size ? 0.30 : 0;
    for (let bone = 0; bone < bones.length; bone += 1) {
      let average = 0;
      let acceptedNeighbours = 0;
      for (const neighbour of adjacent) {
        const crossesLegCentre = position.getY(vertex) < 0.95
          && position.getY(neighbour) < 0.95
          && position.getX(vertex) * position.getX(neighbour) < 0;
        if (crossesLegCentre) continue;
        average += smoothed[neighbour * bones.length + bone];
        acceptedNeighbours += 1;
      }
      if (acceptedNeighbours) average /= acceptedNeighbours;
      next[vertex * bones.length + bone] =
        smoothed[vertex * bones.length + bone] * (1 - (acceptedNeighbours ? alpha : 0))
        + average * (acceptedNeighbours ? alpha : 0);
    }
  }
  smoothed = next;
}

// Prevent topology smoothing from leaking torso weights into the inner hoof
// seam or pelvis weights into fingertips.  Those distant influences are the
// source of long triangular sheets during locomotion and large arm gestures.
for (let vertex = 0; vertex < position.count; vertex += 1) {
  const x = position.getX(vertex);
  const y = position.getY(vertex);
  const absX = Math.abs(x);
  const side = x < 0 ? 'l' : 'r';
  let allowed = null;
  if (y > 0.36 && y < 0.64 && absX < 0.085) {
    const lateral = smoothstep(0.015, 0.085, absX);
    for (let bone = 0; bone < bones.length; bone += 1) {
      smoothed[vertex * bones.length + bone] = 0;
    }
    smoothed[vertex * bones.length + boneIndex.get('pelvis')] = 0.72 - lateral * 0.24;
    smoothed[vertex * bones.length + boneIndex.get('abdomen_dfrm')] = 0.18 - lateral * 0.08;
    smoothed[vertex * bones.length + boneIndex.get(`groin_dfrm_${side}`)] = 0.10 + lateral * 0.18;
    smoothed[vertex * bones.length + boneIndex.get(`inner_thigh_dfrm_${side}`)] = lateral * 0.14;
  }
  if (y < 0.46 && absX >= 0.085) {
    allowed = new Set([
      `hip_dfrm_${side}`, `glute_dfrm_${side}`, `groin_dfrm_${side}`,
      `inner_thigh_dfrm_${side}`, `thigh_${side}`,
      `thigh_twist_01_${side}`, `thigh_twist_02_${side}`, `knee_dfrm_${side}`,
      `shin_${side}`, `knee_soft_${side}`, `shin_twist_01_${side}`, `shin_twist_02_${side}`,
      `ankle_dfrm_${side}`, `heel_dfrm_${side}`, `foot_${side}`,
      `toe_${side}`, `toe_roll_${side}`, `hoof_${side}`
    ]);
  } else if (y > 0.45 && y < 0.86 && Math.abs(x) > 0.42) {
    allowed = new Set([
      `upperarm_${side}`, `upperarm_twist_01_${side}`, `upperarm_twist_02_${side}`,
      `shoulder_cap_${side}`, `armpit_dfrm_${side}`, `upperarm_soft_${side}`,
      `elbow_dfrm_${side}`, `elbow_soft_${side}`, `lowerarm_${side}`,
      `forearm_twist_01_${side}`, `forearm_twist_02_${side}`,
      `wrist_dfrm_${side}`, `hand_${side}`, `palm_dfrm_${side}`, `hoof_hand_${side}`,
      `thumb_01_${side}`, `thumb_02_${side}`, `index_01_${side}`, `index_02_${side}`,
      `middle_01_${side}`, `middle_02_${side}`
    ]);
  }
  if (!allowed) continue;
  let total = 0;
  for (let bone = 0; bone < bones.length; bone += 1) {
    const offset = vertex * bones.length + bone;
    if (!allowed.has(bones[bone].name)) smoothed[offset] = 0;
    total += smoothed[offset];
  }
  if (total > 1e-8) {
    for (let bone = 0; bone < bones.length; bone += 1) {
      smoothed[vertex * bones.length + bone] /= total;
    }
  }
}

for (let vertex = 0; vertex < position.count; vertex += 1) {
  const entries = [];
  for (let bone = 0; bone < bones.length; bone += 1) {
    const weight = smoothed[vertex * bones.length + bone];
    if (weight > 1e-6) entries.push([bone, weight]);
  }
  entries.sort((a, b) => b[1] - a[1]);
  const selected = entries.slice(0, 4);
  const total = selected.reduce((sum, entry) => sum + entry[1], 0) || 1;
  for (let slot = 0; slot < 4; slot += 1) {
    const entry = selected[slot];
    skinIndices[vertex * 4 + slot] = entry ? entry[0] : boneIndex.get('root');
    skinWeights[vertex * 4 + slot] = entry ? entry[1] / total : 0;
  }
}
geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

const morphNames = ['blink_l', 'blink_r', 'mouth_open', 'smile', 'frown'];
const morphArrays = morphNames.map(() => new Float32Array(position.count * 3));
for (let vertex = 0; vertex < position.count; vertex += 1) {
  const x = position.getX(vertex);
  const y = position.getY(vertex);
  const z = position.getZ(vertex);
  const frontWeight = smoothstep(0.16, 0.38, z);
  for (const [targetIndex, sideSign] of [[0, -1], [1, 1]]) {
    const centreX = sideSign * 0.145;
    const ellipse = ((x - centreX) / 0.12) ** 2 + ((y - 1.81) / 0.060) ** 2;
    const weight = Math.max(0, 1 - ellipse) * frontWeight;
    morphArrays[targetIndex][vertex * 3 + 1] = -0.060 * weight;
    morphArrays[targetIndex][vertex * 3 + 2] = -0.012 * weight;
  }
  const muzzleEllipse = (x / 0.37) ** 2 + ((y - 1.55) / 0.28) ** 2;
  const muzzleWeight = Math.max(0, 1 - muzzleEllipse) * frontWeight;
  const lowerWeight = 1 - smoothstep(1.62, 1.72, y);
  morphArrays[2][vertex * 3 + 1] = -0.11 * muzzleWeight * lowerWeight;
  morphArrays[2][vertex * 3 + 2] = 0.035 * muzzleWeight * lowerWeight;
  const cornerWeight = smoothstep(0.13, 0.28, Math.abs(x)) * (1 - smoothstep(0.28, 0.37, Math.abs(x)));
  const mouthBand = 1 - smoothstep(0.018, 0.085, Math.abs(y - 1.45));
  const expressionWeight = cornerWeight * mouthBand * frontWeight;
  morphArrays[3][vertex * 3 + 1] = 0.055 * expressionWeight;
  morphArrays[4][vertex * 3 + 1] = -0.055 * expressionWeight;
}
geometry.morphAttributes.position = morphArrays.map((array, index) => {
  const attribute = new THREE.Float32BufferAttribute(array, 3);
  attribute.name = morphNames[index];
  return attribute;
});
geometry.morphTargetsRelative = true;

const material = new THREE.MeshPhysicalMaterial({
  name: 'niulai_child_orange_short_fur',
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.84,
  metalness: 0,
  sheen: 0.16,
  sheenColor: new THREE.Color(0xe68a39),
  sheenRoughness: 0.90,
  clearcoat: 0.012,
  clearcoatRoughness: 0.96
});
material.userData.furSurface = true;

const childMesh = new THREE.SkinnedMesh(geometry, material);
childMesh.name = 'NiulaiChildContinuous';
childMesh.castShadow = true;
childMesh.receiveShadow = true;
childMesh.frustumCulled = false;
childMesh.morphTargetInfluences = new Array(morphNames.length).fill(0);
childMesh.morphTargetDictionary = Object.fromEntries(morphNames.map((name, index) => [name, index]));
model.add(childMesh);

model.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(bones);
skeleton.calculateInverses();
childMesh.bind(skeleton, new THREE.Matrix4());

function detailBoneName(name) {
  const side = name.endsWith('L') ? 'l' : name.endsWith('R') ? 'r' : null;
  if (name.startsWith('EyeWhite') || name.startsWith('Iris')
      || name.startsWith('Pupil') || name.startsWith('EyeHighlight')) {
    return `eye_${side}`;
  }
  if (name.startsWith('Brow')) return `brow_${side}`;
  if (name.startsWith('Nostril')) return 'head';
  return 'head';
}

function addRigidFaceDetail(source) {
  const geometry = source.geometry.clone();
  geometry.applyMatrix4(source.matrixWorld);
  geometry.name = `${source.name}RiggedGeometry`;
  geometry.computeVertexNormals();
  const detailPosition = geometry.getAttribute('position');
  const rigidBone = boneIndex.get(detailBoneName(source.name));
  const detailSkinIndices = new Uint16Array(detailPosition.count * 4);
  const detailSkinWeights = new Float32Array(detailPosition.count * 4);
  for (let vertex = 0; vertex < detailPosition.count; vertex += 1) {
    detailSkinIndices[vertex * 4] = rigidBone;
    detailSkinWeights[vertex * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(detailSkinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(detailSkinWeights, 4));

  const side = source.name.endsWith('L') ? 'l' : source.name.endsWith('R') ? 'r' : null;
  const isAnimatedEyePart = side && (
    source.name.startsWith('EyeWhite') || source.name.startsWith('Iris')
    || source.name.startsWith('Pupil') || source.name.startsWith('EyeHighlight')
  );
  if (isAnimatedEyePart) {
    const centreY = 1.810;
    const blink = new Float32Array(detailPosition.count * 3);
    for (let vertex = 0; vertex < detailPosition.count; vertex += 1) {
      const y = detailPosition.getY(vertex);
      blink[vertex * 3 + 1] = centreY - y;
      blink[vertex * 3 + 2] = -0.030;
    }
    const blinkAttribute = new THREE.Float32BufferAttribute(blink, 3);
    blinkAttribute.name = `blink_${side}`;
    geometry.morphAttributes.position = [blinkAttribute];
    geometry.morphTargetsRelative = true;
  }

  const detail = new THREE.SkinnedMesh(geometry, source.material.clone());
  detail.name = source.name;
  detail.castShadow = true;
  detail.receiveShadow = true;
  detail.frustumCulled = false;
  if (isAnimatedEyePart) {
    detail.morphTargetInfluences = [0];
    detail.morphTargetDictionary = { [`blink_${side}`]: 0 };
  }
  model.add(detail);
  detail.bind(skeleton, new THREE.Matrix4());
  return detail;
}

const faceDetailMeshes = detailSources.map(addRigidFaceDetail);

function replaceTrack(tracks, replacement) {
  const existing = tracks.findIndex((track) => track.name === replacement.name);
  if (existing >= 0) tracks.splice(existing, 1, replacement);
  else tracks.push(replacement);
}

function setQuaternionTrack(tracks, clip, nodeName, samples) {
  const trackName = `${nodeName}.quaternion`;
  const times = new Float32Array(samples.map(([fraction]) => fraction * clip.duration));
  const values = new Float32Array(samples.length * 4);
  for (let index = 0; index < samples.length; index += 1) {
    const [, x, y, z] = samples[index];
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
    quaternion.toArray(values, index * 4);
  }
  replaceTrack(tracks, new THREE.QuaternionKeyframeTrack(trackName, times, values));
}

function setQuaternionDegrees(tracks, clip, nodeName, samples) {
  setQuaternionTrack(tracks, clip, nodeName, samples.map(([time, x, y, z]) => [
    time,
    THREE.MathUtils.degToRad(x),
    THREE.MathUtils.degToRad(y),
    THREE.MathUtils.degToRad(z)
  ]));
}

function setVectorTrack(tracks, clip, nodeName, property, samples) {
  const trackName = `${nodeName}.${property}`;
  const times = new Float32Array(samples.map(([fraction]) => fraction * clip.duration));
  const values = new Float32Array(samples.length * 3);
  for (let index = 0; index < samples.length; index += 1) {
    values.set(samples[index].slice(1, 4), index * 3);
  }
  replaceTrack(tracks, new THREE.VectorKeyframeTrack(trackName, times, values));
}

function setNumberValuesTrack(tracks, clip, nodeName, samples) {
  const trackName = `${nodeName}.morphTargetInfluences`;
  const times = new Float32Array(samples.map(([fraction]) => fraction * clip.duration));
  const values = new Float32Array(samples.flatMap(([, entries]) => entries));
  replaceTrack(tracks, new THREE.NumberKeyframeTrack(trackName, times, values));
}

function setSleepMorph(tracks, clip, samples) {
  setNumberValuesTrack(tracks, clip, 'NiulaiChildContinuous', samples.map(
    ([time, blink, mouth]) => [time, [blink, blink, mouth, 0, 0]]
  ));
  for (const side of ['L', 'R']) {
    for (const part of ['EyeWhite', 'Iris', 'Pupil', 'EyeHighlight']) {
      setNumberValuesTrack(tracks, clip, `${part}${side}`, samples.map(
        ([time, blink]) => [time, [blink]]
      ));
    }
  }
}

function settledGestureDegrees(x, y, z) {
  return [
    [0, 0, 0, 0],
    [0.12, -x * 0.06, -y * 0.06, -z * 0.06],
    [0.30, x * 1.06, y * 1.06, z * 1.06],
    [0.72, x, y, z],
    [0.88, x * 0.94, y * 0.94, z * 0.94],
    [1, 0, 0, 0]
  ];
}

function authorLocomotion(clip, tracks) {
  if (clip.name !== 'walk' && clip.name !== 'run') return;
  const run = clip.name === 'run';
  const phase = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const samples = (xValues, yValues = phase.map(() => 0), zValues = phase.map(() => 0)) =>
    phase.map((time, index) => [time, xValues[index], yValues[index], zValues[index]]);
  const mirrorPhase = (values) => [...values.slice(4), ...values.slice(1, 5)];

  const thigh = run
    ? [28, 20, 4, -22, -28, -16, 5, 24, 28]
    : [23, 14, 2, -16, -23, -12, 3, 18, 23];
  const shin = run
    ? [6, 5, 16, 44, 52, 32, 14, 7, 6]
    : [8, 4, 9, 31, 38, 22, 8, 4, 8];
  const foot = run
    ? [-8, -4, 6, -10, -18, -7, 8, 1, -8]
    : [-10, -4, 5, -8, -15, -6, 7, 1, -10];
  const toe = run
    ? [5, 14, 4, -4, -2, 18, 7, -2, 5]
    : [3, 11, 3, -2, -1, 13, 5, -1, 3];
  const arm = run
    ? [-24, -17, -4, 17, 25, 16, 3, -19, -24]
    : [-18, -11, -2, 12, 18, 10, 2, -13, -18];
  const elbow = run
    ? [-32, -38, -43, -37, -30, -36, -42, -38, -32]
    : [-11, -15, -18, -14, -10, -14, -18, -15, -11];

  setQuaternionDegrees(tracks, clip, 'thigh_l', samples(thigh));
  setQuaternionDegrees(tracks, clip, 'thigh_r', samples(mirrorPhase(thigh)));
  setQuaternionDegrees(tracks, clip, 'shin_l', samples(shin));
  setQuaternionDegrees(tracks, clip, 'shin_r', samples(mirrorPhase(shin)));
  setQuaternionDegrees(tracks, clip, 'foot_l', samples(foot));
  setQuaternionDegrees(tracks, clip, 'foot_r', samples(mirrorPhase(foot)));
  setQuaternionDegrees(tracks, clip, 'toe_l', samples(toe));
  setQuaternionDegrees(tracks, clip, 'toe_r', samples(mirrorPhase(toe)));
  setQuaternionDegrees(tracks, clip, 'upperarm_l', samples(arm, phase.map(() => 0), phase.map(() => -2)));
  setQuaternionDegrees(tracks, clip, 'upperarm_r', samples(mirrorPhase(arm), phase.map(() => 0), phase.map(() => 2)));
  setQuaternionDegrees(tracks, clip, 'lowerarm_l', samples(elbow));
  setQuaternionDegrees(tracks, clip, 'lowerarm_r', samples(mirrorPhase(elbow)));

  const pelvisY = run
    ? [0.800, 0.812, 0.832, 0.870, 0.800, 0.812, 0.832, 0.870, 0.800]
    : [0.825, 0.808, 0.818, 0.842, 0.825, 0.808, 0.818, 0.842, 0.825];
  const pelvisX = run
    ? [-0.012, -0.018, 0, 0.018, 0.012, 0.018, 0, -0.018, -0.012]
    : [-0.008, -0.012, 0, 0.012, 0.008, 0.012, 0, -0.012, -0.008];
  setVectorTrack(tracks, clip, 'pelvis', 'position', phase.map((time, index) => [
    time, pelvisX[index], pelvisY[index], run ? -0.018 : -0.006
  ]));
  const hipYaw = run ? 5 : 3.2;
  const hipRoll = run ? 3.2 : 2.0;
  setQuaternionDegrees(tracks, clip, 'pelvis', samples(
    phase.map(() => run ? -2 : -0.8),
    [-hipYaw, -hipYaw * 0.65, 0, hipYaw * 0.65, hipYaw, hipYaw * 0.65, 0, -hipYaw * 0.65, -hipYaw],
    [-hipRoll, 0, hipRoll, 0, -hipRoll, 0, hipRoll, 0, -hipRoll]
  ));
  const lean = run ? -7 : -2.2;
  const chestYaw = run ? 4.5 : 3.0;
  setQuaternionDegrees(tracks, clip, 'chest', samples(
    phase.map(() => lean),
    [chestYaw, chestYaw * 0.6, 0, -chestYaw * 0.6, -chestYaw, -chestYaw * 0.6, 0, chestYaw * 0.6, chestYaw],
    [1.5, 0, -1.5, 0, 1.5, 0, -1.5, 0, 1.5]
  ));
  setQuaternionDegrees(tracks, clip, 'head', samples(
    phase.map(() => run ? 3.5 : 1.2),
    phase.map(() => 0),
    [-1, 0, 1, 0, -1, 0, 1, 0, -1]
  ));
  const tail = run ? 9 : 6;
  setQuaternionDegrees(tracks, clip, 'tail_01', samples(
    phase.map(() => 0),
    [-tail, -tail * 0.5, 0, tail * 0.5, tail, tail * 0.5, 0, -tail * 0.5, -tail]
  ));
}

const SLEEP_ROOT_EULER = [-16, 0, -82];
const SLEEP_ROOT_POSITION = [-0.81, 0.61, 0.035];
const SLEEP_LIMB_POSITION_OFFSETS = {};
const SLEEP_POSE = {
  pelvis: [4, -6, -2],
  spine_01: [-4, 2, -3],
  spine_02: [-5, -2, 3],
  chest: [-6, 1, -2],
  neck: [4, 1, 3],
  head: [-5, -4, 4],
  jaw: [5, 0, 0],
  ear_l: [0, -4, -11],
  ear_r: [0, 4, 9],
  clavicle_l: [1, -12, 16],
  clavicle_r: [-1, 12, -16],
  upperarm_l: [-22, -26, -56],
  upperarm_r: [-20, 26, 58],
  lowerarm_l: [-16, -14, 10],
  lowerarm_r: [-18, 14, -12],
  hand_l: [6, -28, -10],
  hand_r: [8, 28, 12],
  thumb_01_l: [12, 0, 4],
  thumb_01_r: [10, 0, -4],
  index_01_l: [10, 0, 0],
  index_01_r: [12, 0, 0],
  middle_01_l: [14, 0, 0],
  middle_01_r: [16, 0, 0],
  thigh_l: [10, -25, -34],
  thigh_r: [-8, 25, 36],
  shin_l: [14, 4, 8],
  shin_r: [16, -4, -10],
  foot_l: [-9, -4, -4],
  foot_r: [-8, 4, 6],
  toe_l: [7, 0, 0],
  toe_r: [5, 0, 0],
  tail_01: [0, 14, -4],
  tail_02: [0, -9, 3],
  belly_side_l: [-2, -2, -3],
  belly_side_r: [-2, 2, 3],
  flank_dfrm_l: [-2, -2, -2],
  flank_dfrm_r: [-2, 2, 2],
  armpit_dfrm_l: [-3, -4, -12],
  armpit_dfrm_r: [-3, 4, 13],
  upperarm_soft_l: [-5, -4, -7],
  upperarm_soft_r: [-5, 4, 8],
  groin_dfrm_l: [2, -3, -7],
  groin_dfrm_r: [-1, 3, 8],
  inner_thigh_dfrm_l: [4, -2, -3],
  inner_thigh_dfrm_r: [5, 2, 4],
  elbow_soft_l: [-5, -2, 4],
  elbow_soft_r: [-6, 2, -5],
  knee_soft_l: [4, 0, 2],
  knee_soft_r: [5, 0, -2]
};

function sleepMotionProfile(name, mode) {
  const isLeft = name.endsWith('_l');
  const isRight = name.endsWith('_r');
  const isArm = /(clavicle|upperarm|lowerarm|hand|thumb|index|middle|armpit|elbow)/.test(name);
  const isLeg = /(thigh|shin|foot|toe|groin|knee)/.test(name);
  const isDigit = /(thumb|index|middle|toe)/.test(name);
  const isHead = /(neck|head|jaw|ear)/.test(name);
  if (mode === 'enter') {
    if (isDigit) return { start: isLeft ? 0.46 : 0.41, end: 0.96, anticipation: 0.015 };
    if (isArm) return { start: isLeft ? 0.28 : 0.22, end: isLeft ? 0.93 : 0.89, anticipation: 0.035 };
    if (isLeg) return { start: isLeft ? 0.35 : 0.30, end: isLeft ? 0.95 : 0.91, anticipation: 0.025 };
    if (isHead) return { start: 0.18, end: 0.90, anticipation: 0.020 };
    if (name.startsWith('tail')) return { start: 0.24, end: 0.92, anticipation: 0.025 };
    return { start: 0.12, end: 0.87, anticipation: 0.018 };
  }
  if (isDigit) return { start: 0.08, end: isLeft ? 0.68 : 0.63, anticipation: 0.015 };
  if (isHead) return { start: 0.05, end: 0.58, anticipation: 0.020 };
  if (isArm) return { start: isLeft ? 0.20 : 0.15, end: isLeft ? 0.82 : 0.76, anticipation: 0.025 };
  if (isLeg) return { start: isLeft ? 0.32 : 0.27, end: isLeft ? 0.92 : 0.88, anticipation: 0.020 };
  if (name.startsWith('tail')) return { start: 0.12, end: 0.74, anticipation: 0.018 };
  return { start: 0.18, end: 0.88, anticipation: 0.018 };
}

function sleepPoseSamples(name, pose, mode) {
  const [x, y, z] = pose;
  const times = [0, 0.08, 0.16, 0.26, 0.38, 0.52, 0.66, 0.78, 0.88, 0.95, 1];
  const profile = sleepMotionProfile(name, mode);
  return times.map((time) => {
    let amount;
    if (mode === 'enter') {
      if (time < profile.start) {
        const phase = time / Math.max(profile.start, 0.001);
        amount = -Math.sin(phase * Math.PI) * profile.anticipation;
      } else {
        amount = smoothstep(profile.start, profile.end, time);
        if (time > profile.end && time < 1) {
          amount += Math.sin((time - profile.end) / (1 - profile.end) * Math.PI) * 0.018;
        }
      }
      if (time === 1) amount = 1;
    } else {
      amount = 1 - smoothstep(profile.start, profile.end, time);
      if (time > profile.end && time < 1) {
        amount -= Math.sin((time - profile.end) / (1 - profile.end) * Math.PI) * profile.anticipation;
      }
      if (time === 0) amount = 1;
      if (time === 1) amount = 0;
    }
    return [time, x * amount, y * amount, z * amount];
  });
}

function sleepLoopPoseSamples(name, pose) {
  const [x, y, z] = pose;
  const core = /(spine|chest|flank|belly)/.test(name);
  const head = /(neck|head|jaw|ear)/.test(name);
  const distal = /(hand|foot|toe|tail)/.test(name);
  const phase = name.endsWith('_l') ? 0.22 : name.endsWith('_r') ? -0.18 : 0;
  const amplitude = core ? 0.75 : head ? 0.42 : distal ? 0.18 : 0.10;
  return [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((time) => {
    const wave = Math.sin(time * Math.PI * 2 + phase) - Math.sin(phase);
    return [time, x - wave * amplitude, y + wave * amplitude * 0.18, z + wave * amplitude * 0.42];
  });
}

function sleepPositionSamples(name, offset, mode) {
  const bindPosition = boneByName.get(name)?.position;
  if (!bindPosition) throw new Error(`Missing sleep position bone: ${name}`);
  return sleepPoseSamples(name, offset, mode).map(([time, x, y, z]) => [
    time,
    bindPosition.x + x,
    bindPosition.y + y,
    bindPosition.z + z
  ]);
}

function sleepLoopPositionSamples(name, offset) {
  const bindPosition = boneByName.get(name)?.position;
  if (!bindPosition) throw new Error(`Missing sleep position bone: ${name}`);
  const position = [
    bindPosition.x + offset[0],
    bindPosition.y + offset[1],
    bindPosition.z + offset[2]
  ];
  return [[0, ...position], [1, ...position]];
}

function authorSleepAction(clip, tracks) {
  if (!['sleep_enter', 'sleep_loop', 'wake_up'].includes(clip.name)) return false;
  if (clip.name === 'sleep_enter') {
    setQuaternionDegrees(tracks, clip, 'root', [
      [0, 0, 0, 0], [0.10, 1, -1, 2], [0.22, 2, -3, 5],
      [0.34, -2, -7, -7], [0.48, -8, -7, -29], [0.62, -14, -5, -53],
      [0.76, -18, -3, -73], [0.88, -18, -1, -82],
      [0.95, -15, 0, -83.5], [1, ...SLEEP_ROOT_EULER]
    ]);
    setVectorTrack(tracks, clip, 'root', 'position', [
      [0, 0, 0, 0], [0.10, 0.008, -0.012, 0], [0.22, 0.018, -0.040, -0.008],
      [0.34, -0.055, 0.012, 0], [0.48, -0.22, 0.14, 0.010],
      [0.62, -0.43, 0.33, 0.022], [0.76, -0.66, 0.52, 0.034],
      [0.88, -0.82, 0.63, 0.041], [0.95, -0.83, 0.62, 0.038],
      [1, ...SLEEP_ROOT_POSITION]
    ]);
    for (const [name, pose] of Object.entries(SLEEP_POSE)) {
      setQuaternionDegrees(tracks, clip, name, sleepPoseSamples(name, pose, 'enter'));
    }
    for (const [name, offset] of Object.entries(SLEEP_LIMB_POSITION_OFFSETS)) {
      setVectorTrack(tracks, clip, name, 'position', sleepPositionSamples(name, offset, 'enter'));
    }
    setSleepMorph(tracks, clip, [
      [0, 0, 0], [0.34, 0, 0], [0.52, 0.25, 0.02],
      [0.68, 1, 0.055], [1, 1, 0.065]
    ]);
  } else if (clip.name === 'sleep_loop') {
    setQuaternionDegrees(tracks, clip, 'root', [
      [0, ...SLEEP_ROOT_EULER], [1, ...SLEEP_ROOT_EULER]
    ]);
    setVectorTrack(tracks, clip, 'root', 'position', [
      [0, ...SLEEP_ROOT_POSITION], [1, ...SLEEP_ROOT_POSITION]
    ]);
    for (const [name, pose] of Object.entries(SLEEP_POSE)) {
      setQuaternionDegrees(tracks, clip, name, sleepLoopPoseSamples(name, pose));
    }
    for (const [name, offset] of Object.entries(SLEEP_LIMB_POSITION_OFFSETS)) {
      setVectorTrack(tracks, clip, name, 'position', sleepLoopPositionSamples(name, offset));
    }
    setVectorTrack(tracks, clip, 'spine_02', 'scale', [
      [0, 1, 1, 1], [0.125, 1.004, 1.009, 1.004], [0.25, 1.008, 1.019, 1.008],
      [0.375, 1.012, 1.028, 1.012], [0.50, 1.014, 1.034, 1.014],
      [0.625, 1.012, 1.028, 1.012], [0.75, 1.008, 1.019, 1.008],
      [0.875, 1.004, 1.009, 1.004], [1, 1, 1, 1]
    ]);
    for (const name of ['belly_side_l', 'belly_side_r', 'flank_dfrm_l', 'flank_dfrm_r']) {
      setVectorTrack(tracks, clip, name, 'scale', [
        [0, 1, 1, 1], [0.25, 1.006, 1.012, 1.006], [0.50, 1.012, 1.026, 1.012],
        [0.75, 1.006, 1.012, 1.006], [1, 1, 1, 1]
      ]);
    }
    setSleepMorph(tracks, clip, [
      [0, 1, 0.065], [0.25, 1, 0.075], [0.50, 1, 0.090],
      [0.75, 1, 0.075], [1, 1, 0.065]
    ]);
  } else {
    setQuaternionDegrees(tracks, clip, 'root', [
      [0, ...SLEEP_ROOT_EULER], [0.10, -17, -1, -83], [0.20, -18, -2, -80],
      [0.34, -15, -4, -65], [0.48, -10, -5, -43], [0.62, -5, -4, -22],
      [0.76, -1, -2, -7], [0.88, 1, 0, 2], [0.95, 0, 0, 1], [1, 0, 0, 0]
    ]);
    setVectorTrack(tracks, clip, 'root', 'position', [
      [0, ...SLEEP_ROOT_POSITION], [0.10, -0.82, 0.62, 0.038],
      [0.20, -0.79, 0.60, 0.034], [0.34, -0.62, 0.49, 0.027],
      [0.48, -0.42, 0.33, 0.018], [0.62, -0.22, 0.16, 0.008],
      [0.76, -0.07, 0.035, 0], [0.88, 0.012, -0.014, 0],
      [0.95, 0.004, -0.004, 0], [1, 0, 0, 0]
    ]);
    for (const [name, pose] of Object.entries(SLEEP_POSE)) {
      setQuaternionDegrees(tracks, clip, name, sleepPoseSamples(name, pose, 'wake'));
    }
    for (const [name, offset] of Object.entries(SLEEP_LIMB_POSITION_OFFSETS)) {
      setVectorTrack(tracks, clip, name, 'position', sleepPositionSamples(name, offset, 'wake'));
    }
    setSleepMorph(tracks, clip, [
      [0, 1, 0.065], [0.22, 1, 0.04], [0.32, 0.18, 0.02],
      [0.40, 1, 0.02], [0.52, 0.08, 0], [0.64, 0, 0], [1, 0, 0]
    ]);
  }
  return true;
}

function authorActionTracks(clip, tracks) {
  authorLocomotion(clip, tracks);
  if (authorSleepAction(clip, tracks)) {
    return;
  } else if (clip.name === 'wave') {
    setQuaternionDegrees(tracks, clip, 'clavicle_r', settledGestureDegrees(0, -4, -7));
    setQuaternionDegrees(tracks, clip, 'upperarm_r', settledGestureDegrees(-55, -5, 24));
    setQuaternionDegrees(tracks, clip, 'lowerarm_r', [
      [0, 0, 0, 0], [0.14, 3, 0, 0], [0.27, -48, 0, 5],
      [0.42, -48, 0, 13], [0.56, -48, 0, -10], [0.70, -48, 0, 12],
      [0.82, -46, 0, -7], [0.90, -38, 0, 3], [1, 0, 0, 0]
    ]);
    setQuaternionDegrees(tracks, clip, 'hand_r', [
      [0, 0, 0, 0], [0.27, -7, 10, 8], [0.42, -7, -17, -10],
      [0.56, -7, 17, 11], [0.70, -7, -16, -10], [0.82, -5, 12, 8],
      [0.90, -3, 5, 3], [1, 0, 0, 0]
    ]);
    setQuaternionDegrees(tracks, clip, 'index_01_r', settledGestureDegrees(9, 0, 0));
    setQuaternionDegrees(tracks, clip, 'middle_01_r', settledGestureDegrees(12, 0, 0));
    setQuaternionDegrees(tracks, clip, 'chest', settledGestureDegrees(-2, -4, 2.5));
    setQuaternionDegrees(tracks, clip, 'head', settledGestureDegrees(0, 5, -2));
  } else if (clip.name === 'point_screen') {
    setQuaternionDegrees(tracks, clip, 'hand_r', settledGestureDegrees(-5, -5, 1));
    setQuaternionDegrees(tracks, clip, 'index_02_r', settledGestureDegrees(3, 0, 0));
    setQuaternionDegrees(tracks, clip, 'middle_01_r', settledGestureDegrees(64, 0, 0));
    setQuaternionDegrees(tracks, clip, 'middle_02_r', settledGestureDegrees(46, 0, 0));
    setQuaternionDegrees(tracks, clip, 'thumb_01_r', settledGestureDegrees(26, 9, -8));
    setQuaternionDegrees(tracks, clip, 'chest', settledGestureDegrees(-2, -5, 1));
    setQuaternionDegrees(tracks, clip, 'head', settledGestureDegrees(0, 4, -1));
  } else if (clip.name === 'thumbs_up') {
    setQuaternionDegrees(tracks, clip, 'clavicle_r', settledGestureDegrees(0, -3, -5));
    setQuaternionDegrees(tracks, clip, 'upperarm_r', settledGestureDegrees(-38, -4, 18));
    setQuaternionDegrees(tracks, clip, 'lowerarm_r', settledGestureDegrees(-68, 0, 2));
    setQuaternionDegrees(tracks, clip, 'hand_r', settledGestureDegrees(-8, 8, -5));
    setQuaternionDegrees(tracks, clip, 'thumb_01_r', settledGestureDegrees(0, 0, -58));
    setQuaternionDegrees(tracks, clip, 'thumb_02_r', settledGestureDegrees(0, 0, -18));
    setQuaternionDegrees(tracks, clip, 'index_01_r', settledGestureDegrees(58, 0, 0));
    setQuaternionDegrees(tracks, clip, 'middle_01_r', settledGestureDegrees(64, 0, 0));
    setQuaternionDegrees(tracks, clip, 'chest', settledGestureDegrees(-2, -3, 1.5));
  } else if (clip.name === 'hold_head') {
    setQuaternionDegrees(tracks, clip, 'clavicle_l', settledGestureDegrees(0, 0, 7.5));
    setQuaternionDegrees(tracks, clip, 'clavicle_r', settledGestureDegrees(0, 0, -7.5));
    setQuaternionDegrees(tracks, clip, 'hand_l', settledGestureDegrees(-7, -14, -5));
    setQuaternionDegrees(tracks, clip, 'hand_r', settledGestureDegrees(-7, 14, 5));
    setQuaternionDegrees(tracks, clip, 'chest', settledGestureDegrees(3, 0, 0));
    setQuaternionDegrees(tracks, clip, 'head', settledGestureDegrees(4, 0, 0));
  } else if (clip.name === 'facepalm') {
    setQuaternionDegrees(tracks, clip, 'clavicle_r', settledGestureDegrees(0, 0, -6));
    setQuaternionDegrees(tracks, clip, 'hand_r', settledGestureDegrees(-5, -19, 7));
    setQuaternionDegrees(tracks, clip, 'chest', settledGestureDegrees(5, 0, -1.5));
  } else if (clip.name === 'shrug') {
    setQuaternionDegrees(tracks, clip, 'clavicle_l', settledGestureDegrees(0, 0, 15));
    setQuaternionDegrees(tracks, clip, 'clavicle_r', settledGestureDegrees(0, 0, -15));
    setQuaternionDegrees(tracks, clip, 'upperarm_l', settledGestureDegrees(-16, 0, -26));
    setQuaternionDegrees(tracks, clip, 'upperarm_r', settledGestureDegrees(-16, 0, 26));
    setQuaternionDegrees(tracks, clip, 'lowerarm_l', settledGestureDegrees(-15, 0, 8));
    setQuaternionDegrees(tracks, clip, 'lowerarm_r', settledGestureDegrees(-15, 0, -8));
    setQuaternionDegrees(tracks, clip, 'hand_l', settledGestureDegrees(5, -22, -18));
    setQuaternionDegrees(tracks, clip, 'hand_r', settledGestureDegrees(5, 22, 18));
    setQuaternionDegrees(tracks, clip, 'chest', settledGestureDegrees(-3, 0, 0));
    setQuaternionDegrees(tracks, clip, 'head', settledGestureDegrees(0, 6, 3));
  } else if (clip.name === 'jump') {
    setVectorTrack(tracks, clip, 'root', 'position', [
      [0, 0, 0, 0], [0.18, 0, -0.045, 0], [0.46, 0, 0.255, 0],
      [0.70, 0, 0.18, 0], [0.84, 0, -0.025, 0], [1, 0, 0, 0]
    ]);
    for (const side of ['l', 'r']) {
      const sign = side === 'l' ? -1 : 1;
      setQuaternionDegrees(tracks, clip, `upperarm_${side}`, [
        [0, 0, 0, 0], [0.18, 10, 0, sign * 3], [0.46, -34, 0, sign * 10],
        [0.70, -20, 0, sign * 7], [0.84, 7, 0, sign * 2], [1, 0, 0, 0]
      ]);
      setQuaternionDegrees(tracks, clip, `thigh_${side}`, [
        [0, 0, 0, 0], [0.18, -24, 0, 0], [0.46, 24, 0, sign * 3],
        [0.70, 12, 0, sign * 2], [0.84, -16, 0, 0], [1, 0, 0, 0]
      ]);
      setQuaternionDegrees(tracks, clip, `shin_${side}`, [
        [0, 0, 0, 0], [0.18, 34, 0, 0], [0.46, 44, 0, 0],
        [0.70, 30, 0, 0], [0.84, 25, 0, 0], [1, 0, 0, 0]
      ]);
      setQuaternionDegrees(tracks, clip, `foot_${side}`, [
        [0, 0, 0, 0], [0.18, -12, 0, 0], [0.46, -18, 0, 0],
        [0.70, 4, 0, 0], [0.84, 8, 0, 0], [1, 0, 0, 0]
      ]);
    }
    setQuaternionDegrees(tracks, clip, 'chest', [
      [0, 0, 0, 0], [0.18, 6, 0, 0], [0.46, -8, 0, 0],
      [0.70, -4, 0, 0], [0.84, 7, 0, 0], [1, 0, 0, 0]
    ]);
  } else if (clip.name === 'idle_breathe') {
    setQuaternionDegrees(tracks, clip, 'chest', [
      [0, 0, 0, 0], [0.5, -1.3, 0, 0.6], [1, 0, 0, 0]
    ]);
    setQuaternionDegrees(tracks, clip, 'clavicle_l', [
      [0, 0, 0, 0], [0.5, 0, 0, 0.8], [1, 0, 0, 0]
    ]);
    setQuaternionDegrees(tracks, clip, 'clavicle_r', [
      [0, 0, 0, 0], [0.5, 0, 0, -0.8], [1, 0, 0, 0]
    ]);
  } else if (clip.name === 'idle_look') {
    setQuaternionDegrees(tracks, clip, 'head', [
      [0, 0, 0, 0], [0.22, 0, -10, 1], [0.48, 0, -10, 1],
      [0.72, 0, 8, -1], [0.88, 0, 8, -1], [1, 0, 0, 0]
    ]);
    setQuaternionDegrees(tracks, clip, 'chest', [
      [0, 0, 0, 0], [0.22, 0, -2, 0], [0.48, 0, -2, 0],
      [0.72, 0, 1.5, 0], [0.88, 0, 1.5, 0], [1, 0, 0, 0]
    ]);
  } else if (clip.name === 'happy') {
    setQuaternionDegrees(tracks, clip, 'chest', [
      [0, 0, 0, 0], [0.17, -3, 0, -4], [0.34, 1, 0, 4],
      [0.52, -3, 0, -4], [0.70, 1, 0, 4], [0.86, -2, 0, -2], [1, 0, 0, 0]
    ]);
    setVectorTrack(tracks, clip, 'pelvis', 'position', [
      [0, 0, 0.82, 0], [0.17, 0, 0.84, 0], [0.34, 0, 0.82, 0],
      [0.52, 0, 0.84, 0], [0.70, 0, 0.82, 0], [0.86, 0, 0.83, 0], [1, 0, 0.82, 0]
    ]);
  }
}

const animations = rigGltf.animations.map((clip) => {
  const regularTracks = [];
  const morphTracks = [];
  for (const track of clip.tracks) {
    if (track.name === 'EyeWhiteL.morphTargetInfluences') {
      for (const target of ['EyeWhiteL', 'IrisL', 'PupilL', 'EyeHighlightL']) {
        const copy = track.clone();
        copy.name = `${target}.morphTargetInfluences`;
        regularTracks.push(copy);
      }
    } else if (track.name === 'EyeWhiteR.morphTargetInfluences') {
      for (const target of ['EyeWhiteR', 'IrisR', 'PupilR', 'EyeHighlightR']) {
        const copy = track.clone();
        copy.name = `${target}.morphTargetInfluences`;
        regularTracks.push(copy);
      }
    } else if (track.name === 'Muzzle.morphTargetInfluences') {
      morphTracks.push({ track, sourceNames: ['mouth_open', 'smile', 'frown'] });
    } else {
      regularTracks.push(track.clone());
    }
  }
  if (morphTracks.length) {
    const times = [...new Set(morphTracks.flatMap(({ track }) => [...track.times]))].sort((a, b) => a - b);
    const values = new Float32Array(times.length * morphNames.length);
    const interpolants = morphTracks.map(({ track, sourceNames }) => ({
      sourceNames,
      interpolant: track.createInterpolant(new Float32Array(sourceNames.length))
    }));
    for (let timeIndex = 0; timeIndex < times.length; timeIndex += 1) {
      for (const { sourceNames, interpolant } of interpolants) {
        const sample = interpolant.evaluate(times[timeIndex]);
        for (let sourceIndex = 0; sourceIndex < sourceNames.length; sourceIndex += 1) {
          const targetIndex = morphNames.indexOf(sourceNames[sourceIndex]);
          if (targetIndex >= 0) values[timeIndex * morphNames.length + targetIndex] = sample[sourceIndex];
        }
      }
    }
    regularTracks.push(new THREE.NumberKeyframeTrack(
      'NiulaiChildContinuous.morphTargetInfluences',
      times,
      values
    ));
  }
  authorActionTracks(clip, regularTracks);
  return new THREE.AnimationClip(clip.name, clip.duration, regularTracks);
});

model.userData.rig = {
  version: 7,
  meshType: 'niulai_child_multiview_continuous',
  sourceReference: 'assets/concepts/niulai-child-turnaround-v1.png',
  basis: { up: '+Y', forward: '+Z', groundY: 0 },
  lookAt: { control: 'ctrl_look_at', head: 'head', eyes: ['eye_l', 'eye_r'] },
  ikChains: {
    hand_l: { target: 'ik_hand_l', pole: 'pole_elbow_l', chain: ['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l'] },
    hand_r: { target: 'ik_hand_r', pole: 'pole_elbow_r', chain: ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'] },
    foot_l: { target: 'ik_foot_l', pole: 'pole_knee_l', chain: ['thigh_l', 'shin_l', 'foot_l', 'toe_l'] },
    foot_r: { target: 'ik_foot_r', pole: 'pole_knee_r', chain: ['thigh_r', 'shin_r', 'foot_r', 'toe_r'] }
  },
  deformationDrivers: [
    { source: 'spine_01', response: 16, helpers: [{ name: 'abdomen_dfrm', weight: 0.26 }] },
    { source: 'chest', response: 16, helpers: [
      { name: 'sternum_dfrm', weight: 0.24 },
      { name: 'ribcage_dfrm_l', weight: 0.18 },
      { name: 'ribcage_dfrm_r', weight: 0.18 }
    ] },
    { source: 'head', response: 18, helpers: [{ name: 'neck_dfrm', weight: 0.30 }] },
    ...['l', 'r'].flatMap((side) => [
      { source: `upperarm_${side}`, response: 20, helpers: [
        { name: `scapula_dfrm_${side}`, weight: 0.14 },
        { name: `shoulder_cap_${side}`, weight: 0.28 }
      ] },
      { source: `lowerarm_${side}`, response: 22, helpers: [
        { name: `upperarm_twist_01_${side}`, weight: 0.16 },
        { name: `upperarm_twist_02_${side}`, weight: 0.34 },
        { name: `elbow_dfrm_${side}`, weight: 0.50 }
      ] },
      { source: `hand_${side}`, response: 24, helpers: [
        { name: `forearm_twist_01_${side}`, weight: 0.18 },
        { name: `forearm_twist_02_${side}`, weight: 0.38 },
        { name: `wrist_dfrm_${side}`, weight: 0.50 },
        { name: `palm_dfrm_${side}`, weight: 0.34 }
      ] },
      { source: `thigh_${side}`, response: 20, helpers: [
        { name: `hip_dfrm_${side}`, weight: 0.16 },
        { name: `glute_dfrm_${side}`, weight: 0.24 }
      ] },
      { source: `shin_${side}`, response: 22, helpers: [
        { name: `thigh_twist_01_${side}`, weight: 0.14 },
        { name: `thigh_twist_02_${side}`, weight: 0.30 },
        { name: `knee_dfrm_${side}`, weight: 0.52 }
      ] },
      { source: `foot_${side}`, response: 24, helpers: [
        { name: `shin_twist_01_${side}`, weight: 0.16 },
        { name: `shin_twist_02_${side}`, weight: 0.34 },
        { name: `ankle_dfrm_${side}`, weight: 0.46 },
        { name: `heel_dfrm_${side}`, weight: 0.34 }
      ] },
      { source: `toe_${side}`, response: 26, helpers: [
        { name: `toe_roll_${side}`, weight: 0.56 }
      ] }
    ])
  ]
};

scene.updateMatrixWorld(true);
const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(scene, {
  binary: true,
  animations,
  onlyVisible: true,
  truncateDrawRange: true,
  trs: true
});
await fs.writeFile(OUTPUT, Buffer.from(arrayBuffer));

const triangleCount = geometry.index
  ? geometry.index.count / 3
  : geometry.getAttribute('position').count / 3;
console.log(JSON.stringify({
  output: OUTPUT,
  bytes: arrayBuffer.byteLength,
  meshType: model.userData.rig.meshType,
  vertices: position.count,
  triangles: Math.round(triangleCount),
  bones: bones.length,
  animations: animations.length,
  morphTargets: morphNames,
  deformationDrivers: model.userData.rig.deformationDrivers.length,
  removedBridgeFaces
}, null, 2));
