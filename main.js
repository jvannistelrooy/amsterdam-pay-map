(function(){
"use strict";
/* ---------- coordinates: WGS84 → RD New (EPSG:28992) → scene km, origin at the Dam, north = -z ---------- */
function rd(lat,lng){const p=0.36*(lat-52.15517440),l=0.36*(lng-5.38720621);
  const X=155000+190094.945*l-11832.228*p*l-114.221*p*p*l-32.391*l**3-0.705*p-2.340*p**3*l-0.608*p*l**3+0.008*l*l+0.148*p*p*l**3;
  const Y=463000+309056.544*p+3638.893*l*l+73.077*p*p-157.984*p*l*l+59.788*p**3+0.433*l-6.439*p*p*l*l-0.032*p*l+0.092*l**4-0.054*p*l**4;return [X,Y];}
const [X0,Y0]=rd(52.3731,4.8926);
const sxz=(X,Y)=>[(X-X0)/1000,-(Y-Y0)/1000];
const xz=(lat,lng)=>{const r=rd(lat,lng);return sxz(r[0],r[1]);};
const V3=(lat,lng,y=0)=>{const p=xz(lat,lng);return new THREE.Vector3(p[0],y,p[1]);};
const $=s=>document.querySelector(s);
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp=THREE.MathUtils.clamp;
const RATES={EUR:[1,"€"],USD:[1.16,"$"],GBP:[0.87,"£"]};
let currency="EUR";
const money=(v,short=true)=>{const [r,s]=RATES[currency];const x=v*r;return short? s+(x>=1e6?(x/1e6).toFixed(2)+"M":Math.round(x/1000)+"K") : s+Math.round(x).toLocaleString("en-GB");};
const headRole=c=>c.roles.swe?"swe":Object.keys(c.roles)[0];
const headline=c=>{const r=c.roles[headRole(c)];return r.m||((r.r[0]+r.r[1])/2);};
const shortPay=c=>{const r=c.roles[headRole(c)];return r.m?money(r.m):"~"+money((r.r[0]+r.r[1])/2);};
const hash=n=>{n=(n^61)^(n>>>16);n=n+(n<<3);n=n^(n>>>4);n=Math.imul(n,0x27d4eb2d);n=n^(n>>>15);return (n>>>0)/4294967296;};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- renderer & scene ---------- */
const canvas=$("#gl");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,logarithmicDepthBuffer:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new THREE.Scene();
scene.background=new THREE.Color();scene.fog=new THREE.FogExp2(0,0.03);
const camera=new THREE.PerspectiveCamera(42,1,0.0015,120);
const hemi=new THREE.HemisphereLight(0xffffff,0x888888,1);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,1);sun.position.set(-5,9,7);scene.add(sun);
const U={night:{value:1}};

const P={bg:0x0a111c,ground:0x101722,water:0x14304d,waterE:0x0b223f,waterEI:1,grass:0x13261d,wood:0x0f2018,rail:0x161c26,sand:0x1b1d22,
  roads:[0x18202c,0x2c1f28,0x222c3b,0x2f3848,0x5e4a2c],track:[0x3b4352,0x34404e,0x3d3f55],tree:0x1a3325,
  hemi:[0x6f86b8,0x1a1420,.42],sun:[0xbfd0ff,.26],fog:.04};
const M={
 ground:new THREE.MeshStandardMaterial({roughness:1}),
 water:new THREE.MeshStandardMaterial({roughness:.3,metalness:.2,side:THREE.DoubleSide}),
 green:[null,1,2,3,4].map(v=>v&&new THREE.MeshStandardMaterial({roughness:1,side:THREE.DoubleSide})),
 roads:[0,1,2,3,4].map(()=>new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),
 track:[0,1,2].map(()=>new THREE.LineBasicMaterial({transparent:true,opacity:.9})),
 tree:new THREE.MeshStandardMaterial({roughness:.9,flatShading:true})
};
const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),M.ground);ground.rotation.x=-Math.PI/2;scene.add(ground);

// Buildings: flat-shaded LoD1.2 extrusions with procedural windows (floor/bay grid from world position, lit at night, faded with distance).
const bMat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.88,side:THREE.DoubleSide});
bMat.onBeforeCompile=sh=>{
  sh.uniforms.uNight=U.night;
  sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nattribute float aH;varying float vH;varying vec3 vWPos;")
   .replace("#include <project_vertex>","#include <project_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.0)).xyz;vH=aH;");
  sh.fragmentShader=sh.fragmentShader.replace("#include <common>","#include <common>\nuniform float uNight;varying float vH;varying vec3 vWPos;")
   .replace("#include <color_fragment>",`#include <color_fragment>
    vec3 fn=normalize(cross(dFdx(vWPos),dFdy(vWPos)));
    float vert=1.0-step(0.5,abs(fn.y));
    vec2 tg=normalize(vec2(-fn.z,fn.x)+1e-6);
    vec2 g=vec2(dot(vWPos.xz,tg)/0.0029,vWPos.y/0.0031);
    vec2 cell=floor(g);vec2 f=fract(g);
    float tall=step(4.5,vH);
    float win=step(0.25,f.x)*step(f.x,0.75)*step(0.28,f.y)*step(f.y,0.76)*vert*tall*step(0.0028,vWPos.y)*step(vWPos.y,vH*0.001-0.0009);
    float hsh=fract(sin(dot(cell,vec2(12.9898,78.233))+vH*1.37)*43758.5453);
    float fade=1.0-smoothstep(0.7,2.6,length(vWPos-cameraPosition));
    diffuseColor.rgb*=mix(0.6,1.0,smoothstep(0.0,0.008,vWPos.y));
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*0.42+vec3(0.05,0.06,0.08),win*fade*0.8);
    // Far away, each facade takes on the summed glow of its windows (varied per building) and roofs pick up a warm tint.
    float bh=fract(sin(dot(vColor.rgb,vec3(12.9898,78.233,37.719))+vH*3.17)*43758.5453);
    float t=clamp(vWPos.y/max(vH*0.001,0.0004),0.0,1.0);
    float rim=vert*tall*smoothstep(0.82,1.0,t)*0.22;
    float far=smoothstep(1.0,5.0,length(vWPos-cameraPosition));
    float roofGlow=(1.0-vert)*step(3.0,vH)*(0.07+0.2*bh)*far;
    float agg=vert*tall*(0.3+0.42*bh)*(0.7+0.4*t);
    float winGlow=uNight*(mix(agg,win*step(0.5,hsh)*(0.75+0.55*hsh),fade)+rim*(1.0-fade*0.6)+roofGlow);`)
   .replace("#include <emissivemap_fragment>","#include <emissivemap_fragment>\ntotalEmissiveRadiance+=winGlow*vec3(1.0,0.72,0.4)*1.15;");
};
// Wall colour by construction year; roofs by roof type.
const ERA=[
 [1850,["#6b3327","#5a2b22","#4a2a24","#7d3f2e","#3a3432","#2d2c31","#cfc2a6","#8a4a35"]],
 [1920,["#8a4d39","#9a5841","#7a4232","#b39a7c","#a2654a","#6f3b2d"]],
 [1945,["#9c5236","#a85f40","#8a4a33","#7d4330","#b47355"]],
 [1975,["#c9c4ba","#b7b1a6","#d5d0c6","#bfb4a2","#a9a39a"]],
 [2000,["#a99e90","#9a8676","#c0b5a5","#8f8a85","#b59b80"]],
 [9999,["#7f8f9c","#9fb0bc","#d7d9d6","#5f6f7c","#a8b5bf","#c4b8a8"]]];
