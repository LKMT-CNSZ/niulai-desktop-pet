import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from '../node_modules/three/examples/jsm/exporters/GLTFExporter.js';

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
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'assets', 'models', 'bull-rigged.glb');

const scene = new THREE.Scene();
scene.name = 'NiulaiRiggedBullScene';
const model = new THREE.Group();
model.name = 'NiulaiRiggedBull';
scene.add(model);

function furMaterial(name, color) {
  const material = new THREE.MeshPhysicalMaterial({
    name,
    color,
    roughness: 0.78,
    metalness: 0,
    sheen: 0.22,
    sheenColor: new THREE.Color(0xf1b86f),
    sheenRoughness: 0.84,
    clearcoat: 0.025,
    clearcoatRoughness: 0.92,
    vertexColors: true
  });
  material.userData.furSurface = true;
  return material;
}

const materials = {
  fur: furMaterial('fur_orange_yellow', 0xb96f25),
  furLight: furMaterial('fur_face_orange', 0xc67a2d),
  muzzle: new THREE.MeshStandardMaterial({ name: 'muzzle_warm_pink', color: 0xc77f7d, roughness: 0.82, metalness: 0 }),
  muzzleLight: new THREE.MeshStandardMaterial({ name: 'muzzle_soft_pink', color: 0xdf9b99, roughness: 0.78, metalness: 0 }),
  lip: new THREE.MeshStandardMaterial({ name: 'lip_soft_pink', color: 0xc98282, roughness: 0.84, metalness: 0 }),
  horn: new THREE.MeshStandardMaterial({ name: 'horn_rough_gray_brown', color: 0x8b8179, roughness: 0.98, metalness: 0, vertexColors: true }),
  hoof: new THREE.MeshStandardMaterial({ name: 'hoof_warm_gray', color: 0x756d66, roughness: 0.96, metalness: 0 }),
  hand: new THREE.MeshStandardMaterial({ name: 'hand_warm_taupe', color: 0xb58a72, roughness: 0.92, metalness: 0 }),
  eyeWhite: new THREE.MeshStandardMaterial({ name: 'eye_warm_white', color: 0xe7d8bd, roughness: 0.72, metalness: 0 }),
  pupil: new THREE.MeshStandardMaterial({ name: 'eye_dark', color: 0x241914, roughness: 0.8, metalness: 0 }),
  brow: new THREE.MeshStandardMaterial({ name: 'brow_near_black', color: 0x211510, roughness: 0.96, metalness: 0 }),
  innerEar: new THREE.MeshStandardMaterial({ name: 'inner_ear', color: 0xa96052, roughness: 0.88, metalness: 0 }),
  mouth: new THREE.MeshStandardMaterial({ name: 'mouth_line', color: 0x5b3334, roughness: 0.9, metalness: 0 }),
  mouthInterior: new THREE.MeshStandardMaterial({ name: 'mouth_interior', color: 0x321719, roughness: 0.96, metalness: 0 }),
  nostril: new THREE.MeshStandardMaterial({ name: 'nostril', color: 0x452b29, roughness: 0.9, metalness: 0 }),
  tailTip: new THREE.MeshStandardMaterial({ name: 'tail_tip', color: 0x51321e, roughness: 0.98, metalness: 0 })
};

const bones = [];
const boneByName = new Map();

function addBone(name, parent, position) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.copy(position);
  parent.add(bone);
  bones.push(bone);
  boneByName.set(name, bone);
  return bone;
}

const root = addBone('root', model, new THREE.Vector3(0, 0, 0));
const pelvis = addBone('pelvis', root, new THREE.Vector3(0, 0.82, 0));
const spine01 = addBone('spine_01', pelvis, new THREE.Vector3(0, 0.18, 0));
const spine02 = addBone('spine_02', spine01, new THREE.Vector3(0, 0.18, 0));
const chest = addBone('chest', spine02, new THREE.Vector3(0, 0.20, 0));
const neck = addBone('neck', chest, new THREE.Vector3(0, 0.15, 0.02));
const head = addBone('head', neck, new THREE.Vector3(0, 0.21, 0.04));
const jaw = addBone('jaw', head, new THREE.Vector3(0, -0.17, 0.23));
const earL = addBone('ear_l', head, new THREE.Vector3(-0.34, 0.10, 0.01));
const earR = addBone('ear_r', head, new THREE.Vector3(0.34, 0.10, 0.01));
const eyeL = addBone('eye_l', head, new THREE.Vector3(-0.14, 0.07, 0.34));
const eyeR = addBone('eye_r', head, new THREE.Vector3(0.14, 0.07, 0.34));
const eyelidL = addBone('eyelid_l', head, new THREE.Vector3(-0.15, 0.10, 0.37));
const eyelidR = addBone('eyelid_r', head, new THREE.Vector3(0.15, 0.10, 0.37));
const browL = addBone('brow_l', head, new THREE.Vector3(-0.16, 0.20, 0.36));
const browR = addBone('brow_r', head, new THREE.Vector3(0.16, 0.20, 0.36));

const clavicleL = addBone('clavicle_l', chest, new THREE.Vector3(-0.22, 0.04, 0));
const upperArmL = addBone('upperarm_l', clavicleL, new THREE.Vector3(-0.27, -0.03, 0));
const lowerArmL = addBone('lowerarm_l', upperArmL, new THREE.Vector3(-0.02, -0.31, 0.01));
const handL = addBone('hand_l', lowerArmL, new THREE.Vector3(0, -0.30, 0.04));
const handCompatL = addBone('hoof_hand_l', handL, new THREE.Vector3(0, 0, 0));
const thumbL = addBone('thumb_01_l', handL, new THREE.Vector3(0.07, -0.01, 0.04));
const indexL = addBone('index_01_l', handL, new THREE.Vector3(-0.04, -0.08, 0.03));
const middleL = addBone('middle_01_l', handL, new THREE.Vector3(0.03, -0.08, 0.03));
const clavicleR = addBone('clavicle_r', chest, new THREE.Vector3(0.22, 0.04, 0));
const upperArmR = addBone('upperarm_r', clavicleR, new THREE.Vector3(0.27, -0.03, 0));
const lowerArmR = addBone('lowerarm_r', upperArmR, new THREE.Vector3(0.02, -0.31, 0.01));
const handR = addBone('hand_r', lowerArmR, new THREE.Vector3(0, -0.30, 0.04));
const handCompatR = addBone('hoof_hand_r', handR, new THREE.Vector3(0, 0, 0));
const thumbR = addBone('thumb_01_r', handR, new THREE.Vector3(-0.07, -0.01, 0.04));
const indexR = addBone('index_01_r', handR, new THREE.Vector3(0.04, -0.08, 0.03));
const middleR = addBone('middle_01_r', handR, new THREE.Vector3(-0.03, -0.08, 0.03));

