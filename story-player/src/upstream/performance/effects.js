import * as THREE from 'three';
import {createMoonVisual} from './moon.js';

// Scene feedback owns completion: contact is required before the moon can rise.
export function createEffects(scene) {
  const ball = new THREE.Group(); scene.add(ball);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({color: '#9be8ef', transparent: true, opacity: .88, depthWrite: false, toneMapped: false}));
  ball.add(core);
  const rings = [0, 1, 2].map(i => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.07, .022, 8, 80), new THREE.MeshBasicMaterial({color: ['#9be8ef', '#f1b8ed', '#ffebaf'][i], transparent: true, opacity: .85}));
    ball.add(ring); return ring;
  });
  const moonVisual = createMoonVisual();
  const moon = moonVisual.group; scene.add(moon);
  const base = new THREE.Vector3(1.25, 3.05, -.5);
  const goal = base.clone().add(new THREE.Vector3(0, .7, 0));
  let phase = 'idle', touched = false, restored = false, sizeScale = 1;
  function reset() { phase = 'idle'; touched = restored = false; moon.position.copy(base); ball.visible = false; ball.position.set(0, 1.8, 0); moonVisual.update(0, false); }
  reset();
  return {
    configure({color = '#9be8ef', sizeScale: size = 1} = {}) { sizeScale = size; core.material.color.set(color); rings[0].material.color.set(color); },
    reset,
    loadMoon: () => moonVisual.load(),
    dispose: () => moonVisual.dispose(),
    update(state, time, hands, dt = 0) {
      if (state.phase === 'idle' && phase !== 'idle') reset();
      if (state.phase === 'launched' && phase !== 'launched') ball.position.fromArray(hands);
      phase = state.phase;
      ball.visible = phase !== 'idle' && phase !== 'complete';
      if ((phase === 'charging' || phase === 'expanded') && state.tracking !== false) ball.position.fromArray(hands);
      if (phase === 'launched' && !restored) {
        if (!touched) {
          const delta = base.clone().sub(ball.position), distance = delta.length();
          ball.position.addScaledVector(delta.normalize(), Math.min(distance, dt * 2.0));
          if (ball.position.distanceTo(base) <= .025) { touched = true; ball.position.copy(base); }
        } else {
          moon.position.y = Math.min(goal.y, moon.position.y + dt * .48);
          ball.position.copy(moon.position);
          restored = moon.position.distanceTo(goal) < .001;
        }
      }
      ball.scale.setScalar((state.radius || .2) * sizeScale);
      rings.forEach((ring, i) => ring.rotation.set(time * (.3 + i * .13) + i, time * .25 + i * 1.1, time * .2));
      moonVisual.update(time, restored);
      return restored ? 'moon_restored' : null;
    },
    snapshot() { return {phase, touched, restored, visual: moonVisual.snapshot(), ball: ball.position.toArray(), moon: moon.position.toArray(), radius: ball.scale.x}; }
  };
}