const ROOF={slanted:["#4b3f3d","#5a4a44","#3f3a3c","#6a4636"],flat:["#8a8780","#7b7872","#96928a","#6d6b68"]};
const hex2=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const ERA_RGB=ERA.map(([y,c])=>[y,c.map(hex2)]),ROOF_RGB={s:ROOF.slanted.map(hex2),f:ROOF.flat.map(hex2)};

/* ---------- city data ---------- */
async function loadCity(onProgress){
  const url="data/city.bin.gz";const res=await fetch(url);if(!res.ok)throw new Error("Map data could not be loaded ("+res.status+").");
  let buf;
  if(url.endsWith(".txt")){const bin=atob((await res.text()).trim());buf=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);}
  else buf=new Uint8Array(await res.arrayBuffer());
  if(buf[0]===0x1f&&buf[1]===0x8b){
    if(typeof DecompressionStream==="undefined")throw new Error("This browser can't unpack the map data. Try a current Chrome, Edge, Firefox or Safari.");
    buf=new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());}
  const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),hl=new DataView(ab).getUint32(0,true);
  const head=JSON.parse(new TextDecoder().decode(new Uint8Array(ab,4,hl)));const base=4+hl;
  const T={uint8:Uint8Array,uint16:Uint16Array,int16:Int16Array,uint32:Uint32Array},S={};
  head.sections.forEach(([n,t,o,l])=>{S[n]=new T[t](ab,base+o,l);});
  return {head,S};
}
function ringReader(Sa,XY){let k=0,p=0;return n=>{let x=Sa[2*k],y=Sa[2*k+1];k++;const o=new Float64Array(2*n);o[0]=x;o[1]=y;for(let i=1;i<n;i++){x+=XY[p++];y+=XY[p++];o[2*i]=x;o[2*i+1]=y;}return o;};}
const tick=()=>new Promise(r=>setTimeout(r,0));
let QX,QY,RES,BOUNDS={x0:-7,x1:8,z0:-6,z1:9};
const lampPos=[];

const buildingMeshes=[];
async function buildBuildings(head,S,progress){
  const CH=head.chunk,rd2=ringReader(S.bS,S.bXY);let b=0,ri=0,done=0;const total=head.chunks.reduce((a,c)=>a+c[2],0);
  for(const [ci,cj,count] of head.chunks){
    const cX=QX+ci*CH,cY=QY+cj*CH;const pos=[],col=[],hh=[],idx=[];let nv=0;
    for(let k=0;k<count;k++,b++){
      const h=S.bH[b]/10,yr=S.bYear[b],roof=S.bRoof[b],nr=S.bRings[b];
      const era=ERA_RGB.find(e=>yr<e[0])[1];const r1=hash(b*7+1),r2=hash(b*13+5);
      let wc=era[(r1*era.length)|0];if(h>40)wc=ERA_RGB[5][1][(r2*4)|0];
      const rc=(roof===1?ROOF_RGB.s:ROOF_RGB.f)[(r2*4)|0];const sh=0.9+r2*0.2;
      const hdm=Math.round(h*10),aH=Math.min(255,Math.round(h));
      const rings=[];
      for(let r=0;r<nr;r++,ri++){const q=rd2(S.bLen[ri]);const n=q.length/2,pts=new Float32Array(2*n);
        for(let i=0;i<n;i++){pts[2*i]=Math.round((QX+q[2*i]*RES-cX)*10);pts[2*i+1]=-Math.round((QY+q[2*i+1]*RES-cY)*10);}rings.push(pts);}
      // walls
      for(const pts of rings){const n=pts.length/2;
        for(let i=0;i<n;i++){const j=(i+1)%n,ax=pts[2*i],az=pts[2*i+1],bx=pts[2*j],bz=pts[2*j+1];
          pos.push(ax,0,az,bx,0,bz,bx,hdm,bz,ax,hdm,az);
          for(let v=0;v<4;v++){col.push(wc[0]*sh,wc[1]*sh,wc[2]*sh);hh.push(aH);}
          idx.push(nv,nv+1,nv+2,nv,nv+2,nv+3);nv+=4;}}
      // roof
      const contour=[],holes=[];rings.forEach((pts,r)=>{const a=[];for(let i=0;i<pts.length;i+=2)a.push(new THREE.Vector2(pts[i],pts[i+1]));if(r===0)contour.push(...a);else holes.push(a);});
      let faces;try{faces=THREE.ShapeUtils.triangulateShape(contour,holes);}catch(e){faces=[];}
      const all=contour.concat(...holes),r0=nv;
      all.forEach(v=>{pos.push(v.x,hdm,v.y);col.push(rc[0]*sh,rc[1]*sh,rc[2]*sh);hh.push(0);});nv+=all.length;
      faces.forEach(f=>idx.push(r0+f[0],r0+f[1],r0+f[2]));
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.BufferAttribute(new Int16Array(pos),3));
    g.setAttribute("color",new THREE.BufferAttribute(new Uint8Array(col.map(v=>Math.min(255,v))),3,true));
    g.setAttribute("aH",new THREE.BufferAttribute(new Uint8Array(hh),1,false));
    g.setIndex(new THREE.BufferAttribute(nv>65535?new Uint32Array(idx):new Uint16Array(idx),1));
    g.computeBoundingSphere();g.boundingSphere.radius*=1.05;
    const m=new THREE.Mesh(g,bMat);const o=sxz(cX,cY);m.position.set(o[0],0,o[1]);m.scale.setScalar(0.0001);scene.add(m);buildingMeshes.push(m);
    done+=count;progress(done/total);await tick();
  }
  return total;
}
function buildPolys(S,pfx,y,meshFor,lampsFrom){
  const C=S[pfx+"C"],N=S[pfx+"N"],L=S[pfx+"Len"],rdr=ringReader(S[pfx+"S"],S[pfx+"XY"]);const groups={};let li=0;
  for(let k=0;k<C.length;k++){const c=C[k];const G=groups[c]||(groups[c]={pos:[],idx:[],nv:0});const contour=[],holes=[];
    for(let r=0;r<N[k];r++,li++){const q=rdr(L[li]);const a=[];for(let i=0;i<q.length;i+=2){const p=sxz(QX+q[i]*RES,QY+q[i+1]*RES);a.push(new THREE.Vector2(p[0],p[1]));}if(r===0)contour.push(...a);else holes.push(a);}
    let faces;try{faces=THREE.ShapeUtils.triangulateShape(contour,holes);}catch(e){continue;}
    const all=contour.concat(...holes);all.forEach(v=>G.pos.push(v.x,y,v.y));faces.forEach(f=>G.idx.push(G.nv+f[0],G.nv+f[1],G.nv+f[2]));G.nv+=all.length;
    if(lampsFrom&&lampsFrom(c)&&contour.length){let sx=0,sz=0;contour.forEach(v=>{sx+=v.x;sz+=v.y;});lampPos.push(sx/contour.length,0.004,sz/contour.length);}}
  Object.entries(groups).forEach(([c,G])=>{const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(G.pos,3));g.setIndex(G.nv>65535?new THREE.Uint32BufferAttribute(G.idx,1):new THREE.Uint16BufferAttribute(G.idx,1));
    g.computeVertexNormals();const m=new THREE.Mesh(g,meshFor(+c));m.renderOrder=-1;scene.add(m);});
}
function buildRails(S){const C=S.lC,L=S.lLen,rdr=ringReader(S.lS,S.lXY);const g=[[],[],[]];
  for(let k=0;k<C.length;k++){const q=rdr(L[k]);for(let i=0;i+3<q.length;i+=2){const a=sxz(QX+q[i]*RES,QY+q[i+1]*RES),b=sxz(QX+q[i+2]*RES,QY+q[i+3]*RES);g[C[k]].push(a[0],0.0009,a[1],b[0],0.0009,b[1]);}}
  g.forEach((p,c)=>{const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(p,3));scene.add(new THREE.LineSegments(geo,M.track[c]));});}