const thighL = addBone('thigh_l', pelvis, new THREE.Vector3(-0.23, -0.12, 0));
const shinL = addBone('shin_l', thighL, new THREE.Vector3(0, -0.27, 0.01));
const footL = addBone('foot_l', shinL, new THREE.Vector3(0, -0.25, 0.04));
const toeL = addBone('toe_l', footL, new THREE.Vector3(0, -0.02, 0.16));
const hoofL = addBone('hoof_l', footL, new THREE.Vector3(0, 0, 0.03));
const thighR = addBone('thigh_r', pelvis, new THREE.Vector3(0.23, -0.12, 0));
const shinR = addBone('shin_r', thighR, new THREE.Vector3(0, -0.27, 0.01));
const footR = addBone('foot_r', shinR, new THREE.Vector3(0, -0.25, 0.04));
const toeR = addBone('toe_r', footR, new THREE.Vector3(0, -0.02, 0.16));
const hoofR = addBone('hoof_r', footR, new THREE.Vector3(0, 0, 0.03));

const tail01 = addBone('tail_01', pelvis, new THREE.Vector3(0.05, 0.05, -0.35));
const tail02 = addBone('tail_02', tail01, new THREE.Vector3(0.07, -0.15, -0.14));
const tail03 = addBone('tail_03', tail02, new THREE.Vector3(0.07, -0.15, -0.11));
const tail04 = addBone('tail_04', tail03, new THREE.Vector3(0.05, -0.13, -0.08));

// Non-deforming animator controls are exported as part of the rig contract.
// GLB does not serialize DCC constraint graphs, so runtime/DCC adapters resolve
// these controls into two-bone IK and Look At constraints.
const lookAtControl = addBone('ctrl_look_at', root, new THREE.Vector3(0, 1.88, 1.75));
const handIkL = addBone('ik_hand_l', root, new THREE.Vector3(-0.51, 0.57, 0.08));
const handIkR = addBone('ik_hand_r', root, new THREE.Vector3(0.51, 0.57, 0.08));
const elbowPoleL = addBone('pole_elbow_l', root, new THREE.Vector3(-0.72, 1.02, -0.40));
const elbowPoleR = addBone('pole_elbow_r', root, new THREE.Vector3(0.72, 1.02, -0.40));
const footIkL = addBone('ik_foot_l', root, new THREE.Vector3(-0.23, 0.05, 0.12));
const footIkR = addBone('ik_foot_r', root, new THREE.Vector3(0.23, 0.05, 0.12));
const kneePoleL = addBone('pole_knee_l', root, new THREE.Vector3(-0.23, 0.48, 0.60));
const kneePoleR = addBone('pole_knee_r', root, new THREE.Vector3(0.23, 0.48, 0.60));

model.updateMatrixWorld(true);
const boneIndex = new Map(bones.map((bone, index) => [bone.name, index]));

function bakedGeometry(geometry, position, scale, rotation = new THREE.Euler()) {
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  const matrix = new THREE.Matrix4().compose(position, quaternion, scale);
  geometry.applyMatrix4(matrix);
  geometry.computeVertexNormals();
  return geometry;
}

