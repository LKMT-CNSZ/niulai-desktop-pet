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
const SOURCE_MESH = path.join(PROJECT_ROOT, '.tools', 'results', 'bull-continuous-prepared.glb');
const OUTPUT = path.join(PROJECT_ROOT, 'assets', 'models', 'bull-rigged-continuous.glb');

async function loadGlb(filePath) {
  const buffer = await fs.readFile(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new GLTFLoader().parseAsync(arrayBuffer, '');
}

const [rigGltf, meshGltf] = await Promise.all([loadGlb(SOURCE_RIG), loadGlb(SOURCE_MESH)]);
const loadedRigRoot = rigGltf.scene;
const model = loadedRigRoot.getObjectByName('NiulaiRiggedBull') || loadedRigRoot.children[0];
loadedRigRoot.remove(model);
const scene = new THREE.Scene();
scene.name = 'NiulaiContinuousRiggedBullScene';
scene.add(model);
model.name = 'NiulaiContinuousRiggedBull';

let sourceSkeleton = null;
const obsoleteMeshes = [];
scene.traverse((object) => {
  if (!object.isMesh) return;
  if (!sourceSkeleton && object.isSkinnedMesh) sourceSkeleton = object.skeleton;
  obsoleteMeshes.push(object);
});
if (!sourceSkeleton) throw new Error('The fallback rig does not contain a skeleton');
for (const object of obsoleteMeshes) object.parent?.remove(object);

let sourceMesh = null;
meshGltf.scene.traverse((object) => {
  if (!sourceMesh && object.isMesh) sourceMesh = object;
});
if (!sourceMesh) throw new Error('The prepared continuous model does not contain a mesh');

const geometry = sourceMesh.geometry.clone();
geometry.name = 'NiulaiContinuousSculptGeometry';
geometry.computeVertexNormals();

const bones = sourceSkeleton.bones;
const boneIndex = new Map(bones.map((bone, index) => [bone.name, index]));
const required = [
  'pelvis', 'spine_01', 'spine_02', 'chest', 'neck', 'head', 'jaw',
  'ear_l', 'ear_r', 'eye_l', 'eye_r', 'brow_l', 'brow_r',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'shin_l', 'foot_l', 'thigh_r', 'shin_r', 'foot_r',
  'tail_01', 'tail_02', 'tail_03', 'tail_04'
];
for (const name of required) {
  if (!boneIndex.has(name)) throw new Error(`Missing required source bone: ${name}`);
}

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
  const total = [...merged.values()].reduce((sum, weight) => sum + weight, 0) || 1;
  for (const [name, weight] of merged) {
    denseWeights[vertex * bones.length + boneIndex.get(name)] = weight / total;
  }
}

function yBlend(lower, upper, centre, width, y) {
  const upperWeight = smoothstep(centre - width, centre + width, y);
  return [[lower, 1 - upperWeight], [upper, upperWeight]];
}

