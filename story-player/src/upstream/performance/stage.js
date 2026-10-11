import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadGuardian} from './guardian.js';
import {createEffects} from './effects.js';
import {disposeModel} from '../model-rig.js';
import {restPose} from '../motion/avatar-pose.js';

// Owned by PerformanceModule. The shared camera is deliberately not owned here.
export class PerformanceStage {
  constructor(container) {
    this.container = container;
    this.disposed = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111a35');
    this.scene.fog = new THREE.Fog('#111a35', 12, 30);
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 60);
    this.camera.position.set(0, 2.65, 7.8);
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('aria-label', '鹿角守护者与月亮的三维舞台');
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(.3, 2.15, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 12;
    this.controls.update();
    this.scene.add(new THREE.HemisphereLight(0xc8eaff, 0x343151, 3));
    for (const [color, intensity, xyz] of [[0xffffff, 4, [-3, 6, 4]], [0x9b96ff, 3, [3, 3, -4]]]) {
      const light = new THREE.DirectionalLight(color, intensity);
      light.position.set(...xyz); this.scene.add(light);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({color: '#172139', roughness: 1}));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.03; this.scene.add(floor);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, .06, 64), new THREE.MeshStandardMaterial({color: '#344466', roughness: .7}));
    platform.position.y = -.01; this.scene.add(platform);
    const starGeo = new THREE.BufferGeometry();
    const stars = Array.from({length: 150}, (_, i) => [Math.sin(i * 21.13) * 9, 1 + (i * 37 % 101) / 13, -3 - (i * 19 % 47) / 8]).flat();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color: '#b6c8ff', size: .025})));
    this.effects = createEffects(this.scene);
    this.points = restPose(); this.target = restPose();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container); this.resize();
  }
  async load(effect) {
    this.effects.configure(effect);
    const guardian = await loadGuardian(this.scene);
    if (this.disposed) { guardian.dispose(); return; }
    this.guardian = guardian;
    this.guardian.update(this.points);
  }
  resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setPose(points) {
    for (const [name, value] of Object.entries(points || {})) {
      if (this.target[name] && value.length === 3 && value.every(Number.isFinite)) this.target[name] = [...value];
    }
  }
  reset(effect) {
    this.effects.configure(effect); this.effects.reset();
    this.points = restPose(); this.target = restPose();
  }
  render(dt, state, time) {
    const alpha = 1 - Math.exp(-dt * 16);
    for (const name of Object.keys(this.points)) this.points[name] = this.points[name].map((v, i) => v + (this.target[name][i] - v) * alpha);
    this.guardian?.update(this.points);
    const handsCenter = this.guardian ? this.guardian.point('LeftHand').add(this.guardian.point('RightHand')).multiplyScalar(.5) : new THREE.Vector3(0, 1.8, 0);
    // Wrist bones sit inside the gauntlets. Float the orb just in front of the
    // palms, following the torso direction, so chest armour cannot swallow it.
    const across = new THREE.Vector3().fromArray(this.points.rs).sub(new THREE.Vector3().fromArray(this.points.ls));
    const up = new THREE.Vector3().fromArray(this.points.neck).sub(new THREE.Vector3().fromArray(this.points.waist));
    const forward = across.cross(up).normalize();
    const hands = handsCenter.addScaledVector(forward, .22).toArray();
    const outcome = this.effects.update(state, time, hands, dt);
    this.controls.update(); this.renderer.render(this.scene, this.camera);
    return outcome;
  }
  snapshot() {
    return {modelLoaded: !!this.guardian, points: structuredClone(this.points), effects: this.effects.snapshot(), calls: this.renderer.info.render.calls};
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.resizeObserver.disconnect(); this.controls.dispose();
    this.guardian?.dispose(); disposeModel(this.scene); this.scene.clear();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
