import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {disposeModel} from '../model-rig.js';

export function normalizeMoon(model) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest < .0001) throw new Error('月亮模型尺寸无效');
  const group = new THREE.Group();
  group.add(model);
  const scale = .72 / longest;
  group.scale.setScalar(scale);
  group.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
  return group;
}

function fallbackCrescent() {
  const outline = new THREE.Shape();
  outline.moveTo(-.18, .34);
  outline.bezierCurveTo(.41, .42, .48, -.32, -.18, -.34);
  outline.bezierCurveTo(.13, -.19, .14, .20, -.18, .34);
  const geometry = new THREE.ExtrudeGeometry(outline, {depth: .10, bevelEnabled: true, bevelThickness: .045, bevelSize: .025, bevelSegments: 4, steps: 1, curveSegments: 40});
  geometry.translate(0, 0, -.05);
  return normalizeMoon(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: '#ffdc91', roughness: .85, emissive: '#b86b21', emissiveIntensity: .16})));
}

// Keep the transparent spherical aura separate from the opaque imported mesh.
export function createMoonVisual({loader = new GLTFLoader()} = {}) {
  const group = new THREE.Group();
  group.name = 'storybook-moon';
  let body = fallbackCrescent(), disposed = false, loaded = false, pending;
  let moonMaterials = [body.children[0].material];
  group.add(body);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(.50, 64, 40), new THREE.ShaderMaterial({
    uniforms: {tint: {value: new THREE.Color('#ffe6a8')}, strength: {value: .36}},
    vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = -p.xyz; vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 tint; uniform float strength; varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal;
      void main() { float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 5.0);
        vec3 n = normalize(vWorldNormal);
        float glint = pow(max(dot(n, normalize(vec3(-.65, .8, .6))), 0.0), 65.0);
        float sheen = pow(max(dot(n, normalize(vec3(.7, -.25, .5))), 0.0), 100.0);
        gl_FragColor = vec4(tint * (1.0 + glint), strength * (0.014 + rim * 1.25 + glint * .45 + sheen * .2)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  aura.name = 'moon-spherical-aura';
  aura.renderOrder = 2;
  group.add(aura);
  return {
    group,
    load(url = `${import.meta.env?.BASE_URL || '/'}models/moon-storybook.glb`) {
      if (disposed) return Promise.resolve(false);
      if (pending) return pending;
      pending = (async () => {
        let model;
        try {
          ({scene: model} = await loader.loadAsync(url));
          if (disposed) { disposeModel(model); return false; }
          const next = normalizeMoon(model);
          const materials = new Set();
          model.traverse(object => {
            for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
              if (material.isMeshStandardMaterial) {
                material.roughness = .32;
                material.metalness = 0;
                material.emissive.set('#fff1d6');
                material.emissiveIntensity = .45;
                materials.add(material);
              }
            }
          });
          group.remove(body); disposeModel(body); body = next; group.add(body);
          moonMaterials = [...materials];
          loaded = true;
          return true;
        } catch (error) {
          if (model) disposeModel(model);
          if (!disposed) console.warn('月亮模型加载失败，使用备用弯月。', error);
          return false;
        }
      })();
      return pending;
    },
    update(time, restored) {
      const breath = Math.sin(time * 1.4) * .035;
      aura.material.uniforms.strength.value = (restored ? .65 : .46) + breath;
      for (const material of moonMaterials) material.emissiveIntensity = (restored ? .7 : .45) + breath;
    },
    snapshot() { return {loaded, aura: 'sphere', emissiveIntensity: moonMaterials[0]?.emissiveIntensity}; },
    dispose() { if (disposed) return; disposed = true; disposeModel(group); group.removeFromParent(); },
  };
}