function buildTrees(S){const n=S.tK.length,geo=new THREE.IcosahedronGeometry(1,0).translate(0,1.3,0);const im=new THREE.InstancedMesh(geo,M.tree,n);const o=new THREE.Object3D(),c=new THREE.Color();
  const TC=["#4f7f43","#5d8a4a","#476f3c","#6b9452","#3f6a3a"];
  for(let i=0;i<n;i++){const p=sxz(QX+S.tXY[2*i]*RES,QY+S.tXY[2*i+1]*RES),k=S.tK[i],r=hash(i*3+11);const s=(k===1?0.0036:0.003)+r*0.0024;
    o.position.set(p[0],0,p[1]);o.rotation.set(0,r*6,0);o.scale.set(s,s*1.2,s);o.updateMatrix();im.setMatrixAt(i,o.matrix);c.set(TC[(r*5)|0]).multiplyScalar(0.8+hash(i)*0.4);im.setColorAt(i,c);
    if(k===1&&i%3===0)lampPos.push(p[0],0.004,p[1]);}
  scene.add(im);return n;}
let lampPts=null;

/* ---------- metro ---------- */
const metroMat=LINES.map(L=>new THREE.MeshBasicMaterial({color:L.color,transparent:true,opacity:.95,depthWrite:false}));
LINES.forEach((L,k)=>{L.curve=new THREE.CatmullRomCurve3(L.st.map(s=>V3(s[1],s[2],0.003)),false,"catmullrom",0.3);L.len=L.curve.getLength();L.tu=hash(k+3);L.dir=1;L.mat=metroMat[k];
  L.train=new THREE.Group();for(let i=0;i<4;i++)L.train.add(new THREE.Mesh(new THREE.BoxGeometry(1,0.6,0.45),new THREE.MeshBasicMaterial({color:L.color})));scene.add(L.train);
  L.stations=new THREE.Group();L.st.forEach(s=>{const d=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:0xffffff}));d.position.copy(V3(s[1],s[2],0.003));L.stations.add(d);});scene.add(L.stations);});
let metroR=null,metroOn=true;
function updateMetro(d,dt){const r=clamp(d*0.0014,0.002,0.018),q=Math.round(Math.log(r)/Math.log(1.25));
  if(q!==metroR){metroR=q;const R=Math.pow(1.25,q);LINES.forEach(L=>{if(L.mesh){scene.remove(L.mesh);L.mesh.geometry.dispose();}L.mesh=new THREE.Mesh(new THREE.TubeGeometry(L.curve,300,R,5,false),L.mat);L.mesh.visible=metroOn;L.mesh.renderOrder=2;scene.add(L.mesh);
    L.stations.children.forEach(s=>s.scale.setScalar(R*2.2));L.car=R*6;});}
  LINES.forEach(L=>{L.tu+=L.dir*dt*0.25/L.len;if(L.tu>1){L.tu=1;L.dir=-1;}if(L.tu<0){L.tu=0;L.dir=1;}
    L.train.children.forEach((car,i)=>{const u=clamp(L.tu-L.dir*i*L.car*1.1/L.len,0,1);const p=L.curve.getPointAt(u),q2=L.curve.getPointAt(Math.min(1,u+0.002));car.scale.setScalar(L.car);car.position.set(p.x,0.003+L.car*0.3,p.z);car.lookAt(q2.x,car.position.y,q2.z);car.rotateY(Math.PI/2);});});}

/* ---------- pay pillars ---------- */
const heightOf=v=>0.04+Math.pow(v/100000,1.25)*0.25;
const pickables=[];
// Pillars sit on a warm, glowing city, so each one gets a bright core, a dark outline to cut it out of the background,
// a soft additive halo and a beacon on top that keeps a minimum screen size when zoomed out. Fog doesn't touch them.
const BEACON=(()=>{const c=document.createElement("canvas");c.width=c.height=64;const x=c.getContext("2d");const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(.18,"rgba(255,255,255,.85)");g.addColorStop(.45,"rgba(255,255,255,.22)");g.addColorStop(1,"rgba(255,255,255,0)");x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const WHITE=new THREE.Color(0xffffff);
COMPANIES.forEach((c,i)=>{
  c.id=i;const col=new THREE.Color(SECTORS[c.sec].color);const h=heightOf(headline(c));c.h=h;const w=0.018;
  const g=new THREE.BoxGeometry(w,h,w).translate(0,h/2,0);const cols=[];const pa=g.attributes.position;
  for(let k=0;k<pa.count;k++){const t=pa.getY(k)/h;const cc=col.clone().multiplyScalar(0.78+0.3*t).lerp(WHITE,Math.max(0,t-0.7)*0.9);cols.push(cc.r,cc.g,cc.b);}
  g.setAttribute("color",new THREE.Float32BufferAttribute(cols,3));
  const p=xz(c.ll[0],c.ll[1]);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,fog:false}));m.position.set(p[0],0,p[1]);m.userData.c=c;m.renderOrder=3;scene.add(m);
  const outline=new THREE.Mesh(new THREE.BoxGeometry(w*1.55,h,w*1.55).translate(0,h/2+0.0003,0),new THREE.MeshBasicMaterial({color:0x04070d,side:THREE.BackSide,fog:false}));outline.position.copy(m.position);outline.renderOrder=2;scene.add(outline);
  const halo=new THREE.Mesh(new THREE.BoxGeometry(w*3.2,h,w*3.2).translate(0,h/2,0),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.position.copy(m.position);halo.renderOrder=5;scene.add(halo);
  // flush top face, exactly the column's width
  const capCol=col.clone().lerp(WHITE,.65);
  const cap=new THREE.Mesh(new THREE.PlaneGeometry(w,w).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:capCol,fog:false}));cap.position.set(p[0],h+0.0002,p[1]);cap.renderOrder=3;cap.userData.col=capCol;scene.add(cap);
  const beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:BEACON,color:col.clone().lerp(WHITE,.35),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,fog:false}));beacon.position.set(p[0],h+0.002,p[1]);beacon.renderOrder=6;scene.add(beacon);
  // Ground ring: opaque and drawn right after the city with no depth test, so buildings never hide it,
  // while the outline and column (drawn after it) still cover it where they stand in front.
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.016,0.022,40),new THREE.MeshBasicMaterial({color:col.clone().lerp(WHITE,.2),depthWrite:false,depthTest:false,fog:false}));ring.rotation.x=-Math.PI/2;ring.position.set(p[0],0.002,p[1]);ring.renderOrder=1;scene.add(ring);
  // dark square closing the outline at the bottom
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(w*1.55,w*1.55).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x04070d,fog:false}));plate.position.set(p[0],0.0004,p[1]);plate.renderOrder=1.5;scene.add(plate);
  c.lift=0;c.obj={m,cap,ring,plate,outline,halo,beacon,fx:[outline,halo,beacon,plate],base:new THREE.Vector3(p[0],0,p[1]),anchor:new THREE.Vector3(p[0],h,p[1])};pickables.push(m);
});