function rigidSkin(geometry, boneName) {
  const index = boneIndex.get(boneName);
  if (index === undefined) throw new Error(`Unknown bone: ${boneName}`);
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let vertex = 0; vertex < count; vertex += 1) {
    indices[vertex * 4] = index;
    weights[vertex * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}

function blendedLimbSkin(geometry, upperBoneName, lowerBoneName, pivotY, blendWidth = 0.12) {
  const upperIndex = boneIndex.get(upperBoneName);
  const lowerIndex = boneIndex.get(lowerBoneName);
  if (upperIndex === undefined || lowerIndex === undefined) {
    throw new Error(`Unknown limb bones: ${upperBoneName}, ${lowerBoneName}`);
  }
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const y = geometry.attributes.position.getY(vertex);
    const upperWeight = THREE.MathUtils.smoothstep(
      y,
      pivotY - blendWidth,
      pivotY + blendWidth
    );
    indices.set([upperIndex, lowerIndex, 0, 0], vertex * 4);
    weights.set([upperWeight, 1 - upperWeight, 0, 0], vertex * 4);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}

function tailSkin(geometry) {
  const firstIndex = boneIndex.get('tail_01');
  const secondIndex = boneIndex.get('tail_02');
  const thirdIndex = boneIndex.get('tail_03');
  const fourthIndex = boneIndex.get('tail_04');
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const y = geometry.attributes.position.getY(vertex);
    if (y >= 0.72) {
      const firstWeight = THREE.MathUtils.smoothstep(y, 0.72, 0.84);
      indices.set([firstIndex, secondIndex, 0, 0], vertex * 4);
      weights.set([firstWeight, 1 - firstWeight, 0, 0], vertex * 4);
    } else if (y >= 0.56) {
      const secondWeight = THREE.MathUtils.smoothstep(y, 0.56, 0.72);
      indices.set([secondIndex, thirdIndex, 0, 0], vertex * 4);
      weights.set([secondWeight, 1 - secondWeight, 0, 0], vertex * 4);
    } else {
      const thirdWeight = THREE.MathUtils.smoothstep(y, 0.38, 0.56);
      indices.set([thirdIndex, fourthIndex, 0, 0], vertex * 4);
      weights.set([thirdWeight, 1 - thirdWeight, 0, 0], vertex * 4);
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}

function torsoSkin(geometry) {
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const pelvisIndex = boneIndex.get('pelvis');
  const spineIndex = boneIndex.get('spine_02');
  const chestIndex = boneIndex.get('chest');
  for (let vertex = 0; vertex < count; vertex += 1) {
    const y = geometry.attributes.position.getY(vertex);
    let first = pelvisIndex;
    let second = spineIndex;
    let blend = THREE.MathUtils.smoothstep(y, 0.76, 1.23);
    if (y > 1.18) {
      first = spineIndex;
      second = chestIndex;
      blend = THREE.MathUtils.smoothstep(y, 1.16, 1.58);
    }
    indices.set([first, second, 0, 0], vertex * 4);
    weights.set([1 - blend, blend, 0, 0], vertex * 4);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}

function addFurVariation(geometry, material) {
  if (!material?.userData?.furSurface) return;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const grain = Math.sin(x * 39.1 + y * 71.7 + z * 53.3) * 0.5 +
      Math.sin(x * 103.7 - y * 47.9 + z * 89.1) * 0.25;
    const upward = normal ? Math.max(0, normal.getY(index)) : 0;
    const warmth = THREE.MathUtils.clamp(0.94 + grain * 0.045 + upward * 0.025, 0.88, 1);
    colors[index * 3] = warmth;
    colors[index * 3 + 1] = THREE.MathUtils.clamp(warmth * 0.985, 0, 1);
    colors[index * 3 + 2] = THREE.MathUtils.clamp(warmth * 0.955, 0, 1);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

const skinnedMeshes = [];

function addPart({ name, geometry, material, bone, morphs = null, torso = false, skin = null }) {
  if (skin) skin(geometry);
  else if (torso) torsoSkin(geometry);
  else rigidSkin(geometry, bone);
  addFurVariation(geometry, material);
  if (morphs) {
    geometry.morphAttributes.position = [];
    for (const [morphName, mutate] of Object.entries(morphs)) {
      const source = geometry.attributes.position;
      const values = new Float32Array(source.array);
      for (let index = 0; index < source.count; index += 1) {
        const offset = index * 3;
        const changed = mutate(values[offset], values[offset + 1], values[offset + 2]);
        values[offset] = changed[0];
        values[offset + 1] = changed[1];
        values[offset + 2] = changed[2];
      }
      const attribute = new THREE.Float32BufferAttribute(values, 3);
      attribute.name = morphName;
      geometry.morphAttributes.position.push(attribute);
    }
    geometry.morphTargetsRelative = false;
  }
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  if (morphs) mesh.updateMorphTargets();
  model.add(mesh);
  skinnedMeshes.push(mesh);
  return mesh;
}

function sphere(name, center, scale, material, bone, segments = 28, morphs = null, torso = false) {
  return addPart({
    name,
    geometry: bakedGeometry(new THREE.SphereGeometry(1, segments, Math.max(10, Math.round(segments * 0.7))), center, scale),
    material,
    bone,
    morphs,
    torso
  });
}

function capsule(
  name,
  center,
  radius,
  length,
  material,
  bone,
  scale = new THREE.Vector3(1, 1, 1),
  rotation = new THREE.Euler(),
  skin = null,
  capSegments = 10,
  radialSegments = 20
) {
  return addPart({
    name,
    geometry: bakedGeometry(new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments), center, scale, rotation),
    material,
    bone,
    skin
  });
}

function cone(name, center, radius, height, material, bone, rotation = new THREE.Euler()) {
  return addPart({
    name,
    geometry: bakedGeometry(new THREE.ConeGeometry(radius, height, 24, 3), center, new THREE.Vector3(1, 1, 1), rotation),
    material,
    bone
  });
}

function organicTorsoGeometry() {
  const geometry = new THREE.SphereGeometry(1, 38, 28);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const sourceX = position.getX(index);
    const sourceY = position.getY(index);
    const sourceZ = position.getZ(index);
    const shoulder = Math.exp(-Math.pow((sourceY - 0.47) / 0.42, 2));
    const lowerBody = Math.exp(-Math.pow((sourceY + 0.18) / 0.62, 2));
    const width = 0.405 + shoulder * 0.095 + lowerBody * 0.030;
    const depth = 0.305 + shoulder * 0.025 + lowerBody * 0.025;
    const frontSoftness = sourceZ > 0 ? lowerBody * 0.018 * (1 - Math.abs(sourceY)) : 0;
    position.setXYZ(
      index,
      sourceX * width,
      1.08 + sourceY * 0.60,
      sourceZ * depth + frontSoftness
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function organicHeadGeometry() {
  const geometry = new THREE.SphereGeometry(1, 40, 30);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const sourceX = position.getX(index);
    const sourceY = position.getY(index);
    const sourceZ = position.getZ(index);
    const lowerTaper = THREE.MathUtils.smoothstep(sourceY, -0.92, 0.20);
    const templeWidth = 0.435 + lowerTaper * 0.095;
    const cheek = Math.exp(-Math.pow((sourceY + 0.18) / 0.48, 2)) * 0.022;
    const front = sourceZ > 0 ? 0.025 * (1 - Math.abs(sourceY)) : 0;
    position.setXYZ(
      index,
      sourceX * (templeWidth + cheek),
      1.86 + sourceY * 0.43,
      0.035 + sourceZ * 0.385 + front
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function hornGeometry(side) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.27, 2.12, 0.00),
    new THREE.Vector3(side * 0.34, 2.22, 0.005),
    new THREE.Vector3(side * 0.43, 2.31, 0.015),
    new THREE.Vector3(side * 0.46, 2.43, 0.025)
  ]);
  const geometry = new THREE.TubeGeometry(curve, 30, 0.068, 14, false);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const u = geometry.attributes.uv.getX(index);
    const center = curve.getPointAt(u);
    const taper = 1 - THREE.MathUtils.smoothstep(u, 0.10, 1) * 0.68;
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    position.setXYZ(
      index,
      center.x + (x - center.x) * taper,
      center.y + (y - center.y) * taper,
      center.z + (z - center.z) * taper
    );
    const speckle = 0.70 + (Math.sin(index * 19.7) * 0.5 + 0.5) * 0.28;
    colors.set([speckle, speckle * 0.96, speckle * 0.90], index * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function organicTailGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.045, 0.86, -0.36),
    new THREE.Vector3(0.09, 0.73, -0.47),
    new THREE.Vector3(0.15, 0.57, -0.59),
    new THREE.Vector3(0.22, 0.40, -0.69),
    new THREE.Vector3(0.26, 0.29, -0.75)
  ]);
  return new THREE.TubeGeometry(curve, 36, 0.043, 12, false);
}

// One continuous torso removes the old stacked-sphere seams. Its lower width is
// deliberately restrained, with no nipple, navel or abdominal detail meshes.
addPart({
  name: 'Body',
  geometry: organicTorsoGeometry(),
  material: materials.fur,
  bone: 'spine_02',
  torso: true
});
// The existing head is reshaped rather than replaced: broad temples, tapered lower
// cheeks and a short neck reproduce the film character's heavy, slightly human face.
addPart({
  name: 'Head',
  geometry: organicHeadGeometry(),
  material: materials.furLight,
  bone: 'head'
});
const muzzleMorphs = {
  mouth_open: (x, y, z) => [x, y < 1.63 ? y - 0.07 * THREE.MathUtils.smoothstep(z, 0.30, 0.66) : y, z],
  smile: (x, y, z) => [x, y + Math.abs(x) * 0.05 * THREE.MathUtils.smoothstep(z, 0.35, 0.68), z],
  frown: (x, y, z) => [x, y - Math.abs(x) * 0.045 * THREE.MathUtils.smoothstep(z, 0.35, 0.68), z]
};
sphere('Muzzle', new THREE.Vector3(0, 1.61, 0.485), new THREE.Vector3(0.405, 0.225, 0.315), materials.muzzleLight, 'head', 36, muzzleMorphs);
sphere('NosePad', new THREE.Vector3(0, 1.704, 0.727), new THREE.Vector3(0.235, 0.075, 0.052), materials.muzzle, 'head', 28);
sphere('NostrilL', new THREE.Vector3(-0.102, 1.716, 0.778), new THREE.Vector3(0.038, 0.021, 0.016), materials.nostril, 'head', 14);
sphere('NostrilR', new THREE.Vector3(0.102, 1.716, 0.778), new THREE.Vector3(0.038, 0.021, 0.016), materials.nostril, 'head', 14);
capsule('UpperLipRidge', new THREE.Vector3(0, 1.588, 0.801), 0.018, 0.270, materials.lip, 'head', new THREE.Vector3(1, 1, 0.52), new THREE.Euler(0, 0, Math.PI / 2));
capsule('MouthSeam', new THREE.Vector3(0, 1.556, 0.809), 0.008, 0.275, materials.mouth, 'jaw', new THREE.Vector3(1, 1, 0.38), new THREE.Euler(0, 0, Math.PI / 2));
capsule('LowerLipRidge', new THREE.Vector3(0, 1.522, 0.797), 0.020, 0.255, materials.lip, 'jaw', new THREE.Vector3(1, 1, 0.54), new THREE.Euler(0, 0, Math.PI / 2));

const blinkLeft = { blink_l: (x, y, z) => [x, 1.865 + (y - 1.865) * 0.10, z] };
const blinkRight = { blink_r: (x, y, z) => [x, 1.865 + (y - 1.865) * 0.10, z] };
sphere('EyeWhiteL', new THREE.Vector3(-0.155, 1.865, 0.438), new THREE.Vector3(0.128, 0.036, 0.052), materials.eyeWhite, 'eye_l', 20, blinkLeft);
sphere('EyeWhiteR', new THREE.Vector3(0.155, 1.865, 0.438), new THREE.Vector3(0.128, 0.036, 0.052), materials.eyeWhite, 'eye_r', 20, blinkRight);
sphere('PupilL', new THREE.Vector3(-0.135, 1.860, 0.483), new THREE.Vector3(0.036, 0.030, 0.018), materials.pupil, 'eye_l', 14);
sphere('PupilR', new THREE.Vector3(0.135, 1.860, 0.483), new THREE.Vector3(0.036, 0.030, 0.018), materials.pupil, 'eye_r', 14);
sphere('EyelidL', new THREE.Vector3(-0.155, 1.894, 0.475), new THREE.Vector3(0.133, 0.030, 0.044), materials.furLight, 'eyelid_l', 22);
sphere('EyelidR', new THREE.Vector3(0.155, 1.894, 0.475), new THREE.Vector3(0.133, 0.030, 0.044), materials.furLight, 'eyelid_r', 22);
capsule('BrowL', new THREE.Vector3(-0.16, 2.000, 0.425), 0.027, 0.205, materials.brow, 'brow_l', new THREE.Vector3(1, 1, 0.62), new THREE.Euler(0, 0, Math.PI / 2 - 0.10));
capsule('BrowR', new THREE.Vector3(0.16, 2.000, 0.425), 0.027, 0.205, materials.brow, 'brow_r', new THREE.Vector3(1, 1, 0.62), new THREE.Euler(0, 0, Math.PI / 2 + 0.10));

// Continuous curved horns replace the previous cone tips and keep a rough gray-brown surface.
addPart({ name: 'HornL', geometry: hornGeometry(-1), material: materials.horn, bone: 'head' });
addPart({ name: 'HornR', geometry: hornGeometry(1), material: materials.horn, bone: 'head' });
sphere('EarL', new THREE.Vector3(-0.485, 1.98, 0.015), new THREE.Vector3(0.19, 0.082, 0.065), materials.fur, 'ear_l', 24);
sphere('EarR', new THREE.Vector3(0.485, 1.98, 0.015), new THREE.Vector3(0.19, 0.082, 0.065), materials.fur, 'ear_r', 24);
sphere('InnerEarL', new THREE.Vector3(-0.515, 1.98, 0.073), new THREE.Vector3(0.11, 0.043, 0.018), materials.innerEar, 'ear_l', 14);
sphere('InnerEarR', new THREE.Vector3(0.515, 1.98, 0.073), new THREE.Vector3(0.11, 0.043, 0.018), materials.innerEar, 'ear_r', 14);

// Continuous arm skins blend across the elbows instead of exposing stacked capsule seams.
capsule('ArmL', new THREE.Vector3(-0.49, 1.05, 0.015), 0.15, 0.46, materials.fur, 'upperarm_l', new THREE.Vector3(1, 1.10, 1), new THREE.Euler(0, 0, -0.035), (geometry) => blendedLimbSkin(geometry, 'upperarm_l', 'lowerarm_l', 1.08, 0.15));
capsule('ArmR', new THREE.Vector3(0.49, 1.05, 0.015), 0.15, 0.46, materials.fur, 'upperarm_r', new THREE.Vector3(1, 1.10, 1), new THREE.Euler(0, 0, 0.035), (geometry) => blendedLimbSkin(geometry, 'upperarm_r', 'lowerarm_r', 1.08, 0.15));
sphere('PalmL', new THREE.Vector3(-0.51, 0.66, 0.09), new THREE.Vector3(0.13, 0.14, 0.105), materials.hand, 'hand_l', 24);
sphere('PalmR', new THREE.Vector3(0.51, 0.66, 0.09), new THREE.Vector3(0.13, 0.14, 0.105), materials.hand, 'hand_r', 24);
capsule('ThumbL', new THREE.Vector3(-0.405, 0.65, 0.10), 0.026, 0.065, materials.hand, 'thumb_01_l', new THREE.Vector3(1, 1, 0.9), new THREE.Euler(0, 0, -0.55), null, 5, 10);
capsule('IndexL', new THREE.Vector3(-0.555, 0.535, 0.10), 0.026, 0.080, materials.hand, 'index_01_l', new THREE.Vector3(1,1,1), new THREE.Euler(), null, 5, 10);
capsule('MiddleL', new THREE.Vector3(-0.495, 0.525, 0.10), 0.028, 0.085, materials.hand, 'middle_01_l', new THREE.Vector3(1,1,1), new THREE.Euler(), null, 5, 10);
capsule('ThumbR', new THREE.Vector3(0.405, 0.65, 0.10), 0.026, 0.065, materials.hand, 'thumb_01_r', new THREE.Vector3(1, 1, 0.9), new THREE.Euler(0, 0, 0.55), null, 5, 10);
capsule('IndexR', new THREE.Vector3(0.555, 0.535, 0.10), 0.026, 0.080, materials.hand, 'index_01_r', new THREE.Vector3(1,1,1), new THREE.Euler(), null, 5, 10);
capsule('MiddleR', new THREE.Vector3(0.495, 0.525, 0.10), 0.028, 0.085, materials.hand, 'middle_01_r', new THREE.Vector3(1,1,1), new THREE.Euler(), null, 5, 10);

// Short continuous legs and split hooves keep clean contact patches at Y=0.
capsule('LegL', new THREE.Vector3(-0.23, 0.50, 0.015), 0.175, 0.36, materials.fur, 'thigh_l', new THREE.Vector3(1, 1.02, 1), new THREE.Euler(), (geometry) => blendedLimbSkin(geometry, 'thigh_l', 'shin_l', 0.50, 0.11));
capsule('LegR', new THREE.Vector3(0.23, 0.50, 0.015), 0.175, 0.36, materials.fur, 'thigh_r', new THREE.Vector3(1, 1.02, 1), new THREE.Euler(), (geometry) => blendedLimbSkin(geometry, 'thigh_r', 'shin_r', 0.50, 0.11));
sphere('FootHoofLInner', new THREE.Vector3(-0.155, 0.13, 0.11), new THREE.Vector3(0.13, 0.13, 0.285), materials.hoof, 'hoof_l', 24);
sphere('FootHoofLOuter', new THREE.Vector3(-0.305, 0.13, 0.10), new THREE.Vector3(0.13, 0.13, 0.275), materials.hoof, 'hoof_l', 24);
sphere('FootHoofRInner', new THREE.Vector3(0.155, 0.13, 0.11), new THREE.Vector3(0.13, 0.13, 0.285), materials.hoof, 'hoof_r', 24);
sphere('FootHoofROuter', new THREE.Vector3(0.305, 0.13, 0.10), new THREE.Vector3(0.13, 0.13, 0.275), materials.hoof, 'hoof_r', 24);

// A continuous tube replaces the old three-piece stick tail. It stays behind the body
// and curves toward the rear-right silhouette, leaving the front abdomen completely clean.
addPart({
  name: 'Tail',
  geometry: organicTailGeometry(),
  material: materials.fur,
  bone: 'tail_01',
  skin: tailSkin
});
sphere('TailTuft', new THREE.Vector3(0.27, 0.27, -0.76), new THREE.Vector3(0.095, 0.14, 0.085), materials.tailTip, 'tail_04', 22);

model.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(bones);
for (const mesh of skinnedMeshes) mesh.bind(skeleton, mesh.matrixWorld);

function quaternionValues(eulers) {
  const values = [];
  for (const [x = 0, y = 0, z = 0] of eulers) {
    values.push(...new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray());
  }
  return values;
}

function qTrack(name, times, eulers) {
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quaternionValues(eulers));
}

