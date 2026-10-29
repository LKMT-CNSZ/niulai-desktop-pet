import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const input = path.resolve(process.argv[2] || 'assets/models/bull-rigged-primitive-v3.glb');
const requested = new Set(process.argv.slice(3));
const bytes = await fs.readFile(input);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(buffer, '');
const bones = [];
gltf.scene.traverse((object) => {
  if (object.isBone) {
    bones.push({
      name: object.name,
      parent: object.parent?.name || null,
      position: object.position.toArray().map((value) => Number(value.toFixed(4))),
      rotation: object.rotation.toArray().slice(0, 3).map((value) => Number(value.toFixed(4)))
    });
  }
});

const clips = gltf.animations
  .filter((clip) => requested.size === 0 || requested.has(clip.name))
  .map((clip) => ({
    name: clip.name,
    duration: Number(clip.duration.toFixed(4)),
    tracks: clip.tracks.map((track) => {
      const result = {
        name: track.name,
        keys: track.times.length,
        times: [...track.times].map((value) => Number(value.toFixed(4)))
      };
      if (track.name.endsWith('.quaternion')) {
        result.eulerDegrees = [];
        for (let offset = 0; offset < track.values.length; offset += 4) {
          const euler = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion().fromArray(track.values, offset),
            'XYZ'
          );
          result.eulerDegrees.push(euler.toArray().slice(0, 3).map(
            (value) => Number(THREE.MathUtils.radToDeg(value).toFixed(1))
          ));
        }
      } else {
        const valueSize = track.getValueSize();
        result.values = [];
        for (let offset = 0; offset < track.values.length; offset += valueSize) {
          result.values.push([...track.values.slice(offset, offset + valueSize)].map(
            (value) => Number(value.toFixed(4))
          ));
        }
      }
      return result;
    })
  }));

console.log(JSON.stringify({ input, bones, clips }, null, 2));