// Lift each pillar (with its outline, glow, ring and floor) to just above the tallest roof within its ring,
// so it floats over the houses around the office instead of cutting through them.
const FLOAT_GAP=0.003;
function seatPillars(){scene.updateMatrixWorld(true);const rc=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),o=new THREE.Vector3();
  COMPANIES.forEach(c=>{const b=c.obj.base;let top=0;
    for(let k=0;k<17;k++){const r=k===0?0:(k<9?0.012:0.023),a=k*Math.PI/4;o.set(b.x+Math.cos(a)*r,1,b.z+Math.sin(a)*r);rc.set(o,down);
      const hit=rc.intersectObjects(buildingMeshes,false)[0];if(hit)top=Math.max(top,hit.point.y);}
    const lift=top>0?top+FLOAT_GAP:0;c.lift=lift;
    [c.obj.m,c.obj.outline,c.obj.halo,c.obj.cap,c.obj.beacon,c.obj.ring,c.obj.plate].forEach(x=>{x.position.y+=lift;});});}

/* ---------- palette (dark only) ---------- */
function applyPalette(){
  scene.background.setHex(P.bg);scene.fog.color.setHex(P.bg);scene.fog.density=P.fog;
  M.ground.color.setHex(P.ground);M.water.color.setHex(P.water);M.water.emissive.setHex(P.waterE);M.water.emissiveIntensity=P.waterEI;
  M.green[1].color.setHex(P.grass);M.green[2].color.setHex(P.wood);M.green[3].color.setHex(P.rail);M.green[4].color.setHex(P.sand);
  M.roads.forEach((m,i)=>m.color.setHex(P.roads[i]));M.track.forEach((m,i)=>m.color.setHex(P.track[i]));
  M.tree.color.setHex(0xffffff).lerp(new THREE.Color(P.tree),.8);
  hemi.color.setHex(P.hemi[0]);hemi.groundColor.setHex(P.hemi[1]);hemi.intensity=P.hemi[2];sun.color.setHex(P.sun[0]);sun.intensity=P.sun[1];
  U.night.value=1;}

/* ---------- camera & map controls ---------- */
const controls=new THREE.MapControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=0.09;controls.zoomSpeed=1.1;controls.rotateSpeed=0.55;controls.panSpeed=1;
controls.minDistance=0.05;controls.maxDistance=16;controls.minPolarAngle=0;controls.maxPolarAngle=1.3;
const TILT3D=0.95;let tilted=true;
const sph=new THREE.Spherical();
function camState(){sph.setFromVector3(new THREE.Vector3().subVectors(camera.position,controls.target));return {t:controls.target.clone(),d:sph.radius,phi:sph.phi,theta:sph.theta};}
function setCam(t,d,phi,theta){controls.target.copy(t);camera.position.copy(t).add(new THREE.Vector3().setFromSphericalCoords(d,phi,theta));camera.lookAt(t);}
let anim=null;
function animateTo(o,dur=1100){const a=camState();const b={t:o.t?o.t.clone():a.t,d:o.d??a.d,phi:o.phi??a.phi,theta:o.theta??a.theta};
  let dth=b.theta-a.theta;while(dth>Math.PI)dth-=2*Math.PI;while(dth<-Math.PI)dth+=2*Math.PI;b.theta=a.theta+dth;
  controls.minPolarAngle=0;controls.maxPolarAngle=1.3;anim={a,b,t0:performance.now(),dur:reduce?1:dur};}
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function stepAnim(now){if(!anim)return false;const u=ease(Math.min(1,(now-anim.t0)/anim.dur)),A=anim.a,B=anim.b;
  const lift=1+Math.sin(u*Math.PI)*Math.min(0.8,A.t.distanceTo(B.t)/Math.max(A.d,B.d)*0.5);
  setCam(A.t.clone().lerp(B.t,u),Math.exp(THREE.MathUtils.lerp(Math.log(A.d),Math.log(B.d),u))*lift,THREE.MathUtils.lerp(A.phi,B.phi,u),THREE.MathUtils.lerp(A.theta,B.theta,u));
  if(u>=1){anim=null;lockTilt();}return true;}
function lockTilt(){controls.minPolarAngle=0;controls.maxPolarAngle=tilted?1.3:0.0001;}
const HOME={t:V3(52.3700,4.8930),d:2.7,phi:TILT3D,theta:0.32};

