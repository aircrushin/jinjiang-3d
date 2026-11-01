import * as THREE from '../../vendor/three/build/three.module.js';
function mat(c,em=0){return new THREE.MeshStandardMaterial({color:c,roughness:.72,metalness:.05,emissive:em?c:0,emissiveIntensity:em?1.8:0});}
function roof(g,w,d,y,c){const geo=new THREE.ConeGeometry(Math.max(w,d)*.72,y*.32,4);const m=new THREE.Mesh(geo,mat(c));m.scale.set(w/Math.max(w,d),1,d/Math.max(w,d));m.position.y=y; m.rotation.y=Math.PI/4;g.add(m)}
function box(g,w,h,d,y,c){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.y=y;g.add(m);return m}
function coveredRoof(g,x,z,w,d,y,levels=2){for(let i=0;i<levels;i++){const ww=w-i*1.5,dd=d-i*.55;box(g,ww,.42,dd,y+i*.72,0x241d1b);const r=new THREE.Mesh(new THREE.ConeGeometry(Math.max(ww,dd)*.62,.72,4),mat(0x171b1d));r.scale.set(ww/Math.max(ww,dd),1,dd/Math.max(ww,dd));r.rotation.y=Math.PI/4;r.position.set(x,y+i*.72+.5,z);g.add(r)}}
function canvasTex(w, h, draw, rx, ry) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}
function drawTiles(ctx, w, h) {
  ctx.fillStyle = '#2a302c';
  ctx.fillRect(0, 0, w, h);
  const cols = 4;
  const cw = w / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * cw;
    const grad = ctx.createLinearGradient(x, 0, x + cw, 0);
    grad.addColorStop(0, '#242826');
    grad.addColorStop(0.28, '#5c6660');
    grad.addColorStop(0.48, '#c4c8be');
    grad.addColorStop(0.62, '#6a736c');
    grad.addColorStop(1, '#1e2420');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x + 3, h - 8);
    ctx.quadraticCurveTo(x + cw * 0.5, 8, x + cw - 3, h - 8);
    ctx.lineTo(x + cw - 8, h);
    ctx.lineTo(x + 8, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#141816';
  ctx.fillRect(0, h - 7, w, 7);
}
function drawStone(ctx, w, h) {
  ctx.fillStyle = '#7a7368';
  ctx.fillRect(0, 0, w, h);
  const cw = 56;
  const ch = 36;
  for (let y = 0; y < h; y += ch) {
    const shift = (y / ch) % 2 ? cw / 2 : 0;
    for (let x = -cw; x < w + cw; x += cw) {
      const n = ((x * 3 + y * 5) % 28) - 14;
      ctx.fillStyle = `rgb(${122 + n},${115 + n},${104 + n})`;
      ctx.fillRect(x + shift + 2, y + 2, cw - 4, ch - 4);
    }
  }
}
function simpleBridge(){
  const g = new THREE.Group();
  g.name = 'anshun-simple-bridge';
  const L = 96, W = 14, deckTop = 0.42, deckH = 1.15, deckY = deckTop - deckH / 2;
  const pierBottom = -3.4, pierTop = deckY - deckH / 2, pierH = pierTop - pierBottom, pierY = (pierTop + pierBottom) / 2;
  const lacquer = mat(0x7a3e36);
  const timber = mat(0x6a5040);
  const pale = mat(0xe4dcd0);
  const stone = mat(0x6e675e);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: canvasTex(256, 64, drawTiles, 16, 8), roughness: 0.58, metalness: 0.04 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: canvasTex(256, 128, drawStone, 10, 3), roughness: 0.84, metalness: 0.02 });
  const soffitMat = new THREE.MeshStandardMaterial({ color: 0xcbb89a, roughness: 0.8, emissive: 0xffd2a4, emissiveIntensity: 0.35 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffe6c2, emissive: 0xffb15a, emissiveIntensity: 4, roughness: 0.32 });
  const put = (geo, material) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  put(new THREE.BoxGeometry(L, deckH, W), stone).position.y = deckY;
  put(new THREE.BoxGeometry(L - 0.8, 0.07, W - 1.4), deckMat).position.y = deckTop + 0.045;
  for (const x of [-30, -15, 0, 15, 30]) {
    const pier = put(new THREE.BoxGeometry(2.6, pierH, 4.6), stone);
    pier.position.set(x, pierY, 0);
    const wet = put(new THREE.BoxGeometry(2.7, 0.7, 4.7), mat(0x3e3a36));
    wet.position.set(x, pierBottom + 0.55, 0);
    const cap = put(new THREE.BoxGeometry(4.4, 0.42, 6.6), mat(0x5c564e));
    cap.position.set(x, pierTop - 0.2, 0);
  }
  for (const x of [-52, 52]) {
    put(new THREE.BoxGeometry(12, deckH, W), stone).position.set(x, deckY, 0);
    put(new THREE.BoxGeometry(12, 0.7, W), mat(0x8a8176)).position.set(x, -0.2, 0);
  }

  const postH = 3.05;
  const postZ = 5.35;
  const eaveY = deckTop + postH + 0.22;
  const postGeo = new THREE.BoxGeometry(0.32, postH, 0.32);
  const capGeo = new THREE.BoxGeometry(0.5, 0.14, 0.5);
  for (const z of [-postZ, postZ]) {
    const rail = put(new THREE.BoxGeometry(92, 0.92, 0.18), pale);
    rail.position.set(0, deckTop + 0.58, z);
    const hand = put(new THREE.BoxGeometry(92, 0.1, 0.28), lacquer);
    hand.position.set(0, deckTop + 1.08, z);
    const beam = put(new THREE.BoxGeometry(96, 0.24, 0.42), timber);
    beam.position.set(0, deckTop + postH + 0.08, z);
    for (let x = -45; x <= 45; x += 6) {
      put(postGeo, lacquer).position.set(x, deckTop + postH / 2, z);
      put(capGeo, timber).position.set(x, deckTop + postH + 0.02, z);
      const bracket = put(new THREE.BoxGeometry(0.2, 0.16, 1.05), timber);
      bracket.position.set(x, eaveY - 0.02, z + Math.sign(z) * 0.55);
    }
  }

  const rise = 1.7;
  const roofW = 13.4;
  const roofL = 100;
  const slopeLen = Math.hypot(roofW / 2, rise);
  const ang = Math.atan2(rise, roofW / 2);
  const slopeGeo = new THREE.BoxGeometry(roofL, 0.14, slopeLen);
  for (const s of [-1, 1]) {
    const slope = put(slopeGeo, tileMat);
    slope.position.set(0, eaveY + rise * 0.5, s * roofW * 0.25);
    slope.rotation.x = s * ang;
    const lip = put(new THREE.BoxGeometry(roofL, 0.1, 0.22), mat(0xd9c7a8));
    lip.position.set(0, eaveY + 0.04, s * (roofW / 2));
  }
  put(new THREE.BoxGeometry(roofL + 0.6, 0.22, 0.46), mat(0x2a2624)).position.y = eaveY + rise + 0.06;
  const soffit = put(new THREE.BoxGeometry(roofL - 1.2, 0.08, roofW - 2.2), soffitMat);
  soffit.position.y = eaveY - 0.02;
  soffit.castShadow = false;

  const lampGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const cordGeo = new THREE.BoxGeometry(0.04, 0.55, 0.04);
  for (let x = -36; x <= 36; x += 12) {
    put(cordGeo, timber).position.set(x, eaveY - 0.32, 0);
    const lamp = put(lampGeo, lanternMat);
    lamp.position.set(x, eaveY - 0.72, 0);
    lamp.castShadow = false;
    const light = new THREE.PointLight(0xffb36a, 14, 12, 2);
    light.position.set(x, eaveY - 0.55, 0);
    g.add(light);
  }

  return { group: g, height: 6.4, planBoundary: [[-58, -8], [58, -8], [58, 8], [-58, 8]], focus: [0, 3, 0], detailFocus: [0, 2, 0], labels: [] };
}function drawCurtain(ctx, w, h) {
  ctx.fillStyle = '#1c2830';
  ctx.fillRect(0, 0, w, h);
  const cols = 4;
  const rows = 6;
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = '#8ea3a4';
    ctx.fillRect(0, r * rh, w, rh * 0.14);
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const y = r * rh;
      ctx.fillStyle = (r + c) % 2 ? '#7f98a0' : '#b7c8cc';
      ctx.fillRect(x + cw * 0.1, y + rh * 0.2, cw * 0.8, rh * 0.68);
      const shine = ctx.createLinearGradient(x, y, x + cw, y + rh);
      shine.addColorStop(0, 'rgba(255,255,255,0.38)');
      shine.addColorStop(0.45, 'rgba(255,255,255,0.02)');
      shine.addColorStop(1, 'rgba(8,14,18,0.28)');
      ctx.fillStyle = shine;
      ctx.fillRect(x + cw * 0.1, y + rh * 0.2, cw * 0.8, rh * 0.68);
    }
  }
}
function gableRoof(g, length, width, eaveY, rise, tileMat, lipMat, ridgeMat) {
  const slopeLen = Math.hypot(width / 2, rise);
  const ang = Math.atan2(rise, width / 2);
  const slopeGeo = new THREE.BoxGeometry(length, 0.12, slopeLen);
  for (const s of [-1, 1]) {
    const slope = new THREE.Mesh(slopeGeo, tileMat);
    slope.position.set(0, eaveY + rise * 0.5, s * width * 0.25);
    slope.rotation.x = s * ang;
    g.add(slope);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(length + 0.5, 0.08, 0.16), lipMat);
    lip.position.set(0, eaveY + 0.03, s * (width / 2));
    g.add(lip);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(length + 0.2, 0.16, 0.28), ridgeMat);
  ridge.position.y = eaveY + rise + 0.05;
  g.add(ridge);
  const geo = new THREE.BufferGeometry();
  const hw = width / 2;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.06, 0, -hw, -0.06, 0, hw, -0.06, rise, 0,
    0.06, 0, hw, 0.06, 0, -hw, 0.06, rise, 0,
  ]), 3));
  geo.setIndex([0, 1, 2, 3, 4, 5]);
  geo.computeVertexNormals();
  for (const x of [-length / 2, length / 2]) {
    const plate = new THREE.Mesh(geo, lipMat);
    plate.position.set(x, eaveY, 0);
    g.add(plate);
  }
}
function shade(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
}
function pavilion() {
  const g = new THREE.Group();
  g.name = 'hejiangting';
  const lacquer = mat(0x8d342c);
  const timber = mat(0x6d5342);
  const pale = mat(0xe7dfd4);
  const stone = mat(0x8a8176);
  const stoneDark = mat(0x5e584f);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: canvasTex(256, 64, drawTiles, 8, 4), roughness: 0.58, metalness: 0.04 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: canvasTex(256, 128, drawStone, 6, 4), roughness: 0.84 });
  const lip = mat(0xd9c7a8);
  const ridge = mat(0x2a2624);
  const platW = 16.2;
  const platD = 12.2;
  const platH = 1.12;
  const base = new THREE.Mesh(new THREE.BoxGeometry(platW, platH, platD), stoneDark);
  base.position.y = platH / 2;
  g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(platW - 0.5, 0.08, platD - 0.5), deckMat);
  top.position.y = platH + 0.04;
  g.add(top);
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 1.4), stone);
    step.position.set(0, platH - i * 0.28, platD / 2 - 0.15 + i * 1.05);
    g.add(step);
  }
  const colH = 4.05;
  const colGeo = new THREE.CylinderGeometry(0.34, 0.4, colH, 12);
  const baseGeo = new THREE.CylinderGeometry(0.52, 0.56, 0.28, 12);
  const capGeo = new THREE.BoxGeometry(0.72, 0.16, 0.72);
  const eave = platH + colH;
  for (const x of [-5.8, 5.8]) {
    for (const z of [-4.1, 0, 4.1]) {
      const col = new THREE.Mesh(colGeo, lacquer);
      col.position.set(x, platH + colH / 2, z);
      g.add(col);
      const foot = new THREE.Mesh(baseGeo, stone);
      foot.position.set(x, platH + 0.16, z);
      g.add(foot);
      const capital = new THREE.Mesh(capGeo, timber);
      capital.position.set(x, eave - 0.02, z);
      g.add(capital);
    }
  }
  for (const z of [-4.1, 4.1]) {
    const col = new THREE.Mesh(colGeo, lacquer);
    col.position.set(0, platH + colH / 2, z);
    g.add(col);
    const capital = new THREE.Mesh(capGeo, timber);
    capital.position.set(0, eave - 0.02, z);
    g.add(capital);
  }
  const farRail = new THREE.Mesh(new THREE.BoxGeometry(platW - 1.4, 0.72, 0.16), pale);
  farRail.position.set(0, platH + 0.5, -4.7);
  g.add(farRail);
  const farHand = new THREE.Mesh(new THREE.BoxGeometry(platW - 1.2, 0.08, 0.24), lacquer);
  farHand.position.set(0, platH + 0.92, -4.7);
  g.add(farHand);
  for (const x of [-4.6, 4.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.72, 0.16), pale);
    rail.position.set(x, platH + 0.5, 4.7);
    g.add(rail);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 0.24), lacquer);
    hand.position.set(x, platH + 0.92, 4.7);
    g.add(hand);
  }
  for (const x of [-6.5, 6.5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, platD - 1.6), pale);
    rail.position.set(x, platH + 0.5, 0);
    g.add(rail);
  }
  const beamX = new THREE.Mesh(new THREE.BoxGeometry(platW - 0.4, 0.28, 0.36), timber);
  beamX.position.set(0, eave + 0.12, 4.1);
  g.add(beamX);
  const beamX2 = beamX.clone();
  beamX2.position.z = -4.1;
  g.add(beamX2);
  const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, platD - 0.6), timber);
  beamZ.position.set(5.8, eave + 0.28, 0);
  g.add(beamZ);
  const beamZ2 = beamZ.clone();
  beamZ2.position.x = -5.8;
  g.add(beamZ2);
  gableRoof(g, 17.4, 13.4, eave + 0.2, 1.55, tileMat, lip, ridge);
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.08, 11.2), new THREE.MeshStandardMaterial({ color: 0xd8c4a6, roughness: 0.8, emissive: 0xffd8b0, emissiveIntensity: 0.28 }));
  soffit.position.y = eave + 0.16;
  g.add(soffit);
  const mezz = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.28, 5.4), timber);
  mezz.position.y = eave + 1.85;
  g.add(mezz);
  const upperH = 1.7;
  const upperGeo = new THREE.CylinderGeometry(0.22, 0.26, upperH, 10);
  const upperEave = eave + 1.85 + upperH;
  for (const x of [-2.4, 2.4]) for (const z of [-1.6, 1.6]) {
    const col = new THREE.Mesh(upperGeo, lacquer);
    col.position.set(x, eave + 1.85 + upperH / 2, z);
    g.add(col);
  }
  const upperTile = new THREE.MeshStandardMaterial({ color: 0xffffff, map: canvasTex(256, 64, drawTiles, 5, 3), roughness: 0.58, metalness: 0.04 });
  gableRoof(g, 8.8, 6.6, upperEave, 1.25, upperTile, lip, ridge);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffe6c2, emissive: 0xffb15a, emissiveIntensity: 3.4, roughness: 0.3 });
  for (const x of [-3.2, 3.2]) {
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), timber);
    cord.position.set(x, eave - 0.05, 0);
    g.add(cord);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lanternMat);
    lamp.position.set(x, eave - 0.38, 0);
    g.add(lamp);
  }
  const glow = new THREE.PointLight(0xffb36a, 10, 16, 2);
  glow.position.set(0, eave - 0.2, 0);
  g.add(glow);
  shade(g);
  soffit.castShadow = false;
  g.traverse((o) => {
    if (o.material?.emissiveIntensity > 2) o.castShadow = false;
  });
  return { group: g, height: 12.4, planBoundary: [[-9, -7], [9, -7], [9, 7], [-9, 7]], focus: [0, 6, 0], detailFocus: [0, 4, 0], labels: [] };
}
function climbingPanda(g, x, y, z, s) {
  const rig = new THREE.Group();
  rig.position.set(x, y, z);
  rig.scale.setScalar(s);
  rig.rotation.y = -Math.PI / 4;
  const white = mat(0xf3f0e7);
  const black = mat(0x16181a);
  const add = (geo, material) => {
    const mesh = new THREE.Mesh(geo, material);
    rig.add(mesh);
    return mesh;
  };
  const body = add(new THREE.SphereGeometry(1.2, 16, 12), white);
  body.scale.set(1.2, 1.35, 0.9);
  const yoke = add(new THREE.SphereGeometry(1.05, 14, 10), black);
  yoke.scale.set(1.35, 0.55, 1.05);
  yoke.position.y = 0.72;
  const head = add(new THREE.SphereGeometry(0.86, 16, 12), white);
  head.position.set(0, 2.15, -0.2);
  for (const sx of [-1, 1]) {
    const ear = add(new THREE.SphereGeometry(0.46, 10, 8), black);
    ear.position.set(sx * 0.62, 2.85, -0.05);
    const eye = add(new THREE.SphereGeometry(0.36, 10, 8), black);
    eye.scale.set(1.15, 1.4, 0.45);
    eye.position.set(sx * 0.4, 2.15, -0.78);
    const arm = add(new THREE.CylinderGeometry(0.28, 0.34, 2.05, 8), black);
    arm.position.set(sx * 1.25, 2.05, -0.15);
    arm.rotation.z = sx * -0.95;
    const leg = add(new THREE.CylinderGeometry(0.32, 0.38, 1.45, 8), black);
    leg.position.set(sx * 0.55, -1.2, 0.15);
    leg.rotation.z = sx * 0.25;
  }
  const nose = add(new THREE.SphereGeometry(0.16, 8, 6), black);
  nose.position.set(0, 1.9, -0.95);
  g.add(rig);
}
function ifs() {
  const g = new THREE.Group();
  g.name = 'ifs-main-tower';
  const w = 44;
  const d = 34;
  const h = 248;
  box(g, 86, 5, 68, 2.5, 0x303a42);
  box(g, 74, 8, 58, 8.5, 0x55636b);
  box(g, 58, 5, 48, 15, 0x26343c);
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: canvasTex(256, 256, drawCurtain, 5, 8),
    roughness: 0.18,
    metalness: 0.62,
  });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h - 18, d), glass);
  tower.position.y = (h + 18) / 2;
  g.add(tower);
  for (const y of [28, 48, 68, 88, 108, 128, 148, 168, 188, 208, 228]) box(g, w + 1.1, 0.55, d + 1.1, y, 0xd5e2e4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pier = box(g, 0.85, h - 16, 0.85, (h + 20) / 2, 0x1a262c);
    pier.position.x = sx * (w / 2);
    pier.position.z = sz * (d / 2);
  }
  box(g, 30, 7, 26, h - 3, 0x2a3d46);
  const crown = box(g, w + 2.4, 1.1, d + 2.4, h - 8, 0xd7e4e6);
  crown.material = new THREE.MeshStandardMaterial({ color: 0xd7e4e6, emissive: 0xc9ddd4, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.4 });
  box(g, 22, 2, 19, h + 2, 0x17282f);
  climbingPanda(g, -w / 2 - 2.4, 90, -d / 2 - 2.4, 2.5);
  climbingPanda(g, -w / 2 - 2.1, 124, -d / 2 - 2.1, 2.05);
  climbingPanda(g, -w / 2 - 1.8, 156, -d / 2 - 1.8, 1.7);
  shade(g);
  return { group: g, height: h + 10, planBoundary: [[-43, -34], [43, -34], [43, 34], [-43, 34]], focus: [0, 110, 0], detailFocus: [-18, 92, -18], labels: [] };
}
export function buildSample(id, data) { return id === 'ANSHUN_SIMPLE' ? simpleBridge() : id === 'HEJIANG' ? pavilion() : id === 'IFS' ? ifs() : null; }