for (let vertex = 0; vertex < position.count; vertex += 1) {
  const x = position.getX(vertex);
  const y = position.getY(vertex);
  const z = position.getZ(vertex);
  const side = x < 0 ? 'l' : 'r';
  const absX = Math.abs(x);

  const isTail = z < -0.31 && y < 1.12 && absX < 0.20;
  const isEar = y > 1.79 && absX > 0.37;
  const isJaw = y > 1.42 && y < 1.78 && z > 0.18 && absX < 0.38;
  const isEye = y > 1.86 && y < 2.01 && z > 0.25 && absX > 0.035 && absX < 0.27;
  const isArm = y > 0.43 && y < 1.57 && absX > 0.29;
  const isLeg = y < 0.88 && absX > 0.08;

  if (isTail) {
    if (y > 0.88) storeInfluences(vertex, yBlend('tail_02', 'tail_01', 0.98, 0.08, y));
    else if (y > 0.69) storeInfluences(vertex, yBlend('tail_03', 'tail_02', 0.79, 0.07, y));
    else storeInfluences(vertex, yBlend('tail_04', 'tail_03', 0.56, 0.09, y));
  } else if (isEar) {
    storeInfluences(vertex, [[`ear_${side}`, 0.90], ['head', 0.10]]);
  } else if (isEye) {
    const eyeName = x < 0 ? 'eye_l' : 'eye_r';
    const browName = x < 0 ? 'brow_l' : 'brow_r';
    const browWeight = smoothstep(1.965, 2.045, y) * 0.65;
    storeInfluences(vertex, [[eyeName, 0.65 * (1 - browWeight)], [browName, browWeight], ['head', 0.35]]);
  } else if (isJaw) {
    const jawWeight = (1 - smoothstep(1.67, 1.82, y)) * smoothstep(0.18, 0.36, z);
    storeInfluences(vertex, [['jaw', 0.82 * jawWeight], ['head', 1 - 0.82 * jawWeight]]);
  } else if (isArm) {
    const armWeight = smoothstep(0.29, 0.51, absX);
    const bodyBone = y > 1.30 ? 'chest' : y > 1.08 ? 'spine_02' : 'pelvis';
    let armEntries;
    if (y < 0.76) armEntries = yBlend(`hand_${side}`, `lowerarm_${side}`, 0.68, 0.10, y);
    else if (y < 1.16) armEntries = yBlend(`lowerarm_${side}`, `upperarm_${side}`, 1.04, 0.14, y);
    else armEntries = yBlend(`upperarm_${side}`, `clavicle_${side}`, 1.43, 0.11, y);
    storeInfluences(vertex, [
      ...armEntries.map(([name, weight]) => [name, weight * armWeight]),
      [bodyBone, 1 - armWeight]
    ]);
  } else if (isLeg) {
    if (y < 0.23) storeInfluences(vertex, yBlend(`foot_${side}`, `shin_${side}`, 0.20, 0.055, y));
    else if (y < 0.54) storeInfluences(vertex, yBlend(`shin_${side}`, `thigh_${side}`, 0.48, 0.10, y));
    else storeInfluences(vertex, [[`thigh_${side}`, 0.86], ['pelvis', 0.14]]);
  } else if (y > 1.55) {
    storeInfluences(vertex, yBlend('neck', 'head', 1.70, 0.12, y));
  } else if (y > 1.30) {
    storeInfluences(vertex, yBlend('spine_02', 'chest', 1.40, 0.12, y));
  } else if (y > 1.06) {
    storeInfluences(vertex, yBlend('spine_01', 'spine_02', 1.18, 0.10, y));
  } else {
    storeInfluences(vertex, yBlend('pelvis', 'spine_01', 0.98, 0.10, y));
  }
}

// Diffuse the initial anatomical weights over actual mesh adjacency.  The
// reconstructed body is one connected organic surface, so a hard torso/limb
// threshold would tear into long spikes during large arm gestures.
const neighbours = Array.from({ length: position.count }, () => new Set());
const index = geometry.getIndex();
if (!index) throw new Error('Continuous mesh must be indexed before rigging');
for (let offset = 0; offset < index.count; offset += 3) {
  const a = index.getX(offset);
  const b = index.getX(offset + 1);
  const c = index.getX(offset + 2);
  neighbours[a].add(b); neighbours[a].add(c);
  neighbours[b].add(a); neighbours[b].add(c);
  neighbours[c].add(a); neighbours[c].add(b);
}