/* ---------- labels ---------- */
const labelsEl=$("#labels");
let labelMode="all",pillarsOn=true,districtsOn=true,streetsOn=true;
const vis=(el,on)=>{if(el._v!==on){el._v=on;el.style.visibility=on?"visible":"hidden";}};
COMPANIES.forEach(c=>{const d=document.createElement("button");d.type="button";d.className="lab";d.innerHTML=`<i style="background:${SECTORS[c.sec].color}"></i><span>${esc(c.n)}</span><em></em>`;d.addEventListener("click",e=>{e.stopPropagation();openCompany(c,true);});labelsEl.appendChild(d);c.el=d;});
const keySet=new Set(COMPANIES.slice().sort((a,b)=>headline(b)-headline(a)).slice(0,12).map(c=>c.n));
const mk=(cls,html)=>{const d=document.createElement("div");d.className=cls;d.innerHTML=html;d._v=true;labelsEl.appendChild(d);return d;};
const LANDMARKS=[["Centraal Station",52.3789,4.9003],["A'DAM Toren",52.3845,4.9022],["EYE Filmmuseum",52.3843,4.8990],["Royal Palace",52.3731,4.8913],["Westerkerk",52.3747,4.8839],["Anne Frank Huis",52.3752,4.8840],["Rijksmuseum",52.3600,4.8852],["Van Gogh Museum",52.3584,4.8811],["Concertgebouw",52.3563,4.8791],["NEMO",52.3741,4.9123],["Oude Kerk",52.3744,4.8982],["Munttoren",52.3664,4.8937],["Magere Brug",52.3634,4.9025],["Artis",52.3660,4.9166],["Heineken Experience",52.3578,4.8916],["Muziekgebouw",52.3786,4.9126],["Olympisch Stadion",52.3434,4.8545],["RAI",52.3410,4.8890],["Johan Cruijff ArenA",52.3143,4.9419],["Station Zuid",52.3389,4.8730],["Amstel Station",52.3466,4.9179],["Station Sloterdijk",52.3889,4.8380],["Schiphol",52.3105,4.7630]];
const lmLabels=LANDMARKS.map(([n,a,b])=>({name:n,pos:V3(a,b,0.02),el:mk("lm",`<i></i>${esc(n)}`)}));
const distLabels=DISTRICTS.map(a=>({el:mk("ar",esc(a[0])),pos:V3(a[1],a[2],0.01)}));
const stLabels=[];LINES.forEach(L=>L.st.forEach(s=>{if(stLabels.some(x=>x.name===s[0]))return;stLabels.push({el:mk("st",`<i style="background:${L.color}"></i>${esc(s[0])}`),name:s[0],pos:V3(s[1],s[2],0.004)});}));
let waterLabels=[],roadLabels=[];
function refreshPrices(){COMPANIES.forEach(c=>{c.el.querySelector("em").textContent=shortPay(c);});}
refreshPrices();
const tmp=new THREE.Vector3(),tmp2=new THREE.Vector3();let W=1,H=1;
function scr(v){tmp.copy(v).project(camera);if(tmp.z>1||tmp.x<-1.08||tmp.x>1.08||tmp.y<-1.08||tmp.y>1.08)return null;return [(tmp.x*.5+.5)*W,(-tmp.y*.5+.5)*H];}
function place(el,v,offY=0,mode="b",rot=0){const r=scr(v);if(!r){vis(el,false);return null;}vis(el,true);r[1]+=offY;
  el.style.transform=`translate(${r[0]|0}px,${r[1]|0}px) translate(-50%,${mode==="b"?"-100%":"-50%"})${rot?` rotate(${rot.toFixed(3)}rad)`:""}`;return r;}
const hits=(b,placed)=>placed.some(p=>!(b[2]<p[0]||b[0]>p[2]||b[3]<p[1]||b[1]>p[3]));
let activeSectors=new Set(Object.keys(SECTORS)),selected=null,hovered=null;
function updateLabels(d){
  const placed=[],order=COMPANIES.slice().sort((a,b)=>(b===selected)-(a===selected)||b.h-a.h);
  for(const c of order){
    if(!(activeSectors.has(c.sec)&&(labelMode==="all"||keySet.has(c.n)||c===selected))){vis(c.el,false);continue;}
    c.obj.anchor.y=c.lift+(pillarsOn?Math.min(c.h+0.003,Math.max(0.02,d*0.3)):0.008);
    const r=place(c.el,c.obj.anchor,-6);if(!r)continue;
    const bw=c.el.offsetWidth||90,b=[r[0]-bw/2,r[1]-26,r[0]+bw/2,r[1]];
    if(c!==selected&&hits(b,placed)){vis(c.el,false);continue;}
    placed.push(b);c.el.classList.toggle("hot",c===selected||c===hovered);
  }
  const lmOn=d<3.2;for(const l of lmLabels){if(!lmOn){vis(l.el,false);continue;}const r=place(l.el,l.pos,-2);if(!r)continue;const w=l.el.offsetWidth||80,b=[r[0]-w/2,r[1]-18,r[0]+w/2,r[1]];if(hits(b,placed))vis(l.el,false);else placed.push(b);}
  const sOn=metroOn&&d<1.8;for(const s of stLabels){if(!sOn){vis(s.el,false);continue;}const r=place(s.el,s.pos,-4);if(!r)continue;const w=s.el.offsetWidth||80,b=[r[0]-w/2,r[1]-18,r[0]+w/2,r[1]];if(hits(b,placed))vis(s.el,false);else placed.push(b);}
  const wMin=4000*d*d;for(const l of waterLabels){if(l.area<wMin||d>9){vis(l.el,false);continue;}const r=place(l.el,l.pos,0,"c");if(!r)continue;const w=l.el.offsetWidth||60,b=[r[0]-w/2,r[1]-9,r[0]+w/2,r[1]+9];if(hits(b,placed))vis(l.el,false);else placed.push(b);}
  const rOn=streetsOn&&d<1.25,rMin=1600*d*d;
  for(const l of roadLabels){if(!rOn||l.area<rMin){vis(l.el,false);continue;}
    tmp2.copy(l.pos).add(l.dir);const a=scr(l.pos),bb=scr(tmp2);if(!a||!bb){vis(l.el,false);continue;}
    let ang=Math.atan2(bb[1]-a[1],bb[0]-a[0]);if(ang>Math.PI/2)ang-=Math.PI;if(ang<-Math.PI/2)ang+=Math.PI;
    const w=l.w||(l.w=l.el.offsetWidth||70),hw=Math.abs(Math.cos(ang))*w/2+6,hh=Math.abs(Math.sin(ang))*w/2+6,b=[a[0]-hw,a[1]-hh,a[0]+hw,a[1]+hh];
    if(hits(b,placed)){vis(l.el,false);continue;}placed.push(b);place(l.el,l.pos,0,"c",ang);}
  const dOn=districtsOn&&d>1.6&&d<12;for(const a of distLabels){if(!dOn){vis(a.el,false);continue;}const r=place(a.el,a.pos,0,"c");if(!r)continue;const w=a.el.offsetWidth||80,b=[r[0]-w/2,r[1]-10,r[0]+w/2,r[1]+10];if(hits(b,placed))vis(a.el,false);else placed.push(b);}
}

/* ---------- side panel: ranking, filters, search ---------- */
let rankRole="swe";
const rankRoleEl=$("#rankRole");
["swe","ds","pm"].forEach(k=>{const b=document.createElement("button");b.type="button";b.textContent={swe:"Engineering",ds:"Data",pm:"Product"}[k];b.setAttribute("aria-pressed",k===rankRole);
  b.addEventListener("click",()=>{rankRole=k;rankRoleEl.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));renderRank();});rankRoleEl.appendChild(b);});
