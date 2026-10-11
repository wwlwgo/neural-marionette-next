import * as THREE from 'three';
import {createMoonVisual} from './moon.js';

// The scene completes the spell only after the held moon reaches the sky.
export function createEffects(scene) {
  const ball = new THREE.Group(); scene.add(ball);
  // Open rings leave the crescent and its transparent sphere unobstructed.
  const rings = [0, 1, 2].map(i => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.54, .008, 8, 80), new THREE.MeshBasicMaterial({color: ['#9be8ef', '#f1b8ed', '#ffebaf'][i], transparent: true, opacity: .45, depthWrite: false}));
    ball.add(ring); return ring;
  });
  const moonVisual = createMoonVisual();
  const moon = moonVisual.group; scene.add(moon);
  const base = new THREE.Vector3(0, 1.8, .4);
  const goal = new THREE.Vector3(.7, 4.5, -.5);
  const launchOrigin = new THREE.Vector3();
  const flightDuration = 3.2;
  let phase = 'idle', restored = false, sizeScale = 1, flightTime = 0;
  function reset() {
    phase = 'idle'; restored = false; flightTime = 0; launchOrigin.copy(base);
    moon.position.copy(base); moon.scale.setScalar(.5 * sizeScale); moon.visible = false;
    ball.visible = false; ball.position.copy(base); ball.scale.copy(moon.scale);
    moonVisual.update(0, false);
  }
  reset();
  return {
    configure({color = '#9be8ef', sizeScale: size = 1} = {}) { sizeScale = size; rings[0].material.color.set(color); },
    reset,
    loadMoon: () => moonVisual.load(),
    dispose: () => moonVisual.dispose(),
    update(state, time, hands, dt = 0) {
      if (state.phase === 'idle' && phase !== 'idle') reset();
      const validHands = state.tracking !== false && hands?.length === 3 && hands.every(Number.isFinite);
      const enteringLaunch = state.phase === 'launched' && phase !== 'launched';
      if (enteringLaunch) {
        // Capture the actual palms once; later tracking cannot drag a released moon.
        if (validHands) moon.position.fromArray(hands);
        launchOrigin.copy(moon.position); flightTime = 0;
      }
      phase = state.phase;
      moon.visible = phase !== 'idle';
      if ((phase === 'charging' || phase === 'expanded') && validHands) moon.position.fromArray(hands);
      if (phase === 'launched' && !restored) {
        flightTime = Math.min(flightDuration, flightTime + Math.max(0, dt));
        const progress = flightTime / flightDuration;
        const eased = progress * progress * (3 - 2 * progress);
        moon.position.lerpVectors(launchOrigin, goal, eased);
        restored = flightTime >= flightDuration;
      }
      const targetScale = (phase === 'charging' ? .5 : 1) * sizeScale;
      moon.scale.setScalar(THREE.MathUtils.lerp(moon.scale.x, targetScale, 1 - Math.exp(-Math.max(0, dt) * 5)));
      ball.visible = phase === 'charging' || phase === 'expanded' || (phase === 'launched' && flightTime < 1);
      ball.position.copy(moon.position); ball.scale.copy(moon.scale);
      rings.forEach((ring, i) => {
        ring.rotation.set(time * (.3 + i * .13) + i, time * .25 + i * 1.1, time * .2);
        ring.material.opacity = .45 * (phase === 'launched' ? Math.max(0, 1 - flightTime) : 1);
      });
      moonVisual.update(time, restored);
      return restored ? 'moon_restored' : null;
    },
    snapshot() { return {phase, restored, visible: moon.visible, launchOrigin: launchOrigin.toArray(), flightProgress: flightTime / flightDuration, visual: moonVisual.snapshot(), ball: ball.position.toArray(), moon: moon.position.toArray(), radius: moon.scale.x * .5}; }
  };
}
