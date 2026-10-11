import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {disposeModel} from '../model-rig.js';
const segments={LeftUpperArm:['ls','le','LeftLowerArm'],LeftLowerArm:['le','lw','LeftHand'],RightUpperArm:['rs','re','RightLowerArm'],RightLowerArm:['re','rw','RightHand'],LeftUpperLeg:['lh','lk','LeftLowerLeg'],LeftLowerLeg:['lk','la','LeftFoot'],RightUpperLeg:['rh','rk','RightLowerLeg'],RightLowerLeg:['rk','ra','RightFoot']};
const aliases={Root:['hips','pelvis','root'],Chest:['chest','spine2','upperchest','spine1','spine'],Head:['head'],LeftUpperArm:['leftupperarm','leftarm'],RightUpperArm:['rightupperarm','rightarm'],LeftLowerArm:['leftlowerarm','leftforearm'],RightLowerArm:['rightlowerarm','rightforearm'],LeftHand:['lefthand'],RightHand:['righthand'],LeftUpperLeg:['leftupperleg','leftupleg'],RightUpperLeg:['rightupperleg','rightupleg'],LeftLowerLeg:['leftlowerleg','leftleg'],RightLowerLeg:['rightlowerleg','rightleg'],LeftFoot:['leftfoot'],RightFoot:['rightfoot']};
const normalize=s=>s.toLowerCase().replace(/^.*mixamorig[:_]?/,'').replace(/[^a-z0-9]/g,'');
const vec=a=>new THREE.Vector3().fromArray(a);
function basis(across,up){
  const x=across.clone().normalize(),y=up.clone().addScaledVector(x,-up.dot(x)).normalize(),z=new THREE.Vector3().crossVectors(x,y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
export async function loadGuardian(scene){
  const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/guardian-rigged.glb`);
  gltf.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.pose();o.frustumCulled=false;o.castShadow=true;}});
  const group=new THREE.Group();group.add(gltf.scene);scene.add(group);
  const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),scale=2.8/size.y;
  group.scale.setScalar(scale);group.position.set(-(box.min.x+box.max.x)*scale/2,-box.min.y*scale,-(box.min.z+box.max.z)*scale/2);group.updateMatrixWorld(true);
  const all=[];group.traverse(o=>{if(o.isBone)all.push(o);});
  const bones={};for(const [key,names] of Object.entries(aliases))bones[key]=all.find(b=>names.includes(normalize(b.name)));
  if(Object.values(bones).some(b=>!b)){scene.remove(group);disposeModel(gltf.scene);throw new Error('模型骨骼未匹配');}
  const point=name=>bones[name].getWorldPosition(new THREE.Vector3());
  const restBasis=basis(point('RightUpperArm').sub(point('LeftUpperArm')),point('Head').sub(point('Root')));
  const rootRest=bones.Root.position.clone();
  const entries=Object.entries(bones).map(([name,bone])=>({name,bone,rest:bone.getWorldQuaternion(new THREE.Quaternion()),dir:segments[name]?point(segments[name][2]).sub(point(name)).normalize():null}));
  const depth=b=>{let n=0;for(let p=b.parent;p;p=p.parent)n++;return n;};entries.sort((a,b)=>depth(a.bone)-depth(b.bone));
  let visible=true;
  return {group,bones,dispose(){group.removeFromParent();disposeModel(gltf.scene);},setVisible(value){visible=value;group.visible=value;},point,
    update(p){
      if(!visible)return;
      group.updateMatrixWorld(true);
      const torso=basis(vec(p.rs).sub(vec(p.ls)),vec(p.neck).sub(vec(p.waist)));
      const torsoDelta=torso.multiply(restBasis.clone().invert());
      for(const e of entries){
        let desired;
        if(e.dir){const [a,b]=segments[e.name];desired=new THREE.Quaternion().setFromUnitVectors(e.dir,vec(p[b]).sub(vec(p[a])).normalize()).multiply(e.rest);}
        else if(e.name.endsWith('Hand')){
          const side=e.name.startsWith('Left')?'Left':'Right',parentEntry=entries.find(v=>v.name===side+'LowerArm');
          const [a,b]=segments[side+'LowerArm'];desired=new THREE.Quaternion().setFromUnitVectors(parentEntry.dir,vec(p[b]).sub(vec(p[a])).normalize()).multiply(e.rest);
        }else if(e.name.endsWith('Foot')){
          const side=e.name.startsWith('Left')?'Left':'Right',parentEntry=entries.find(v=>v.name===side+'LowerLeg');
          const [a,b]=segments[side+'LowerLeg'];desired=new THREE.Quaternion().setFromUnitVectors(parentEntry.dir,vec(p[b]).sub(vec(p[a])).normalize()).multiply(e.rest);
        }else desired=torsoDelta.clone().multiply(e.rest);
        e.bone.quaternion.copy(e.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(desired);e.bone.updateMatrixWorld(true);
      }
      const parent=bones.Root.parent;parent.updateWorldMatrix(true,false);
      const origin=new THREE.Vector3(),displacement=new THREE.Vector3(p.waist[0],p.waist[1]-1.12,p.waist[2]);
      const inv=parent.matrixWorld.clone().invert();bones.Root.position.copy(rootRest).add(displacement.applyMatrix4(inv).sub(origin.applyMatrix4(inv)));group.updateMatrixWorld(true);
      const correction=Math.min(p.la[1],p.ra[1])-Math.min(point('LeftFoot').y,point('RightFoot').y);
      bones.Root.position.add(new THREE.Vector3(0,correction,0).applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv)));group.updateMatrixWorld(true);
    }
  };
}
