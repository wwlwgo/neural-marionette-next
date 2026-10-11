import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {restPose} from './pose.js';
import {loadGuardian} from './guardian.js';
import {createEffects} from './effects.js';
export function createAvatar(container,onModel){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#111a35');scene.fog=new THREE.Fog('#111a35',12,32);
  const camera=new THREE.PerspectiveCamera(39,1,.1,100);camera.position.set(0,2.5,6.8);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,2.05,0);controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=13;controls.maxPolarAngle=Math.PI*.6;controls.enablePan=false;controls.update();
  scene.add(new THREE.HemisphereLight(0xc8eaff,0x343151,3));
  const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(-3,6,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-4;light.shadow.camera.right=4;light.shadow.camera.top=5;light.shadow.camera.bottom=-4;scene.add(light);
  const rim=new THREE.DirectionalLight('#9b96ff',3);rim.position.set(3,3,-4);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#131d35',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.25,.06,80),new THREE.MeshStandardMaterial({color:'#273052',metalness:.2,roughness:.7}));platform.position.y=-.015;platform.receiveShadow=true;scene.add(platform);
  const boundary=new THREE.Mesh(new THREE.TorusGeometry(1.25,.012,8,96),new THREE.MeshBasicMaterial({color:'#8799e7'}));boundary.rotation.x=Math.PI/2;boundary.position.y=.022;scene.add(boundary);
  const stars=new Float32Array(180*3);for(let i=0;i<180;i++){stars[i*3]=Math.sin(i*21.13)*8;stars[i*3+1]=1+((i*37)%101)/13;stars[i*3+2]=-3-((i*19)%47)/8;}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(stars,3));scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#b6c8ff',size:.025})));
  const ink=new THREE.MeshStandardMaterial({color:'#b5c8ed',roughness:.55}),jointMat=new THREE.MeshStandardMaterial({color:'#91e7d7',roughness:.65});
  const points=restPose(),target=structuredClone(points),joints={},stick=new THREE.Group();scene.add(stick);
  for(const key of Object.keys(points)){const sphere=new THREE.Mesh(new THREE.SphereGeometry(key==='head'?.205:.063,24,16),key==='head'?ink:jointMat);sphere.castShadow=true;stick.add(sphere);joints[key]=sphere;}
  const edges=[['waist','neck'],['ls','rs'],['neck','head'],['ls','le'],['le','lw'],['rs','re'],['re','rw'],['lh','rh'],['waist','lh'],['waist','rh'],['lh','lk'],['lk','la'],['rh','rk'],['rk','ra']];
  const rods=edges.map(([a,b])=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.034,.034,1,12),ink);mesh.castShadow=true;stick.add(mesh);return {a,b,mesh};});
  for(const x of [-.067,.067]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.022,12,8),new THREE.MeshBasicMaterial({color:'#162b40'}));eye.position.set(x,.025,.186);joints.head.add(eye);}
  const effects=createEffects(scene);let guardian=null,wantGuardian=true;
  const modelReady=loadGuardian(scene).then(model=>{guardian=model;guardian.setVisible(wantGuardian);stick.visible=!wantGuardian;onModel?.('鹿角机甲已就绪');return true;}).catch(error=>{console.error(error);onModel?.('模型加载未完成，使用骨骼分身');return false;});
  const v1=new THREE.Vector3(),v2=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(container);resize();
  return {modelReady,effects,
    setPose(p){for(const [key,value] of Object.entries(p))if(target[key])target[key]=[...value];},
    useGuardian(value){wantGuardian=value;if(guardian)guardian.setVisible(value);stick.visible=!guardian||!value;},
    getPoints(){return structuredClone(points);},
    front(){camera.position.set(0,2.5,6.8);controls.target.set(0,2.05,0);controls.update();},
    render(dt,smoothing,state,time){
      const alpha=1-Math.exp(-dt*(28-Number(smoothing)*.25));
      for(const key of Object.keys(points)){points[key]=points[key].map((v,i)=>v+(target[key][i]-v)*alpha);joints[key].position.fromArray(points[key]);}
      for(const {a,b,mesh} of rods){v1.fromArray(points[a]);v2.fromArray(points[b]);direction.subVectors(v2,v1);mesh.position.copy(v1).add(v2).multiplyScalar(.5);mesh.scale.y=direction.length();mesh.quaternion.setFromUnitVectors(up,direction.normalize());}
      guardian?.update(points);
      const hands=guardian&&wantGuardian?guardian.point('LeftHand').add(guardian.point('RightHand')).multiplyScalar(.5).toArray():points.lw.map((v,i)=>(v+points.rw[i])/2);
      effects.update(state,time,hands);controls.update();renderer.render(scene,camera);
    }
  };
}
