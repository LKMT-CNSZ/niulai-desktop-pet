import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const modelPath = process.argv[2] || 'assets/models/niulai-child-rigged.glb';
const actionName = process.argv[3] || 'walk';
const normalizedTime = Number(process.argv[4] || 0.25);
const bytes = await fs.readFile(modelPath);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  ''
);
const mesh = gltf.scene.getObjectByName('NiulaiChildContinuous');
if (!mesh?.isSkinnedMesh) throw new Error('NiulaiChildContinuous skinned mesh not found');
const clip = gltf.animations.find((item) => item.name === actionName);
if (!clip) throw new Error(`Animation not found: ${actionName}`);

const mixer = new THREE.AnimationMixer(gltf.scene);
const action = mixer.clipAction(clip);
action.play();
mixer.setTime(clip.duration * normalizedTime);
gltf.scene.updateMatrixWorld(true);

const geometry = mesh.geometry;
const position = geometry.getAttribute('position');
const indices = geometry.getIndex();
const posed = Array.from({ length: position.count }, () => new THREE.Vector3());
for (let index = 0; index < position.count; index += 1) mesh.getVertexPosition(index, posed[index]);

const restA = new THREE.Vector3();
const restB = new THREE.Vector3();
const restC = new THREE.Vector3();
const reports = [];
for (let offset = 0; offset < indices.count; offset += 3) {
  const ids = [indices.getX(offset), indices.getX(offset + 1), indices.getX(offset + 2)];
  restA.fromBufferAttribute(position, ids[0]);
  restB.fromBufferAttribute(position, ids[1]);
  restC.fromBufferAttribute(position, ids[2]);
  const restEdges = [restA.distanceTo(restB), restB.distanceTo(restC), restC.distanceTo(restA)];
  const posedEdges = [
    posed[ids[0]].distanceTo(posed[ids[1]]),
    posed[ids[1]].distanceTo(posed[ids[2]]),
    posed[ids[2]].distanceTo(posed[ids[0]])
  ];
  const stretch = Math.max(...posedEdges.map((edge, index) => edge / Math.max(restEdges[index], 1e-8)));
  if (stretch < 1.35) continue;
  const centre = restA.clone().add(restB).add(restC).multiplyScalar(1 / 3);
  reports.push({ face: offset / 3, stretch, centre: centre.toArray(), ids });
}
reports.sort((a, b) => b.stretch - a.stretch);

const skinIndex = geometry.getAttribute('skinIndex');
const skinWeight = geometry.getAttribute('skinWeight');
const boneNames = mesh.skeleton.bones.map((bone) => bone.name);
for (const report of reports.slice(0, 30)) {
  report.influences = report.ids.map((vertex) => {
    const entries = [];
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = skinWeight.getComponent(vertex, slot);
      if (weight > 0.01) entries.push([boneNames[skinIndex.getComponent(vertex, slot)], Number(weight.toFixed(3))]);
    }
    return entries;
  });
  report.stretch = Number(report.stretch.toFixed(3));
  report.centre = report.centre.map((value) => Number(value.toFixed(4)));
}

console.log(JSON.stringify({ modelPath, actionName, normalizedTime, distortedFaces: reports.length, worst: reports.slice(0, 30) }, null, 2));
