import * as THREE from '../../vendor/three/build/three.module.js';
function mat(c,em=0){return new THREE.MeshStandardMaterial({color:c,roughness:.72,metalness:.05,emissive:em?c:0,emissiveIntensity:em?1.8:0});}
function roof(g,w,d,y,c){const geo=new THREE.ConeGeometry(Math.max(w,d)*.72,y*.32,4);const m=new THREE.Mesh(geo,mat(c));m.scale.set(w/Math.max(w,d),1,d/Math.max(w,d));m.position.y=y; m.rotation.y=Math.PI/4;g.add(m)}
function box(g,w,h,d,y,c){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.y=y;g.add(m);return m}
function coveredRoof(g,x,z,w,d,y,levels=2){for(let i=0;i<levels;i++){const ww=w-i*1.5,dd=d-i*.55;box(g,ww,.42,dd,y+i*.72,0x241d1b);const r=new THREE.Mesh(new THREE.ConeGeometry(Math.max(ww,dd)*.62,.72,4),mat(0x171b1d));r.scale.set(ww/Math.max(ww,dd),1,dd/Math.max(ww,dd));r.rotation.y=Math.PI/4;r.position.set(x,y+i*.72+.5,z);g.add(r)}}
function simpleBridge(){const g=new THREE.Group();g.name='anshun-simple-bridge';const L=82,W=14;box(g,L,1.6,W,4.8,0x535b62);for(const x of[-30,-15,0,15,30]){const pier=box(g,2.8,5.2,5.2,2.1,0x77716b);pier.position.x=x;box(g,4.2,.5,7,0.15,0x56504a).position.x=x}for(const z of[-6,6]){box(g,L,.28,.35,6.0,0x263238).position.z=z;for(let x=-40;x<=40;x+=3){const rail=box(g,.12,1.1,.12,6.45,0x39454a);rail.position.set(x,6.45,z)}}for(const x of[-43,43]){box(g,8,1.6,W,4.8,0x535b62).position.x=x;box(g,8,.3,W,4.0,0x73777a).position.x=x}return {group:g,height:7,planBoundary:[[-45,-8],[45,-8],[45,8],[-45,8]],focus:[0,5,0],detailFocus:[0,5,0],labels:[]}}function pavilion(){const g=new THREE.Group();g.name='hejiangting';box(g,18,1.3,14,1,0x8b6b4b);for(const x of[-6,6])for(const z of[-4.5,4.5]){const c=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,8,10),mat(0x8c5b38));c.position.set(x,5,z);g.add(c)}box(g,15,1,11,9,0x70482d);roof(g,19,15,14,0x2d4a39);roof(g,13,10,16,0x375b45);return {group:g,height:18,planBoundary:[[-9,-7],[9,-7],[9,7],[-9,7]],focus:[0,8,0],detailFocus:[0,8,0],labels:[]}}
function panda(g,x,y,z,s=1){const white=mat(0xe8e6dc),black=mat(0x17191a);const body=new THREE.Mesh(new THREE.SphereGeometry(2.2*s,16,12),white);body.scale.set(1,.9,.72);body.position.set(x,y,z);g.add(body);for(const [dx,dy,dz]of[[-1.5,1.35,.2],[1.5,1.35,.2],[-.72,.55,-1.8],[.72,.55,-1.8]]){const q=new THREE.Mesh(new THREE.SphereGeometry(.58*s,12,8),black);q.position.set(x+dx*s,y+dy*s,z+dz*s);g.add(q)}const head=new THREE.Mesh(new THREE.SphereGeometry(1.35*s,16,12),white);head.position.set(x,y+2.1*s,z);g.add(head);for(const dx of[-.55,.55]){const q=new THREE.Mesh(new THREE.SphereGeometry(.42*s,12,8),black);q.position.set(x+dx*s,y+2.45*s,z-.98*s);g.add(q)}}
function ifs(){const g=new THREE.Group();g.name='ifs-main-tower';const w=44,d=34,h=248;box(g,86,5,68,2.5,0x303a42);box(g,74,8,58,8.5,0x55636b);box(g,58,5,48,15,0x26343c);const tower=box(g,w,h-18,d,(h+18)/2,0x647d88);tower.material.roughness=.32;tower.material.metalness=.35;
for(const y of[28,48,68,88,108,128,148,168,188,208,228])box(g,w+1,.65,d+1,y,0xa3bcc2);
for(const z of[-d/2-.35,d/2+.35])for(let x=-w/2+2;x<w/2;x+=4.4){const mull=box(g,.22,h-22,.18,(h+18)/2,0x263a45);mull.position.x=x;mull.position.z=z}
for(const x of[-w/2-.35,w/2+.35])for(let z=-d/2+2;z<d/2;z+=4.4){const mull=box(g,.18,h-22,.22,(h+18)/2,0x263a45);mull.position.x=x;mull.position.z=z}
box(g,30,7,26, h-3,0x2a3d46);box(g,22,2,19,h+2,0x17282f);for(let i=0;i<7;i++){const fin=box(g,.3,18,1.2,42+i*22,0xc2d6d8);fin.position.x=-w/2-1.2;fin.position.z=-d/2-1.1}panda(g,-w/2-2,92,-d/2-2,2.3);panda(g,-w/2-2,126,-d/2-2,1.8);panda(g,-w/2-2,158,-d/2-2,1.5);return {group:g,height:h+10,planBoundary:[[-43,-34],[43,-34],[43,34],[-43,34]],focus:[0,110,0],detailFocus:[-18,92,-18],labels:[]}}export function buildSample(id,data){return id==='ANSHUN_SIMPLE'?simpleBridge():id==='HEJIANG'?pavilion():id==='IFS'?ifs():null}









