import fs from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletalAnimationController } from '../renderer-modules/skeletal-animation-controller.js';

const modelBytes = await fs.readFile(new URL('../assets/models/bull-rigged.glb', import.meta.url));
const buffer = modelBytes.buffer.slice(modelBytes.byteOffset, modelBytes.byteOffset + modelBytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(buffer, '');
const contract = JSON.parse(await fs.readFile(
  new URL('../assets/models/bull-rigged.contract.json', import.meta.url),
  'utf8'
));
const controller = new SkeletalAnimationController();
controller.bind(gltf.scene, gltf.animations, contract);
const result = {};
for (const actionName of ['walk', 'run']) {
  const clip = gltf.animations.find((entry) => entry.name === actionName);
  result[actionName] = {};
  for (const marker of contract.actions[actionName].events) {
    const side = marker.event.endsWith('left') ? 'left' : 'right';
    controller.play(actionName, { force: true, loop: true, fade: 0 });
    let remaining = marker.normalizedTime * clip.duration;
    while (remaining > 1e-9) {
      const step = Math.min(1 / 120, remaining);
      controller.update(step);
      remaining -= step;
    }
    result[actionName][side] = controller.getFootStatus()[side];
  }
}
controller.dispose();
console.log(JSON.stringify(result, null, 2));
