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
  };
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const INPUT = path.join(ROOT, '.tools', 'results', 'niulai-child-hires-base.glb');
const OUTPUT = path.join(ROOT, 'assets', 'models', 'niulai-child-hires-static.glb');

async function loadGlb(filePath) {
  const data = await fs.readFile(filePath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new GLTFLoader().parseAsync(arrayBuffer, '');
}

function material(name, color, roughness = 0.78) {
  return new THREE.MeshPhysicalMaterial({
    name,
    color,
    roughness,
    metalness: 0,
    sheen: 0.08,
    sheenColor: new THREE.Color(color),
    sheenRoughness: 0.88
  });
}

const eyeWhite = material('niulai_eye_warm_white', 0xfff8e9, 0.48);
const iris = material('niulai_iris_hazel', 0x6a4022, 0.38);
const pupil = material('niulai_pupil', 0x17100c, 0.44);
const brow = material('niulai_brow_dark_brown', 0x2b1a12, 0.92);
const nostril = material('niulai_nostril_warm_brown', 0x6b3b2d, 0.82);

function ellipsoid(name, centre, scale, meshMaterial, segments = [48, 24]) {
  const geometry = new THREE.SphereGeometry(1, segments[0], segments[1]);
  geometry.name = `${name}Geometry`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.fromArray(centre);
  mesh.scale.fromArray(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function almondEye(name, centre, meshMaterial) {
  const [x, y, z] = centre;
  const shape = new THREE.Shape();
  shape.moveTo(-0.105, 0);
  shape.bezierCurveTo(-0.064, 0.044, 0.064, 0.044, 0.105, 0);
  shape.bezierCurveTo(0.060, -0.039, -0.060, -0.039, -0.105, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.006,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.0015,
    bevelThickness: 0.0015,
    curveSegments: 24
  });
  geometry.name = `${name}Geometry`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function flatDisk(name, centre, scale, depth, meshMaterial, segments = 40) {
  const geometry = new THREE.CylinderGeometry(1, 1, depth, segments, 1, false);
  geometry.rotateX(Math.PI / 2);
  geometry.name = `${name}Geometry`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.fromArray(centre);
  mesh.scale.set(scale[0], scale[1], 1);
  mesh.castShadow = true;
  return mesh;
}

function browWedge(name, side, meshMaterial) {
  const outerX = side * 0.245;
  const innerX = side * 0.065;
  const centreX = (outerX + innerX) * 0.5;
  const centreY = 1.902;
  const shape = new THREE.Shape();
  shape.moveTo(outerX - centreX, 1.915 - centreY);
  shape.lineTo(innerX - centreX, 1.902 - centreY);
  shape.lineTo(innerX - centreX, 1.888 - centreY);
  shape.lineTo(outerX - centreX, 1.899 - centreY);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.005,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.0012,
    bevelThickness: 0.0012
  });
  geometry.name = `${name}Geometry`;
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = name;
  mesh.position.set(centreX, centreY, 0.288);
  mesh.rotation.y = side * 0.22;
  mesh.castShadow = true;
  return mesh;
}

const gltf = await loadGlb(INPUT);
const model = new THREE.Group();
model.name = 'NiulaiChildFilmMatchHighDetail';
while (gltf.scene.children.length) model.add(gltf.scene.children[0]);
model.traverse((object) => {
  if (!object.isMesh) return;
  object.name ||= 'NiulaiChildContinuousBody';
  object.castShadow = true;
  object.receiveShadow = true;
  if (object.material) {
    object.material.name = 'niulai_projected_short_fur';
    object.material.vertexColors = true;
    object.material.roughness = 0.88;
    object.material.metalness = 0;
  }
});

const face = new THREE.Group();
face.name = 'NiulaiChildAuthoredFaceDetails';

for (const side of [-1, 1]) {
  const suffix = side < 0 ? 'L' : 'R';
  const x = side * 0.145;
  const eyeGroup = new THREE.Group();
  eyeGroup.name = `EyeAssembly${suffix}`;
  eyeGroup.position.set(x, 1.810, 0.282);
  eyeGroup.rotation.y = side * 0.27;
  eyeGroup.add(almondEye(`EyeWhite${suffix}`, [0, 0, 0], eyeWhite));
  eyeGroup.add(flatDisk(`Iris${suffix}`, [0, -0.002, 0.0105], [0.029, 0.032], 0.0035, iris, 48));
  eyeGroup.add(flatDisk(`Pupil${suffix}`, [0, -0.002, 0.0132], [0.013, 0.021], 0.0025, pupil, 40));
  eyeGroup.add(flatDisk(
    `EyeHighlight${suffix}`,
    [-0.006, 0.009, 0.0150],
    [0.0045, 0.0065],
    0.0018,
    eyeWhite,
    24
  ));
  face.add(eyeGroup);

  face.add(browWedge(`Brow${suffix}`, side, brow));

  const nose = flatDisk(
    `Nostril${suffix}`,
    [side * 0.105, 1.620, 0.468],
    [0.032, 0.018],
    0.003,
    nostril,
    36
  );
  nose.rotation.z = side * 0.24;
  nose.rotation.y = side * 0.16;
  face.add(nose);
}
model.add(face);

model.userData.modelStage = 'high_detail_static_shape_review';
model.userData.sourceTurnaround = 'assets/concepts/niulai-child-turnaround-v1.png';
model.userData.geometryPolicy = {
  projectedBodyFaces: 90000,
  authoredFaceParts: ['almond_eyes', 'irises', 'pupils', 'brow_wedges', 'flush_nostrils'],
  removedArtifacts: ['protruding_tube_mouth_seam']
};

const scene = new THREE.Scene();
scene.name = 'NiulaiChildHighDetailStaticScene';
scene.add(model);
scene.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const output = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
  truncateDrawRange: true,
  trs: true
});
await fs.writeFile(OUTPUT, Buffer.from(output));

let triangles = 0;
let meshes = 0;
model.traverse((object) => {
  if (!object.isMesh) return;
  meshes += 1;
  const geometry = object.geometry;
  triangles += geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
});
console.log(JSON.stringify({ output: OUTPUT, meshes, triangles }, null, 2));