function renderRank(){
  const rows=COMPANIES.filter(c=>c.roles[rankRole]&&c.roles[rankRole].m&&activeSectors.has(c.sec)).sort((a,b)=>b.roles[rankRole].m-a.roles[rankRole].m);
  const max=rows.length?rows[0].roles[rankRole].m:1;
  $("#rankList").innerHTML=rows.map((c,i)=>`<li><button type="button" data-id="${c.id}" aria-current="${c===selected}"><span class="n">${i+1}</span><span class="nm"><b>${esc(c.n)}</b><small>${esc(c.hood)}</small><span class="bar"><span style="width:${(c.roles[rankRole].m/max*100).toFixed(1)}%;background:${SECTORS[c.sec].color}"></span></span></span><span class="v">${money(c.roles[rankRole].m)}</span></button></li>`).join("")||`<li class="empty">No companies match these filters.</li>`;
  $("#rankList").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{const c=COMPANIES[+b.dataset.id];openCompany(c,true,c.roles[rankRole]?rankRole:null);}));
  $("#rankCount").textContent=`${rows.length} companies`;
}
const legendEl=$("#legend");
Object.entries(SECTORS).forEach(([k,s])=>{const b=document.createElement("button");b.type="button";b.className="chip";b.setAttribute("aria-pressed","true");const n=COMPANIES.filter(c=>c.sec===k).length;
  b.innerHTML=`<i style="background:${s.color}"></i>${s.label}<span>${n}</span>`;
  b.addEventListener("click",()=>{if(activeSectors.has(k))activeSectors.delete(k);else activeSectors.add(k);b.setAttribute("aria-pressed",activeSectors.has(k));applyVisibility();renderRank();});legendEl.appendChild(b);});
function applyVisibility(){COMPANIES.forEach(c=>{const on=activeSectors.has(c.sec);c.obj.m.visible=on&&pillarsOn;c.obj.cap.visible=on&&pillarsOn;c.obj.fx.forEach(o=>o.visible=on&&pillarsOn);c.obj.ring.visible=on;});}
let PLACES=DISTRICTS.map(d=>({n:d[0],kind:"Neighbourhood",p:V3(d[1],d[2]),d:1.4})).concat(lmLabels.map(l=>({n:l.name,kind:"Landmark",p:l.pos.clone().setY(0),d:0.35}))).concat(stLabels.map(s=>({n:s.name,kind:"Metro station",p:s.pos.clone().setY(0),d:0.4})));
const q=$("#q"),qList=$("#qList"),side=$("#side");let qSel=0,qRows=[];
function renderSearch(){const s=q.value.trim().toLowerCase();side.classList.toggle("searching",!!s);if(!s){qRows=[];qList.innerHTML="";return;}
  const comp=COMPANIES.filter(c=>c.n.toLowerCase().includes(s)||c.hood.toLowerCase().includes(s)||SECTORS[c.sec].label.toLowerCase().includes(s)).sort((a,b)=>headline(b)-headline(a)).map(c=>({c}));
  const starts=PLACES.filter(p=>p.n.toLowerCase().startsWith(s)),rest=PLACES.filter(p=>!p.n.toLowerCase().startsWith(s)&&p.n.toLowerCase().includes(s));
  qRows=comp.concat(starts.concat(rest).slice(0,8).map(p=>({p})));qSel=0;
  qList.innerHTML=qRows.map((r,i)=>r.c?`<li><button type="button" role="option" data-i="${i}" aria-selected="${i===qSel}"><i style="background:${SECTORS[r.c.sec].color}"></i><span class="t"><b>${esc(r.c.n)}</b><small>${esc(r.c.hood)}</small></span><span class="v">${shortPay(r.c)}</span></button></li>`
    :`<li><button type="button" role="option" data-i="${i}" aria-selected="${i===qSel}"><i class="pin"></i><span class="t"><b>${esc(r.p.n)}</b><small>${r.p.kind}</small></span></button></li>`).join("")||`<li class="empty">Nothing matches “${esc(q.value)}”. Try a company, street, canal or station.</li>`;
  qList.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>choose(qRows[+b.dataset.i])));}
function choose(r){if(!r)return;q.value="";renderSearch();q.blur();if(r.c)openCompany(r.c,true);else{closeCard();animateTo({t:r.p.p,d:r.p.d||0.5});}}
q.addEventListener("input",renderSearch);
q.addEventListener("keydown",e=>{if(e.key==="Escape"){q.value="";renderSearch();q.blur();}
  if((e.key==="ArrowDown"||e.key==="ArrowUp")&&qRows.length){e.preventDefault();qSel=clamp(qSel+(e.key==="ArrowDown"?1:-1),0,qRows.length-1);qList.querySelectorAll("button").forEach((b,i)=>{b.setAttribute("aria-selected",i===qSel);if(i===qSel)b.scrollIntoView({block:"nearest"});});}
  if(e.key==="Enter")choose(qRows[qSel]);});
q.addEventListener("focus",()=>side.classList.add("open"));
$("#sheetHandle").addEventListener("click",()=>side.classList.toggle("open"));

/* ---------- detail card ---------- */
const cardEl=$("#card");let cardRole="swe";
function openCompany(c,fly,role){selected=c;cardRole=role||headRole(c);renderCard();cardEl.hidden=false;document.body.classList.add("has-card");side.classList.remove("open");renderRank();
  if(fly)animateTo({t:c.obj.base.clone(),d:clamp(c.h*2.2+0.3,0.5,1.8)});}
function closeCard(){if(cardEl.hidden)return;cardEl.hidden=true;selected=null;document.body.classList.remove("has-card");renderRank();}
// Split from the median base / stock / bonus; fall back to the level closest to the median.
function pkgFor(r){if(r.p&&r.p[0]+r.p[1]+r.p[2]>0)return {b:r.p[0],s:r.p[1],o:r.p[2]};
  if(r.lv&&r.lv.length&&r.m){let best=r.lv[0],bd=1e12;r.lv.forEach(l=>{const d=Math.abs(l[1]-r.m);if(d<bd){bd=d;best=l;}});return {b:best[2],s:best[3],o:best[4]};}
  return null;}
