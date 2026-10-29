import fs from 'node:fs/promises';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const input = path.resolve(process.argv[2] || '.tools/results/niulai-child-hires-base.glb');
const bytes = await fs.readFile(input);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(buffer, '');
let mesh = null;
gltf.scene.traverse((object) => { if (!mesh && object.isMesh) mesh = object; });
if (!mesh) throw new Error('Mesh not found');
const position = mesh.geometry.getAttribute('position');
const index = mesh.geometry.getIndex();
const neighbours = Array.from({ length: position.count }, () => []);
for (let offset = 0; offset < index.count; offset += 3) {
  const a = index.getX(offset); const b = index.getX(offset + 1); const c = index.getX(offset + 2);
  neighbours[a].push(b, c); neighbours[b].push(a, c); neighbours[c].push(a, b);
}
const visited = new Uint8Array(position.count);
const components = [];
for (let start = 0; start < position.count; start += 1) {
  if (visited[start]) continue;
  const queue = [start];
  visited[start] = 1;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let count = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const vertex = queue[cursor];
    count += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = axis === 0 ? position.getX(vertex) : axis === 1 ? position.getY(vertex) : position.getZ(vertex);
      bounds.min[axis] = Math.min(bounds.min[axis], value);
      bounds.max[axis] = Math.max(bounds.max[axis], value);
    }
    for (const neighbour of neighbours[vertex]) {
      if (visited[neighbour]) continue;
      visited[neighbour] = 1;
      queue.push(neighbour);
    }
  }
  components.push({ count, ...bounds });
}
components.sort((a, b) => b.count - a.count);
console.log(JSON.stringify({ input, vertices: position.count, components }, null, 2));
