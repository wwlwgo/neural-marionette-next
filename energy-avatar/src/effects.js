import * as THREE from 'three';
export function createEffects(scene){
  const ball=new THREE.Group();scene.add(ball);ball.visible=false;
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},hue:{value:0}},vertexShader:'varying vec3 vNormal; void main(){vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vNormal; uniform float time; uniform float hue; void main(){float h=atan(vNormal.y,vNormal.x)*0.8+time*0.4+hue; vec3 c=0.55+0.45*cos(h+vec3(0.,2.1,4.2));float lines=pow(abs(sin(vNormal.y*18.+time*2.)),9.); gl_FragColor=vec4(c,0.16+lines*0.55); }'});
  ball.add(new THREE.Mesh(new THREE.SphereGeometry(1,48,32),material));
  const rings=[];for(let i=0;i<3;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.018,8,96),new THREE.MeshBasicMaterial({color:['#89f7ff','#f6a3ff','#ffeeb0'][i],transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));ball.add(ring);rings.push(ring);
  }
  const count=650,positions=new Float32Array(count*3),colors=new Float32Array(count*3),seeds=[];
  for(let i=0;i<count;i++){const a=i*2.399963,b=Math.acos(1-2*(i+.5)/count);seeds.push([a,b,.8+(i%17)/70]);const c=new THREE.Color().setHSL(i/count,.85,.7);c.toArray(colors,i*3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  ball.add(new THREE.Points(geometry,new THREE.PointsMaterial({size:.045,vertexColors:true,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false})));
  const tetherGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()]);
  const tether=new THREE.Line(tetherGeometry,new THREE.LineBasicMaterial({color:'#a3dfff',transparent:true,opacity:.4}));scene.add(tether);
  const moon=new THREE.Group();scene.add(moon);moon.position.set(1.25,3.3,-1);
  const moonMat=new THREE.MeshStandardMaterial({color:'#fff4cc',emissive:'#edb967',emissiveIntensity:.65,roughness:.7});moon.add(new THREE.Mesh(new THREE.SphereGeometry(.36,32,24),moonMat));
  for(let i=0;i<5;i++){const crater=new THREE.Mesh(new THREE.SphereGeometry(.04+(i%3)*.014,12,8),new THREE.MeshStandardMaterial({color:'#d7c79d',roughness:1}));crater.position.set(Math.sin(i*2.3)*.19,Math.cos(i*2.3)*.19,.29);moon.add(crater);}
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.52,.008,6,80),new THREE.MeshBasicMaterial({color:'#ffeabb',transparent:true,opacity:.5}));moon.add(halo);
  const baseMoon=new THREE.Vector3(1.25,3.3,-1);
  let heldCenter=null,launchFrom=null,lastPhase='idle';
  // Optional authored-clip integration: callbacks run once at each recognized node.
  const listeners=new Set();
  return {onNode(callback){listeners.add(callback);return()=>listeners.delete(callback);},
    update(state,time,hands){
      if(state.phase!==lastPhase){for(const callback of listeners)callback(state.phase);lastPhase=state.phase;if(state.phase==='launched')launchFrom=new THREE.Vector3().fromArray(hands||state.launchFrom);}
      if(state.phase==='idle'){launchFrom=null;moon.position.copy(baseMoon);}
      const active=state.phase!=='idle'&&state.phase!=='complete';ball.visible=active;tether.visible=state.phase==='charging'||state.phase==='expanded';
      let center=new THREE.Vector3().fromArray(hands||state.hands);
      if(state.tracking===false&&heldCenter&&tether.visible)center.copy(heldCenter);else heldCenter=center.clone();
      const t=state.flight,travel=Math.min(1,t*2),smooth=travel*travel*(3-2*travel);
      if(state.phase==='launched'){
        center.lerpVectors(launchFrom||center,baseMoon,smooth);center.y+=Math.sin(Math.PI*travel)*.45;
        moon.position.copy(baseMoon);moon.position.y+=Math.max(0,(t-.5)*2)*.65;
        center.copy(t>.5?moon.position:center);
      }
      if(state.phase==='complete')moon.position.set(baseMoon.x,baseMoon.y+.65,baseMoon.z);
      ball.position.copy(center);ball.scale.setScalar(state.radius*(state.phase==='launched'?1+t*.2:1));
      material.uniforms.time.value=time;
      rings.forEach((ring,i)=>{ring.rotation.set(time*(.3+i*.13)+i,time*.25+i*1.1,time*.2);});
      for(let i=0;i<count;i++){const [a,b,r]=seeds[i],angle=a+time*(.24+(i%5)*.05);positions[i*3]=Math.sin(b)*Math.cos(angle)*r;positions[i*3+1]=Math.cos(b)*r;positions[i*3+2]=Math.sin(b)*Math.sin(angle)*r;}
      geometry.attributes.position.needsUpdate=true;
      if(tether.visible&&hands){const a=tether.geometry.attributes.position;for(let i=0;i<3;i++)a.setXYZ(i,center.x+(i-1)*state.radius,center.y,center.z);a.needsUpdate=true;}
      halo.rotation.z=time*.15;moonMat.emissiveIntensity=state.phase==='complete'?1.5:.65;
    }
  };
}