function renderCard(){
  const c=selected;if(!c)return;const sc=SECTORS[c.sec],r=c.roles[cardRole],slug=ROLES[cardRole][1];
  const url=`https://www.levels.fyi/companies/${c.s}/salaries/${slug}/locations/greater-amsterdam-area`;
  const where=["Centrum","Noord","West","Nieuw-West","Zuid","Oost","Zuidoost"].includes(c.ar)?`Amsterdam-${c.ar}`:c.ar;
  const rankAll=COMPANIES.filter(x=>x.roles[cardRole]&&x.roles[cardRole].m).sort((a,b)=>b.roles[cardRole].m-a.roles[cardRole].m);const pos=rankAll.indexOf(c);
  let main;
  if(r.m){const pk=pkgFor(r);let split="";
    if(pk){const tot=pk.b+pk.s+pk.o,f=[pk.b/tot,pk.s/tot,pk.o/tot],cols=["var(--fg)",sc.color,"var(--warn)"];
      split=`<div class="split" aria-hidden="true">${f.map((x,k)=>`<span style="width:${x*100}%;background:${cols[k]}"></span>`).join("")}</div>
      <dl class="splitk">${["Base","Stock","Bonus"].map((n,k)=>`<div><dt><i style="background:${cols[k]}"></i>${n}</dt><dd>${money(r.m*f[k])}</dd></div>`).join("")}</dl>`;}
    main=`<div class="kpi"><div><span class="lbl">Median total comp · ${r.n} submissions</span><span class="big">${money(r.m,false)}</span></div>${pos>=0?`<span class="rankpill">#${pos+1} of ${rankAll.length}</span>`:""}</div>${split}`;
    if(r.lv&&r.lv.length)main+=`<div class="tblwrap"><table class="lv"><thead><tr><th>Level</th><th>Total</th><th>Base</th><th>Stock</th><th>Bonus</th></tr></thead><tbody>${r.lv.map(l=>`<tr><td>${esc(l[0])}</td><td>${money(l[1])}</td><td>${money(l[2])}</td><td>${money(l[3])}</td><td>${money(l[4])}</td></tr>`).join("")}</tbody></table></div>`;
  } else main=`<div class="kpi"><div><span class="lbl">Estimated range</span><span class="big">${money(r.r[0])}–${money(r.r[1]).replace(/^\D/,"")}</span></div></div><p class="note">Too few public data points for a median, so this shows a likely range.</p>`;
  cardEl.innerHTML=`<header><div class="ttl"><span class="sector"><i style="background:${sc.color}"></i>${sc.label}</span><h2>${esc(c.n)}</h2><p>${esc(c.hood)} · ${where}</p></div><button class="iconbtn close" type="button" aria-label="Close details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
   <div class="tabs" role="group" aria-label="Role">${Object.keys(c.roles).map(k=>`<button type="button" data-r="${k}" aria-pressed="${k===cardRole}">${ROLES[k][0]}</button>`).join("")}</div>
   ${main}
   <a class="lnk" href="${url}" target="_blank" rel="noopener">View on Levels.fyi<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>
   <p class="note">Levels.fyi, Greater Amsterdam Area, retrieved 20 Oct 2026. Level rows are averages per level. Office position is approximate.${currency!=="EUR"?" Converted from EUR at an indicative rate.":""}</p>`;
  cardEl.querySelector(".close").addEventListener("click",closeCard);
  cardEl.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>{cardRole=b.dataset.r;renderCard();}));
}

/* ---------- map controls UI ---------- */
const zoomBy=f=>{const s=camState();animateTo({d:clamp(s.d*f,controls.minDistance,controls.maxDistance)},380);};
$("#zIn").addEventListener("click",()=>zoomBy(0.6));
$("#zOut").addEventListener("click",()=>zoomBy(1/0.6));
$("#compass").addEventListener("click",()=>animateTo({theta:0},600));
const tiltBtn=$("#tilt");
function setTilt(on){tilted=on;tiltBtn.textContent=on?"2D":"3D";tiltBtn.setAttribute("aria-label",on?"Switch to top-down view":"Switch to 3D view");}
tiltBtn.addEventListener("click",()=>{setTilt(!tilted);animateTo({phi:tilted?TILT3D:0.0001},700);});
$("#home").addEventListener("click",()=>{closeCard();setTilt(true);animateTo(HOME,1200);});
const layersBtn=$("#layersBtn"),layersEl=$("#layers");
layersBtn.addEventListener("click",e=>{e.stopPropagation();layersEl.hidden=!layersEl.hidden;layersBtn.setAttribute("aria-expanded",!layersEl.hidden);});
document.addEventListener("click",e=>{if(!layersEl.hidden&&!e.target.closest("#layers,#layersBtn")){layersEl.hidden=true;layersBtn.setAttribute("aria-expanded","false");}});
const seg=(id,fn)=>$(id).querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{$(id).querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));fn(b.dataset);}));
seg("#labelSeg",d=>{labelMode=d.l;});
seg("#cur",d=>{currency=d.c;refreshPrices();renderRank();renderSearch();if(selected)renderCard();});
const tog=(id,fn)=>$(id).addEventListener("change",e=>fn(e.target.checked));
tog("#tPillars",v=>{pillarsOn=v;applyVisibility();});
tog("#tMetro",v=>{metroOn=v;LINES.forEach(L=>{if(L.mesh)L.mesh.visible=v;L.train.visible=v;L.stations.visible=v;});});
tog("#tDistricts",v=>{districtsOn=v;});
tog("#tStreets",v=>{streetsOn=v;});

/* ---------- picking & keys ---------- */
const ray=new THREE.Raycaster(),ptr=new THREE.Vector2(),tip=$("#tip");let down=null;
function pick(e){const r=canvas.getBoundingClientRect();ptr.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ptr,camera);const h=ray.intersectObjects(pickables.filter(m=>m.visible));return h.length?h[0].object.userData.c:null;}
canvas.addEventListener("pointerdown",e=>{down=[e.clientX,e.clientY];anim=null;lockTilt();});
canvas.addEventListener("pointerup",e=>{if(!down)return;const moved=Math.hypot(e.clientX-down[0],e.clientY-down[1]);down=null;if(moved>5)return;const c=pick(e);if(c)openCompany(c,true);else closeCard();});
// Wheel zooms toward the ground point under the cursor (the built-in controls only zoom to the screen centre).
// Captured on window so MapControls never sees the wheel; pinch zoom on touch still goes through the controls.
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),zoomPt=new THREE.Vector3();let zoomPending=0;
addEventListener("wheel",e=>{if(e.target!==canvas&&!(e.target.closest&&e.target.closest("#labels")))return;e.preventDefault();e.stopPropagation();anim=null;lockTilt();
  const r=canvas.getBoundingClientRect();ptr.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ptr,camera);
  if(!ray.ray.intersectPlane(groundPlane,zoomPt)||zoomPt.distanceTo(camera.position)>controls.maxDistance*3)zoomPt.copy(controls.target);
  const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?H:1);zoomPending+=clamp(dy,-240,240)*0.0016;},{passive:false,capture:true});
function stepZoom(){if(Math.abs(zoomPending)<1e-4){zoomPending=0;return;}
  const step=reduce?zoomPending:zoomPending*0.28;zoomPending-=step;
  const d=camera.position.distanceTo(controls.target),nd=clamp(d*Math.exp(step),controls.minDistance,controls.maxDistance),k=nd/d;
  if(Math.abs(k-1)<1e-6){zoomPending=0;return;}
  controls.target.sub(zoomPt).multiplyScalar(k).add(zoomPt);camera.position.sub(zoomPt).multiplyScalar(k).add(zoomPt);controls.target.y=0;}
canvas.addEventListener("pointermove",e=>{if(e.pointerType!=="mouse"||e.buttons)return;const c=pick(e);
  if(c!==hovered){if(hovered)hovered.obj.cap.material.color.copy(hovered.obj.cap.userData.col);hovered=c;if(c)c.obj.cap.material.color.setHex(0xffffff);canvas.style.cursor=c?"pointer":"";}
  if(c){tip.hidden=false;tip.innerHTML=`<b>${esc(c.n)}</b><span>${shortPay(c)} · ${esc(c.hood)}</span>`;tip.style.transform=`translate(${e.clientX+14}px,${e.clientY+14}px)`;}else tip.hidden=true;});
