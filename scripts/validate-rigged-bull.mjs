import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const modelPath = path.join(root, 'assets', 'models', 'bull-rigged.glb');
const contractPath = path.join(root, 'assets', 'models', 'bull-rigged.contract.json');
const reportPath = path.join(root, 'artifacts', 'bull-rigged-validation.json');

const bytes = await fs.readFile(modelPath);
assert.equal(bytes.toString('ascii', 0, 4), 'glTF', '文件不是GLB');
assert.equal(bytes.readUInt32LE(4), 2, 'GLB版本必须为2');

let offset = 12;
let json = null;
while (offset < bytes.length) {
  const length = bytes.readUInt32LE(offset);
  const type = bytes.toString('ascii', offset + 4, offset + 8);
  if (type === 'JSON') {
    json = JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length));
  }
  offset += 8 + length;
}
assert.ok(json, '缺少GLB JSON块');

const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
const nodeNames = new Set((json.nodes || []).map((node) => node.name).filter(Boolean));
const animationNames = new Set((json.animations || []).map((animation) => animation.name));
const requiredActions = Object.keys(contract.actions);
const missingBones = contract.requiredBones.filter((name) => !nodeNames.has(name));
const missingActions = requiredActions.filter((name) => !animationNames.has(name));

assert.ok((json.skins || []).length >= 1, '必须包含Skin');
assert.equal(missingBones.length, 0, `缺少骨骼: ${missingBones.join(', ')}`);
assert.equal(missingActions.length, 0, `缺少动作: ${missingActions.join(', ')}`);

let triangles = 0;
let skinnedPrimitives = 0;
let morphTargetSets = 0;
const morphNames = new Set();
for (const mesh of json.meshes || []) {
  for (const name of mesh.extras?.targetNames || []) morphNames.add(name);
  for (const primitive of mesh.primitives || []) {
    assert.ok(primitive.attributes?.POSITION !== undefined, `${mesh.name} 缺少POSITION`);
    if (primitive.attributes?.JOINTS_0 !== undefined && primitive.attributes?.WEIGHTS_0 !== undefined) {
      skinnedPrimitives += 1;
    }
    if (primitive.targets?.length) morphTargetSets += 1;
    const accessorIndex = primitive.indices ?? primitive.attributes.POSITION;
    const count = json.accessors[accessorIndex]?.count || 0;
    if (primitive.mode === undefined || primitive.mode === 4) triangles += count / 3;
  }
}

assert.ok(skinnedPrimitives >= 1, '没有携带JOINTS_0/WEIGHTS_0的蒙皮图元');
assert.ok(triangles <= contract.limits.maximumTriangles, `面数超标: ${triangles}`);
const maximumSkinJoints = Math.max(...(json.skins || []).map((skin) => skin.joints?.length || 0));
assert.ok(
  maximumSkinJoints <= contract.limits.maximumBones,
  `骨骼数超标: ${maximumSkinJoints}`
);
for (const name of contract.morphTargets) {
  assert.ok(morphNames.has(name), `缺少形态键: ${name}`);
}

const report = {
  valid: true,
  file: modelPath,
  bytes: bytes.length,
  generator: json.asset?.generator,
  scenes: json.scenes?.length || 0,
  nodes: json.nodes?.length || 0,
  meshes: json.meshes?.length || 0,
  materials: json.materials?.length || 0,
  skins: json.skins?.length || 0,
  skinJoints: maximumSkinJoints,
  skinnedPrimitives,
  animations: [...animationNames],
  morphTargets: [...morphNames],
  morphTargetSets,
  triangles: Math.round(triangles),
  missingBones,
  missingActions,
  limits: contract.limits
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