function vTrack(name, property, times, vectors) {
  return new THREE.VectorKeyframeTrack(`${name}.${property}`, times, vectors.flat());
}

function nTrack(name, morph, times, values) {
  return new THREE.NumberKeyframeTrack(`${name}.morphTargetInfluences[${morph}]`, times, values);
}

const clips = [];
function addClip(name, duration, tracks) {
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.optimize();
  clips.push(clip);
}

addClip('idle_breathe', 3.6, [
  vTrack('spine_02', 'scale', [0, 1.8, 3.6], [[1, 1, 1], [1.018, 1.035, 1.018], [1, 1, 1]]),
  qTrack('head', [0, 1.8, 3.6], [[0, 0, 0], [0.015, 0, 0], [0, 0, 0]]),
  nTrack('EyeWhiteL', 'blink_l', [0, 1.82, 1.90, 1.98, 3.6], [0, 0, 1, 0, 0]),
  nTrack('EyeWhiteR', 'blink_r', [0, 1.82, 1.90, 1.98, 3.6], [0, 0, 1, 0, 0])
]);
addClip('idle_look', 4.0, [
  qTrack('head', [0, 1, 2.2, 3.2, 4], [[0, 0, 0], [0, -0.28, 0.02], [0, -0.28, 0.02], [0, 0.24, -0.02], [0, 0, 0]]),
  qTrack('eye_l', [0, 1, 2.2, 3.2, 4], [[0, 0, 0], [0, -0.12, 0], [0, -0.12, 0], [0, 0.10, 0], [0, 0, 0]]),
  qTrack('eye_r', [0, 1, 2.2, 3.2, 4], [[0, 0, 0], [0, -0.12, 0], [0, -0.12, 0], [0, 0.10, 0], [0, 0, 0]])
]);
addClip('idle_tail', 2.2, [
  qTrack('tail_01', [0, 0.55, 1.1, 1.65, 2.2], [[0, 0, 0], [0, 0.28, 0.12], [0, 0, 0], [0, -0.28, -0.12], [0, 0, 0]]),
  qTrack('tail_02', [0, 0.55, 1.1, 1.65, 2.2], [[0, 0, 0], [0, 0.35, 0.15], [0, 0, 0], [0, -0.35, -0.15], [0, 0, 0]])
]);
addClip('idle_scratch', 2.4, [
  qTrack('upperarm_r', [0, 0.5, 0.85, 1.2, 1.55, 1.9, 2.4], [[0, 0, 0], [-0.5, 0, -0.65], [-0.25, 0, -0.55], [-0.5, 0, -0.65], [-0.25, 0, -0.55], [-0.5, 0, -0.65], [0, 0, 0]]),
  qTrack('head', [0, 1.2, 2.4], [[0, 0, 0], [0.08, 0.1, -0.06], [0, 0, 0]])
]);
addClip('idle_yawn', 2.8, [
  qTrack('jaw', [0, 0.8, 1.7, 2.25, 2.8], [[0, 0, 0], [0.48, 0, 0], [0.58, 0, 0], [0.22, 0, 0], [0, 0, 0]]),
  qTrack('head', [0, 1.2, 2.0, 2.8], [[0, 0, 0], [-0.22, 0, 0], [-0.18, 0, 0], [0, 0, 0]]),
  nTrack('Muzzle', 'mouth_open', [0, 0.8, 1.7, 2.4, 2.8], [0, 0.8, 1, 0.2, 0])
]);