let smoothed = denseWeights;
for (let iteration = 0; iteration < 16; iteration += 1) {
  const next = new Float32Array(smoothed.length);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const adjacent = neighbours[vertex];
    const alpha = adjacent.size ? 0.42 : 0;
    for (let bone = 0; bone < bones.length; bone += 1) {
      let average = 0;
      for (const neighbour of adjacent) average += smoothed[neighbour * bones.length + bone];
      if (adjacent.size) average /= adjacent.size;
      next[vertex * bones.length + bone] =
        smoothed[vertex * bones.length + bone] * (1 - alpha) + average * alpha;
    }
  }
  smoothed = next;
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
  const frontWeight = smoothstep(0.20, 0.38, z);

  for (const [targetIndex, sideSign] of [[0, -1], [1, 1]]) {
    const centreX = sideSign * 0.14;
    const ellipse = ((x - centreX) / 0.12) ** 2 + ((y - 1.94) / 0.065) ** 2;
    const weight = Math.max(0, 1 - ellipse) * frontWeight;
    morphArrays[targetIndex][vertex * 3 + 1] = -0.040 * weight;
    morphArrays[targetIndex][vertex * 3 + 2] = -0.012 * weight;
  }

  const muzzleEllipse = (x / 0.37) ** 2 + ((y - 1.64) / 0.28) ** 2;
  const muzzleWeight = Math.max(0, 1 - muzzleEllipse) * frontWeight;
  const lowerWeight = 1 - smoothstep(1.63, 1.72, y);
  morphArrays[2][vertex * 3 + 1] = -0.105 * muzzleWeight * lowerWeight;
  morphArrays[2][vertex * 3 + 2] = 0.026 * muzzleWeight * lowerWeight;

  const cornerWeight = smoothstep(0.13, 0.29, Math.abs(x)) * (1 - smoothstep(0.29, 0.37, Math.abs(x)));
  const mouthBand = 1 - smoothstep(0.015, 0.075, Math.abs(y - 1.54));
  const expressionWeight = cornerWeight * mouthBand * frontWeight;
  morphArrays[3][vertex * 3 + 1] = 0.050 * expressionWeight;
  morphArrays[4][vertex * 3 + 1] = -0.050 * expressionWeight;
}
geometry.morphAttributes.position = morphArrays.map((array, index) => {
  const attribute = new THREE.Float32BufferAttribute(array, 3);
  attribute.name = morphNames[index];
  return attribute;
});
geometry.morphTargetsRelative = true;

const material = new THREE.MeshPhysicalMaterial({
  name: 'continuous_short_fur_vertex_colour',
  color: 0xf2bf82,
  vertexColors: true,
  roughness: 0.84,
  metalness: 0,
  sheen: 0.18,
  sheenColor: new THREE.Color(0xe5a55d),
  sheenRoughness: 0.90,
  clearcoat: 0.018,
  clearcoatRoughness: 0.96
});
material.userData.furSurface = true;

const continuousBull = new THREE.SkinnedMesh(geometry, material);
continuousBull.name = 'ContinuousBull';
continuousBull.castShadow = true;
continuousBull.receiveShadow = true;
continuousBull.frustumCulled = false;
continuousBull.morphTargetInfluences = new Array(morphNames.length).fill(0);
continuousBull.morphTargetDictionary = Object.fromEntries(morphNames.map((name, index) => [name, index]));
model.add(continuousBull);

const skeleton = new THREE.Skeleton(
  bones,
  sourceSkeleton.boneInverses.map((matrix) => matrix.clone())
);
continuousBull.bind(skeleton, new THREE.Matrix4());

const animations = rigGltf.animations.map((clip) => {
  const regularTracks = [];
  const morphTracks = [];
  for (const track of clip.tracks) {
    if (track.name === 'EyeWhiteL.morphTargetInfluences') {
      morphTracks.push({ track, sourceNames: ['blink_l'] });
    } else if (track.name === 'EyeWhiteR.morphTargetInfluences') {
      morphTracks.push({ track, sourceNames: ['blink_r'] });
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
          if (targetIndex >= 0) {
            values[timeIndex * morphNames.length + targetIndex] = sample[sourceIndex];
          }
        }
      }
    }
    regularTracks.push(new THREE.NumberKeyframeTrack(
      'ContinuousBull.morphTargetInfluences',
      times,
      values
    ));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, regularTracks);
});

model.userData.rig = {
  ...(model.userData.rig || {}),
  version: 4,
  meshType: 'continuous_reference_reconstruction',
  sourceReference: 'user_supplied_three_view',
  fallback: 'bull-rigged-primitive-v3.glb',
  basis: { up: '+Y', forward: '+Z', groundY: 0 }
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
  morphTargets: morphNames
}, null, 2));