canvas.addEventListener("pointerleave",()=>{tip.hidden=true;});
addEventListener("keydown",e=>{
  if(((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k")||(e.key==="/"&&document.activeElement!==q)){e.preventDefault();q.focus();return;}
  if(e.target instanceof HTMLInputElement)return;
  if(e.key==="Escape"){if(!layersEl.hidden)layersEl.hidden=true;else closeCard();}
  if(e.key==="+"||e.key==="=")zoomBy(0.6);if(e.key==="-"||e.key==="_")zoomBy(1/0.6);
});

/* ---------- scale bar & compass ---------- */
const scaleEl=$("#scale"),scaleBar=scaleEl.querySelector("span"),scaleTxt=scaleEl.querySelector("b"),needle=$("#needle");
const NICE=[0.01,0.02,0.05,0.1,0.2,0.5,1,2,5];
function updateHud(d){const kmPerPx=2*d*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/H;let km=NICE[0];for(const n of NICE)if(n/kmPerPx<=120)km=n;
  scaleBar.style.width=(km/kmPerPx).toFixed(0)+"px";scaleTxt.textContent=km<1?Math.round(km*1000)+" m":km+" km";
  needle.style.transform=`rotate(${controls.getAzimuthalAngle()}rad)`;}

/* ---------- loop ---------- */
const NARROW=900;   // matches the bottom-sheet breakpoint in index.html
// Centre the map in the area the panels leave free.
const off={x:0,y:0};
function updateOffset(){const desk=W>NARROW,card=!cardEl.hidden;const tx=desk?(-(364)+(card?384:0))/2:0,ty=desk?0:(card?H*0.26:60);
  off.x+=(tx-off.x)*0.12;off.y+=(ty-off.y)*0.12;if(Math.abs(off.x)<0.5&&Math.abs(off.y)<0.5&&Math.abs(tx)<0.5&&Math.abs(ty)<0.5){if(camera.view&&camera.view.enabled)camera.clearViewOffset();return;}
  camera.setViewOffset(W,H,off.x,off.y,W,H);}
function resize(){W=innerWidth;H=innerHeight;renderer.setSize(W,H,false);camera.aspect=W/H;camera.fov=W<=NARROW?55:42;camera.updateProjectionMatrix();}
addEventListener("resize",resize);resize();
let last=performance.now();
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(!stepAnim(now)){stepZoom();controls.update();
    const t=controls.target,cx=clamp(t.x,BOUNDS.x0,BOUNDS.x1),cz=clamp(t.z,BOUNDS.z0,BOUNDS.z1);if(cx!==t.x||cz!==t.z){camera.position.x+=cx-t.x;camera.position.z+=cz-t.z;t.set(cx,0,cz);}}
  const d=camera.position.distanceTo(controls.target);
  updateMetro(d,dt);updateOffset();
  const bs=clamp(d*0.022,0.035,0.3);
  COMPANIES.forEach(c=>{const s=c===selected?1.4*(1+0.18*Math.sin(now/260)):1;c.obj.ring.scale.set(s,s,1);const k=c===hovered||c===selected?1.5:1;c.obj.beacon.scale.setScalar(bs*k);});
  renderer.render(scene,camera);updateLabels(d);updateHud(d);
  requestAnimationFrame(frame);
}
applyPalette();applyVisibility();renderRank();
setCam(HOME.t,11,0.3,-0.3);
requestAnimationFrame(frame);

/* ---------- boot: stream the city in ---------- */
const loadMsg=$("#loadMsg"),loadBar=$("#loadBar");
(async()=>{
  try{
    loadMsg.textContent="Downloading the city…";
    const {head,S}=await loadCity();
    [QX,QY,RES]=head.q;
    const a=sxz(QX,QY),b=sxz(QX+14000,QY+14000);BOUNDS={x0:Math.min(a[0],b[0])+0.3,x1:Math.max(a[0],b[0])-0.3,z0:Math.min(a[1],b[1])+0.3,z1:Math.max(a[1],b[1])-0.3};
    // keep offices outside the 3D area (Schiphol, Zaandam, Hilversum) reachable
    COMPANIES.forEach(c=>{const p=c.obj.base;BOUNDS.x0=Math.min(BOUNDS.x0,p.x-0.5);BOUNDS.x1=Math.max(BOUNDS.x1,p.x+0.5);BOUNDS.z0=Math.min(BOUNDS.z0,p.z-0.5);BOUNDS.z1=Math.max(BOUNDS.z1,p.z+0.5);});
    loadMsg.textContent="Laying out water, parks and streets…";await tick();
    buildPolys(S,"g",0.00015,c=>M.green[c]);
    buildPolys(S,"r",0.0003,c=>M.roads[c],c=>c>=2);
    buildPolys(S,"w",0.0005,()=>M.water);
    buildRails(S);
    const nTrees=buildTrees(S);
    loadMsg.textContent="Raising buildings…";
    const nB=await buildBuildings(head,S,f=>{loadBar.style.width=(f*100).toFixed(1)+"%";loadMsg.textContent=`Raising buildings… ${Math.round(f*100)}%`;});
    seatPillars();
    lampPts=new THREE.Points(new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(lampPos,3)),new THREE.PointsMaterial({color:0xffc879,size:0.0035,transparent:true,opacity:.85,depthWrite:false}));
    scene.add(lampPts);
    // place names from the data
    waterLabels=head.waterLabels.map(([n,x,y,area])=>{const p=sxz(x,y);return {name:n,area,pos:new THREE.Vector3(p[0],0.002,p[1]),el:mk("wl",esc(n))};}).sort((a,b)=>b.area-a.area);
    roadLabels=head.roadLabels.map(([n,x,y,area,ang])=>{const p=sxz(x,y);return {name:n,area,pos:new THREE.Vector3(p[0],0.002,p[1]),dir:new THREE.Vector3(Math.cos(ang)*0.02,0,-Math.sin(ang)*0.02),el:mk("rl",esc(n))};});
    const seen=new Set(PLACES.map(p=>p.n));
    PLACES=PLACES.concat(waterLabels.filter(l=>!seen.has(l.name)&&seen.add(l.name)).map(l=>({n:l.name,kind:"Water",p:l.pos.clone().setY(0),d:0.5})))
      .concat(roadLabels.filter(l=>!seen.has(l.name)&&seen.add(l.name)).map(l=>({n:l.name,kind:"Street",p:l.pos.clone().setY(0),d:0.35})));
    applyPalette();
    $("#stat").textContent=`${nB.toLocaleString("en-GB")} buildings · ${nTrees.toLocaleString("en-GB")} trees`;
    $("#loader").classList.add("done");animateTo(HOME,reduce?1:2400);
  }catch(err){loadMsg.textContent=err.message||"The map could not be loaded.";$("#loader").classList.add("error");console.error(err);}
})();
})();