function locomotionTracks(strength, bob) {
  const times = [0, 0.25, 0.5, 0.75, 1];
  const swing = [0, strength, 0, -strength, 0];
  return [
    qTrack('upperarm_l', times, swing.map((x) => [x, 0, 0.03])),
    qTrack('upperarm_r', times, swing.map((x) => [-x, 0, -0.03])),
    qTrack('thigh_l', times, swing.map((x) => [-x, 0, 0])),
    qTrack('thigh_r', times, swing.map((x) => [x, 0, 0])),
    qTrack('shin_l', times, [[0,0,0],[0.15,0,0],[0.34,0,0],[0.05,0,0],[0,0,0]]),
    qTrack('shin_r', times, [[0.34,0,0],[0.05,0,0],[0,0,0],[0.15,0,0],[0.34,0,0]]),
    vTrack('pelvis', 'position', times, [[0,0.82,0],[0,0.82+bob,0],[0,0.82,0],[0,0.82+bob,0],[0,0.82,0]])
  ];
}
addClip('walk', 1.0, locomotionTracks(0.48, 0.025));
addClip('run', 0.62, locomotionTracks(0.78, 0.055));
addClip('turn_left', 0.78, [
  qTrack('pelvis', [0, 0.4, 0.78], [[0,0,0],[0,-0.34,0],[0,-0.62,0]]),
  qTrack('thigh_l', [0,0.4,0.78], [[0,0,0],[0.22,0,0],[0,0,0]])
]);
addClip('turn_right', 0.78, [
  qTrack('pelvis', [0, 0.4, 0.78], [[0,0,0],[0,0.34,0],[0,0.62,0]]),
  qTrack('thigh_r', [0,0.4,0.78], [[0,0,0],[0.22,0,0],[0,0,0]])
]);
addClip('happy', 1.8, [
  qTrack('chest', [0,0.3,0.6,0.9,1.2,1.5,1.8], [[0,0,0],[0,0,-0.18],[0,0,0.18],[0,0,-0.18],[0,0,0.18],[0,0,-0.12],[0,0,0]]),
  qTrack('tail_01', [0,0.3,0.6,0.9,1.2,1.5,1.8], [[0,0,0],[0,0.5,0],[0,-0.5,0],[0,0.5,0],[0,-0.5,0],[0,0.3,0],[0,0,0]]),
  nTrack('Muzzle', 'smile', [0,0.3,1.5,1.8], [0,1,1,0])
]);
addClip('sad', 1.8, [
  qTrack('chest', [0,0.7,1.4,1.8], [[0,0,0],[0.24,0,0],[0.24,0,0],[0,0,0]]),
  qTrack('head', [0,0.7,1.4,1.8], [[0,0,0],[0.38,0,0.06],[0.38,0,0.06],[0,0,0]]),
  nTrack('Muzzle', 'frown', [0,0.5,1.5,1.8], [0,1,1,0])
]);
addClip('ground_paw', 1.6, [
  qTrack('thigh_r', [0,0.35,0.65,0.95,1.25,1.6], [[0,0,0],[-0.32,0,0],[0.18,0,0],[-0.32,0,0],[0.18,0,0],[0,0,0]]),
  qTrack('head', [0,0.5,1.2,1.6], [[0,0,0],[-0.20,0,0],[-0.20,0,0],[0,0,0]])
]);
addClip('charge', 0.9, [
  qTrack('chest', [0,0.18,0.72,0.9], [[0,0,0],[-0.35,0,0],[-0.42,0,0],[0,0,0]]),
  qTrack('head', [0,0.18,0.72,0.9], [[0,0,0],[-0.28,0,0],[-0.34,0,0],[0,0,0]]),
  ...locomotionTracks(0.9, 0.07)
]);
addClip('brake', 0.72, [
  qTrack('chest', [0,0.28,0.55,0.72], [[0,0,0],[0.42,0,0],[0.28,0,0],[0,0,0]]),
  qTrack('thigh_l', [0,0.28,0.72], [[0,0,0],[-0.45,0,0],[0,0,0]]),
  qTrack('thigh_r', [0,0.28,0.72], [[0,0,0],[-0.45,0,0],[0,0,0]])
]);
addClip('fall', 1.15, [
  qTrack('root', [0,0.35,0.9,1.15], [[0,0,0],[0,0,-0.2],[0,0,-1.45],[0,0,-1.57]]),
  vTrack('root', 'position', [0,0.35,0.9,1.15], [[0,0,0],[-0.05,0.05,0],[-0.62,0.58,0],[-0.72,0.62,0]])
]);
addClip('get_up', 1.45, [
  qTrack('root', [0,0.35,1.1,1.45], [[0,0,-1.57],[0,0,-1.3],[0,0,-0.3],[0,0,0]]),
  vTrack('root', 'position', [0,0.35,1.1,1.45], [[-0.72,0.62,0],[-0.55,0.55,0],[-0.12,0.12,0],[0,0,0]])
]);
addClip('sleep_enter', 1.6, [
  qTrack('root', [0,0.45,1.25,1.6], [[0,0,0],[0,0,-0.25],[0,0,-1.35],[0,0,-1.48]]),
  vTrack('root', 'position', [0,0.45,1.25,1.6], [[0,0,0],[-0.08,0.08,0],[-0.68,0.58,0],[-0.74,0.62,0]])
]);
addClip('sleep_loop', 3.2, [
  qTrack('root', [0,3.2], [[0,0,-1.48],[0,0,-1.48]]),
  vTrack('root', 'position', [0,3.2], [[-0.74,0.62,0],[-0.74,0.62,0]]),
  vTrack('spine_02', 'scale', [0,1.6,3.2], [[1,1,1],[1.01,1.035,1.01],[1,1,1]])
]);
addClip('wake_up', 1.45, [
  qTrack('root', [0,0.35,1.1,1.45], [[0,0,-1.48],[0,0,-1.2],[0,0,-0.25],[0,0,0]]),
  vTrack('root', 'position', [0,0.35,1.1,1.45], [[-0.74,0.62,0],[-0.58,0.54,0],[-0.10,0.10,0],[0,0,0]])
]);
addClip('click_react', 0.9, [
  qTrack('head', [0,0.16,0.36,0.62,0.9], [[0,0,0],[-0.12,0,-0.12],[0.04,0,0.14],[-0.08,0,-0.08],[0,0,0]]),
  qTrack('ear_l', [0,0.22,0.48,0.9], [[0,0,0],[0,0,-0.36],[0,0,0.18],[0,0,0]]),
  qTrack('ear_r', [0,0.22,0.48,0.9], [[0,0,0],[0,0,0.36],[0,0,-0.18],[0,0,0]])
]);

// Desktop-pet gesture set. These clips use the same deform skeleton as locomotion;
// no vertex-only deformation is used as the primary motion system.
addClip('blink', 0.32, [
  nTrack('EyeWhiteL', 'blink_l', [0, 0.12, 0.20, 0.32], [0, 1, 1, 0]),
  nTrack('EyeWhiteR', 'blink_r', [0, 0.12, 0.20, 0.32], [0, 1, 1, 0]),
  qTrack('eyelid_l', [0, 0.14, 0.32], [[0,0,0],[0,0,0.06],[0,0,0]]),
  qTrack('eyelid_r', [0, 0.14, 0.32], [[0,0,0],[0,0,-0.06],[0,0,0]])
]);
addClip('talk', 1.6, [
  qTrack('jaw', [0,0.22,0.46,0.70,0.96,1.22,1.6], [[0,0,0],[0.16,0,0],[0.04,0,0],[0.22,0,0],[0.08,0,0],[0.18,0,0],[0,0,0]]),
  nTrack('Muzzle', 'mouth_open', [0,0.22,0.46,0.70,0.96,1.22,1.6], [0,0.52,0.12,0.78,0.20,0.60,0])
]);
addClip('wave', 2.0, [
  qTrack('clavicle_r', [0,0.35,1.65,2.0], [[0,0,0],[0,0,-0.16],[0,0,-0.16],[0,0,0]]),
  qTrack('upperarm_r', [0,0.35,1.65,2.0], [[0,0,0],[-1.18,0,0.42],[-1.18,0,0.42],[0,0,0]]),
  qTrack('lowerarm_r', [0,0.35,0.65,0.95,1.25,1.55,2.0], [[0,0,0],[-0.72,0,0],[-0.72,0,0.30],[-0.72,0,-0.30],[-0.72,0,0.30],[-0.72,0,-0.22],[0,0,0]])
]);
addClip('point_screen', 1.5, [
  qTrack('clavicle_r', [0,0.35,1.15,1.5], [[0,0,0],[0,-0.12,-0.10],[0,-0.12,-0.10],[0,0,0]]),
  qTrack('upperarm_r', [0,0.35,1.15,1.5], [[0,0,0],[-1.28,0,0.08],[-1.28,0,0.08],[0,0,0]]),
  qTrack('lowerarm_r', [0,0.35,1.15,1.5], [[0,0,0],[-0.12,0,0],[-0.12,0,0],[0,0,0]]),
  qTrack('index_01_r', [0,0.35,1.15,1.5], [[0,0,0],[0.35,0,0],[0.35,0,0],[0,0,0]])
]);
addClip('thumbs_up', 1.7, [
  qTrack('upperarm_r', [0,0.35,1.35,1.7], [[0,0,0],[-0.72,0,0.34],[-0.72,0,0.34],[0,0,0]]),
  qTrack('lowerarm_r', [0,0.35,1.35,1.7], [[0,0,0],[-1.18,0,0],[-1.18,0,0],[0,0,0]]),
  qTrack('thumb_01_r', [0,0.35,1.35,1.7], [[0,0,0],[0,0,-0.95],[0,0,-0.95],[0,0,0]]),
  nTrack('Muzzle', 'smile', [0,0.35,1.35,1.7], [0,0.65,0.65,0])
]);
addClip('shrug', 1.7, [
  qTrack('clavicle_l', [0,0.4,1.3,1.7], [[0,0,0],[0,0,0.24],[0,0,0.24],[0,0,0]]),
  qTrack('clavicle_r', [0,0.4,1.3,1.7], [[0,0,0],[0,0,-0.24],[0,0,-0.24],[0,0,0]]),
  qTrack('upperarm_l', [0,0.4,1.3,1.7], [[0,0,0],[-0.42,0,-0.58],[-0.42,0,-0.58],[0,0,0]]),
  qTrack('upperarm_r', [0,0.4,1.3,1.7], [[0,0,0],[-0.42,0,0.58],[-0.42,0,0.58],[0,0,0]])
]);
addClip('hold_head', 1.9, [
  qTrack('upperarm_l', [0,0.45,1.45,1.9], [[0,0,0],[-1.25,0,0.48],[-1.25,0,0.48],[0,0,0]]),
  qTrack('upperarm_r', [0,0.45,1.45,1.9], [[0,0,0],[-1.25,0,-0.48],[-1.25,0,-0.48],[0,0,0]]),
  qTrack('lowerarm_l', [0,0.45,1.45,1.9], [[0,0,0],[-0.92,0,-0.10],[-0.92,0,-0.10],[0,0,0]]),
  qTrack('lowerarm_r', [0,0.45,1.45,1.9], [[0,0,0],[-0.92,0,0.10],[-0.92,0,0.10],[0,0,0]])
]);
addClip('facepalm', 1.8, [
  qTrack('upperarm_r', [0,0.42,1.35,1.8], [[0,0,0],[-1.24,0,-0.52],[-1.24,0,-0.52],[0,0,0]]),
  qTrack('lowerarm_r', [0,0.42,1.35,1.8], [[0,0,0],[-1.20,0,0.12],[-1.20,0,0.12],[0,0,0]]),
  qTrack('head', [0,0.42,1.35,1.8], [[0,0,0],[0.18,0,-0.06],[0.18,0,-0.06],[0,0,0]])
]);
addClip('nod', 1.2, [
  qTrack('head', [0,0.25,0.52,0.78,1.2], [[0,0,0],[0.24,0,0],[-0.08,0,0],[0.20,0,0],[0,0,0]])
]);
addClip('shake_head', 1.35, [
  qTrack('head', [0,0.26,0.55,0.84,1.1,1.35], [[0,0,0],[0,-0.30,0],[0,0.30,0],[0,-0.28,0],[0,0.20,0],[0,0,0]])
]);
addClip('jump', 1.15, [
  vTrack('root', 'position', [0,0.22,0.52,0.82,1.15], [[0,0,0],[0,-0.04,0],[0,0.24,0],[0,0.06,0],[0,0,0]]),
  qTrack('thigh_l', [0,0.22,0.52,0.82,1.15], [[0,0,0],[-0.36,0,0],[0.30,0,0],[-0.18,0,0],[0,0,0]]),
  qTrack('thigh_r', [0,0.22,0.52,0.82,1.15], [[0,0,0],[-0.36,0,0],[0.30,0,0],[-0.18,0,0],[0,0,0]])
]);
addClip('ear_twitch', 0.8, [
  qTrack('ear_l', [0,0.18,0.36,0.55,0.8], [[0,0,0],[0,0,-0.32],[0,0,0.18],[0,0,-0.16],[0,0,0]]),
  qTrack('ear_r', [0,0.18,0.36,0.55,0.8], [[0,0,0],[0,0,0.32],[0,0,-0.18],[0,0,0.16],[0,0,0]])
]);

model.userData.rig = {
  version: 3,
  basis: { up: '+Y', forward: '+Z', groundY: 0 },
  lookAt: { control: 'ctrl_look_at', head: 'head', eyes: ['eye_l', 'eye_r'] },
  ikChains: {
    hand_l: { target: 'ik_hand_l', pole: 'pole_elbow_l', chain: ['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l'] },
    hand_r: { target: 'ik_hand_r', pole: 'pole_elbow_r', chain: ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'] },
    foot_l: { target: 'ik_foot_l', pole: 'pole_knee_l', chain: ['thigh_l', 'shin_l', 'foot_l', 'toe_l'] },
    foot_r: { target: 'ik_foot_r', pole: 'pole_knee_r', chain: ['thigh_r', 'shin_r', 'foot_r', 'toe_r'] }
  }
};

scene.updateMatrixWorld(true);
const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(scene, {
  binary: true,
  animations: clips,
  onlyVisible: true,
  truncateDrawRange: true,
  trs: true
});

await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await fs.writeFile(OUTPUT_PATH, Buffer.from(arrayBuffer));

let triangles = 0;
for (const mesh of skinnedMeshes) {
  const geometry = mesh.geometry;
  triangles += geometry.index
    ? geometry.index.count / 3
    : geometry.attributes.position.count / 3;
}

console.log(JSON.stringify({
  output: OUTPUT_PATH,
  bytes: arrayBuffer.byteLength,
  skinnedMeshes: skinnedMeshes.length,
  bones: bones.length,
  animations: clips.map((clip) => clip.name),
  triangles: Math.round(triangles),
  morphTargets: ['blink_l', 'blink_r', 'mouth_open', 'smile', 'frown'],
  bounds: { width: 1.32, height: 2.35, depth: 1.00, groundY: 0 }
}, null, 2));
