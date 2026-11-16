/* Coral da Acústica · motor de cálculo acústico
 *
 * Todas as contas de acústica do simulador ficam aqui, separadas da tela:
 *   - tempo de reverberação estatístico (Sabine e Eyring, com absorção do ar e do público);
 *   - estudo por raios (traçado com BVH, chuva difusa, receptores esféricos) e a análise da resposta ao impulso
 *     (EDT, T20, T30, C50, C80, D50, Ts, G e STI);
 *   - mapa de cobertura pela teoria revisada de Barron;
 *   - isolamento de paredes (Sharp, ISO 717-1 para Rw, C e Ctr, ASTM E413 para STC);
 *   - volume de ar de modelos importados (grade de voxels) e TR ótimo pelo uso da sala (NBR 12179);
 *   - a biblioteca de materiais genéricos.
 *
 * Entrada clara, saída clara: veja calcular() no fim do arquivo. O simulador usa as mesmas funções por partes
 * (para dividir os raios entre vários workers), e os testes em teste/ usam calcular().
 * O arquivo roda no navegador (window.CoralMotor), dentro de um Web Worker (self.CoralMotor) e no Node (require).
 * Não pode ter "</scr" + "ipt>" no texto: o build coloca este arquivo inteiro dentro do app.html.
 */
(function (raiz, fabrica) {
  const M = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = M; else raiz.CoralMotor = M;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------------- constantes ---------------- */
const BANDS=[125,250,500,1000,2000,4000];
const AIR=[0.44,1.31,2.73,4.66,9.86,29.7].map(v=>v/4343); // 20 °C, 50 % UR (ISO 9613-1), 1/m em energia
const C0=343;

/* ---------------- biblioteca de materiais genéricos ---------------- */
// [id, nome, categoria, α 125..4k, espalhamento s, cor]
const MATERIAIS = [
 ['concreto','Concreto aparente liso','Estrutura',[.01,.01,.02,.02,.02,.03],.05,'#a3a39c'],
 ['concreto_p','Concreto pintado','Estrutura',[.01,.01,.01,.02,.02,.02],.05,'#b9b8b1'],
 ['tijolo','Tijolo aparente','Estrutura',[.03,.03,.03,.04,.05,.07],.15,'#b5654a'],
 ['bloco','Bloco de concreto aparente','Estrutura',[.36,.44,.31,.29,.39,.25],.15,'#8f918c'],
 ['reboco','Reboco liso sobre alvenaria','Estrutura',[.01,.02,.02,.03,.04,.05],.05,'#d9d4c7'],
 ['drywall','Gesso acartonado sobre montantes','Estrutura',[.29,.10,.05,.04,.07,.09],.05,'#e4e1d8'],
 ['marmore','Mármore ou granito polido','Estrutura',[.01,.01,.01,.01,.02,.02],.05,'#e6e2dc'],
 ['madeira_piso','Piso de madeira sobre barrotes','Piso',[.15,.11,.10,.07,.06,.07],.10,'#b0814f'],
 ['ceramica','Piso cerâmico ou porcelanato','Piso',[.01,.01,.01,.01,.02,.02],.05,'#cfc9bd'],
 ['vinilico','Piso vinílico sobre concreto','Piso',[.02,.03,.03,.03,.03,.02],.05,'#a7b0a3'],
 ['carpete','Carpete fino sobre concreto','Piso',[.02,.06,.14,.37,.60,.65],.10,'#6f6a8a'],
 ['carpete_p','Carpete espesso com manta','Piso',[.08,.24,.57,.69,.71,.73],.10,'#54507a'],
 ['forro_min','Forro mineral acústico suspenso','Forro',[.45,.55,.60,.75,.82,.80],.10,'#eceae3'],
 ['forro_gesso','Forro de gesso liso','Forro',[.15,.10,.05,.04,.07,.09],.05,'#f1efe9'],
 ['forro_madeira','Forro de madeira ripada com lã','Forro',[.30,.55,.75,.70,.60,.50],.35,'#c09160'],
 ['la_rocha','Lã de rocha 50 mm, 64 kg/m³','Absorvedores',[.20,.65,.95,.99,.99,.99],.10,'#d7c77c'],
 ['la_vidro','Lã de vidro 50 mm revestida','Absorvedores',[.17,.60,.90,.99,.95,.90],.10,'#e3d59a'],
 ['espuma','Espuma acústica 50 mm','Absorvedores',[.10,.30,.70,.90,.95,.95],.15,'#4f5963'],
 ['painel_perf','Painel de madeira perfurado com lã','Absorvedores',[.40,.75,.80,.65,.45,.30],.20,'#a8784a'],
 ['cortina','Cortina pesada franzida','Absorvedores',[.14,.35,.55,.72,.70,.65],.30,'#8c3b3b'],
 ['compensado','Compensado 10 mm sobre câmara de ar','Absorvedores',[.28,.22,.17,.09,.10,.11],.10,'#c29a67'],
 ['vidro','Vidro comum de janela','Vidros e portas',[.35,.25,.18,.12,.07,.04],.05,'#9cc7d9'],
 ['vidro_esp','Vidro espesso ou laminado','Vidros e portas',[.18,.06,.04,.03,.02,.02],.05,'#86b5c9'],
 ['porta','Porta de madeira','Vidros e portas',[.14,.10,.06,.08,.10,.10],.05,'#8b5e3c'],
 ['poltrona_oc','Poltronas estofadas ocupadas','Público e mobiliário',[.60,.74,.88,.96,.93,.85],.70,'#3f6fa3'],
 ['poltrona_vz','Poltronas estofadas vazias','Público e mobiliário',[.49,.66,.80,.88,.82,.70],.70,'#7a94b8'],
 ['cadeira_mad','Cadeiras de madeira vazias','Público e mobiliário',[.03,.04,.06,.08,.08,.08],.50,'#b39170'],
 ['publico_pe','Público em pé','Público e mobiliário',[.25,.44,.59,.56,.62,.50],.70,'#5a7d5a'],
 ['agua','Água (piscina)','Outros',[.01,.01,.01,.015,.02,.025],.05,'#3c8fb0'],
 ['difusor','Difusor QRD de madeira','Outros',[.20,.25,.20,.15,.15,.15],.90,'#c9a36b'],
 ['aberto','Abertura (absorção total)','Outros',[1,1,1,1,1,1],0,'#2b2b2b'],
].map(([id,name,cat,a,s,col])=>({id,name,cat,a,s,col,lib:true}));

// cópia nova para cada simulador (o catálogo de produtos entra e sai da lista sem mexer na original)
function materiaisGenericos(){ return MATERIAIS.map(m=>Object.assign({},m,{a:m.a.slice()})); }

/* ---------------- fontes (caixas e omni) ---------------- */
// azimute 0° = +Y (para a plateia), 90° = +X; inclinação positiva para cima.
// Diretividade elíptica: −6 dB nas bordas da abertura H × V, piso de −25 dB; abre nas bandas graves.
const WIDEN=[2.5,1.8,1.3,1,1,0.9];
function normSrc(p){ return Object.assign({x:0,y:3,z:1.6,type:'omni',az:0,el:0,h:90,v:60,g:0}, p||{}); }
function srcParams(p){
  const D=Math.PI/180, az=p.az*D, el=p.el*D, omni=p.type!=='caixa';
  const f=[Math.sin(az)*Math.cos(el), Math.cos(az)*Math.cos(el), Math.sin(el)], r=[Math.cos(az),-Math.sin(az),0];
  const u=[r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
  return {x:p.x,y:p.y,z:p.z,omni,f,r,u,g:Math.pow(10,(+p.g||0)/10),
    hh:WIDEN.map(k=>Math.min(360,p.h*k)/2*D), hv:WIDEN.map(k=>Math.min(180,p.v*k)/2*D)};
}
function dirLin(s,b,dx,dy,dz){
  if (s.omni) return s.g;
  var xl=dx*s.r[0]+dy*s.r[1]+dz*s.r[2], yl=dx*s.u[0]+dy*s.u[1]+dz*s.u[2], zl=dx*s.f[0]+dy*s.f[1]+dz*s.f[2];
  var th=Math.atan2(xl,zl), tv=Math.asin(Math.max(-1,Math.min(1,yl)));
  var a=s.hh[b]>=Math.PI-1e-6?0:th/s.hh[b], v=s.hv[b]>=Math.PI/2-1e-6?0:tv/s.hv[b];
  return s.g*Math.pow(10,Math.max(-25,-6*(a*a+v*v))/10);
}
function srcPower(sp){ // média da diretividade na esfera, por banda
  const out=[0,0,0,0,0,0], n=800;
  for (let i=0;i<n;i++){ const z=1-2*(i+0.5)/n, rr=Math.sqrt(1-z*z), ph=i*2.399963; for (let b=0;b<6;b++) out[b]+=dirLin(sp,b,rr*Math.cos(ph),rr*Math.sin(ph),z)/n; }
  return out;
}
// fontes no formato do traçado de raios (parâmetros + potência por banda)
function fontesRaios(src){ return src.map(sp=>{ const o=srcParams(sp); o.pw=srcPower(o); return o; }); }

/* ---------------- público ---------------- */
// Cada pessoa soma absorção (m² Sabine por pessoa, por banda, valores típicos de tabela).
// Essa absorção entra espalhada nas superfícies da plateia (material de público ou, sem ele, o piso), no TR estatístico e nos raios.
const PUB_TIPOS={
  cadeira:{nome:'Sentadas em cadeiras ou bancos', a:[.15,.25,.35,.40,.43,.40]},
  poltrona:{nome:'Sentadas em poltronas estofadas', a:[.06,.08,.10,.10,.10,.10]},
  empe:{nome:'Em pé', a:[.15,.30,.45,.50,.55,.55]}};
const PUB_OCUP=[0,50,100,120];
function pubOcup(pub){ const o=+(pub&&pub.oc); return PUB_OCUP.includes(o)?o:100; }
// absorção total do público por banda (m² Sabine); oc = ocupação em %, padrão a escolhida no projeto
function pubA(pub, oc){ const p=pub||{}, t=PUB_TIPOS[p.tipo]||PUB_TIPOS.cadeira, n=Math.max(0,+p.n||0)*(oc??pubOcup(pub))/100; return t.a.map(a=>a*n); }
// coeficientes de cada superfície já com o público: Ap = absorção do público, gs = índices das superfícies da plateia
// (sem plateia, espalha em todas)
function alfasComPublico(areas, alfas, Ap, gs){
  const on=Ap.some(v=>v>0); gs=on?gs:[]; const Aa=gs.reduce((s,i)=>s+areas[i],0);
  return alfas.map((a0,i)=>{ const a=a0.slice(0,6);
    if (on && (Aa>0 ? gs.includes(i) : true)){ const area=Aa>0?Aa:areas.reduce((s,x)=>s+x,0); for (let b=0;b<6;b++) a[b]+=Ap[b]/area; }  // pode passar de 1: no TR estatístico vale a área de absorção; nos raios é limitado a 1
    return a; });
}

/* ---------------- TR estatístico (Sabine / Eyring) ---------------- */
// V em m³, areas[i] em m², alfas[i] = α por banda da superfície i (já com público)
function estatistico(V, areas, alfas, ar){
  ar=ar||AIR;
  let St=0; const A=[0,0,0,0,0,0];
  areas.forEach((ar,gi)=>{ St+=ar; for(let b=0;b<6;b++) A[b]+=ar*alfas[gi][b]; });
  const sab=[], eyr=[], abar=[];
  for (let b=0;b<6;b++){ const a=Math.min(A[b]/St,0.999); abar.push(a); const m4=4*ar[b]*V;
    sab.push(0.161*V/(A[b]+m4)); eyr.push(0.161*V/(-St*Math.log(1-a)+m4)); }
  return {V,S:St,A,abar,sab,eyr};
}
// área de absorção equivalente (m² Sabine) que falta (>0) ou sobra (<0) para ir de T a Talvo
function absorcaoFaltando(V, Talvo, T){ return 0.161*V*(1/Talvo-1/T); }

/* ---------------- estudo por raios ---------------- */
// duração da resposta ao impulso: a escolhida no projeto ou 1,25 × o maior TR de Eyring + 0,15 s (entre 0,8 e 6 s)
function tmaxPadrao(eyr, T){ return +T>0 ? +T : Math.min(6, Math.max(0.8, Math.max(...eyr)*1.25+0.15)); }
// cena do traçado: triângulos de todas as superfícies, superfície de cada triângulo, α (limitado a 1) e espalhamento
function cenaRaios(sup, smin){
  const nT=sup.reduce((a,g)=>a+g.pos.length/9,0);
  const tris=new Float32Array(nT*9), triG=new Uint16Array(nT), gA=new Float32Array(sup.length*6), gS=new Float32Array(sup.length);
  let o=0; sup.forEach((g,gi)=>{ tris.set(g.pos,o*9); triG.fill(gi,o,o+g.pos.length/9); o+=g.pos.length/9; g.a.forEach((a,b)=>gA[gi*6+b]=Math.min(a,1)); gS[gi]=Math.max(g.s, smin); });
  return {tris, triG, gA, gS, nT};
}
// gerador pseudoaleatório com semente (só nos testes; sem semente usa Math.random)
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
// distância ao quadrado de um ponto a um triângulo (vértice a, arestas e1 e e2), pelo ponto mais próximo (Ericson, Real-Time Collision Detection)
function distPontoTri2(px,py,pz, ax,ay,az, e1x,e1y,e1z, e2x,e2y,e2z){
  var vx=px-ax, vy=py-ay, vz=pz-az;
  var d1=e1x*vx+e1y*vy+e1z*vz, d2=e2x*vx+e2y*vy+e2z*vz, s, t;
  if (d1<=0 && d2<=0){ s=0; t=0; }
  else {
    var wx=vx-e1x, wy=vy-e1y, wz=vz-e1z, d3=e1x*wx+e1y*wy+e1z*wz, d4=e2x*wx+e2y*wy+e2z*wz;
    if (d3>=0 && d4<=d3){ s=1; t=0; }
    else {
      var vc=d1*d4-d3*d2;
      if (vc<=0 && d1>=0 && d3<=0){ s=d1/(d1-d3); t=0; }
      else {
        var ux=vx-e2x, uy=vy-e2y, uz=vz-e2z, d5=e1x*ux+e1y*uy+e1z*uz, d6=e2x*ux+e2y*uy+e2z*uz;
        if (d6>=0 && d5<=d6){ s=0; t=1; }
        else {
          var vb=d5*d2-d1*d6;
          if (vb<=0 && d2>=0 && d6<=0){ s=0; t=d2/(d2-d6); }
          else {
            var va=d3*d6-d5*d4;
            if (va<=0 && (d4-d3)>=0 && (d5-d6)>=0){ t=(d4-d3)/((d4-d3)+(d5-d6)); s=1-t; }
            else { var den=1/(va+vb+vc); s=vb*den; t=vc*den; }
          }
        }
      }
    }
  }
  var cx=vx-s*e1x-t*e2x, cy=vy-s*e1y-t*e2y, cz=vz-s*e1z-t*e2z;
  return cx*cx+cy*cy+cz*cz;
}
// Traça os raios. P = {tris,triG,gA,gS,srcs (fontesRaios),recs (x,y,z seguidos),rr,nRays,tmax,air,c,nPaths,part,parts,semente?}
// Devolve o histograma de energia por receptor, banda e milissegundo (hist), os caminhos para desenhar e o som direto.
// Vários workers podem dividir os raios de cada fonte (part de parts); a soma dos histogramas é igual a um traçado só.
function tracarRaios(P, onProg){
  var rnd = P.semente!=null ? mulberry32(P.semente) : Math.random;
  var tris = P.tris, nT = tris.length/9, triG = P.triG, gA = P.gA, gS = P.gS;
  var NB = 6, c = P.c, air = P.air, recs = P.recs, nR = recs.length/3, rr = P.rr, rr2 = rr*rr;
  var Vrec = 4/3*Math.PI*rr*rr*rr, nRays = P.nRays, tmax = P.tmax, dmax = tmax*c;
  // vários workers dividem os raios de cada fonte; a parte 0 também guarda o som direto e os caminhos desenhados
  var part = P.part||0, parts = P.parts||1, r0 = Math.floor(nRays*part/parts), r1 = Math.floor(nRays*(part+1)/parts);
  var nBins = Math.ceil(tmax*1000)+1;
  var hist = new Float64Array(nR*NB*nBins);
  // triangle precompute
  var V0 = new Float64Array(nT*3), E1 = new Float64Array(nT*3), E2 = new Float64Array(nT*3), N = new Float64Array(nT*3);
  var bmin = new Float64Array(nT*3), bmax = new Float64Array(nT*3), cen = new Float64Array(nT*3);
  for (var i=0;i<nT;i++){
    var o=i*9;
    for (var k=0;k<3;k++){
      var a=tris[o+k], b=tris[o+3+k], cc=tris[o+6+k];
      V0[i*3+k]=a; E1[i*3+k]=b-a; E2[i*3+k]=cc-a;
      bmin[i*3+k]=Math.min(a,b,cc); bmax[i*3+k]=Math.max(a,b,cc); cen[i*3+k]=(a+b+cc)/3;
    }
    var ex=E1[i*3],ey=E1[i*3+1],ez=E1[i*3+2],fx=E2[i*3],fy=E2[i*3+1],fz=E2[i*3+2];
    var nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx, L=Math.hypot(nx,ny,nz)||1;
    N[i*3]=nx/L; N[i*3+1]=ny/L; N[i*3+2]=nz/L;
  }
  // BVH
  var idx = new Uint32Array(nT); for (i=0;i<nT;i++) idx[i]=i;
  var nodeMin=[], nodeMax=[], nodeL=[], nodeR=[], nodeS=[], nodeC=[];
  function build(s,e){
    var mn=[1e30,1e30,1e30], mx=[-1e30,-1e30,-1e30], cmn=[1e30,1e30,1e30], cmx=[-1e30,-1e30,-1e30];
    for (var j=s;j<e;j++){ var t=idx[j]; for (var k=0;k<3;k++){ if(bmin[t*3+k]<mn[k])mn[k]=bmin[t*3+k]; if(bmax[t*3+k]>mx[k])mx[k]=bmax[t*3+k]; if(cen[t*3+k]<cmn[k])cmn[k]=cen[t*3+k]; if(cen[t*3+k]>cmx[k])cmx[k]=cen[t*3+k]; } }
    var me=nodeMin.length/3; nodeMin.push(mn[0],mn[1],mn[2]); nodeMax.push(mx[0],mx[1],mx[2]); nodeL.push(-1); nodeR.push(-1); nodeS.push(s); nodeC.push(e-s);
    var n=e-s; if (n<=4) return me;
    var ax=0, ext=cmx[0]-cmn[0]; if (cmx[1]-cmn[1]>ext){ax=1;ext=cmx[1]-cmn[1];} if (cmx[2]-cmn[2]>ext){ax=2;ext=cmx[2]-cmn[2];}
    if (ext<=1e-9) return me;
    var sub=Array.prototype.slice.call(idx.subarray(s,e)).sort(function(p,q){return cen[p*3+ax]-cen[q*3+ax];});
    idx.set(sub,s);
    var m=s+(n>>1);
    nodeC[me]=0;
    var l=build(s,m), r=build(m,e); nodeL[me]=l; nodeR[me]=r;
    return me;
  }
  build(0,nT);
  var NMn=Float64Array.from(nodeMin), NMx=Float64Array.from(nodeMax), NL=Int32Array.from(nodeL), NR=Int32Array.from(nodeR), NS=Int32Array.from(nodeS), NC=Int32Array.from(nodeC);
  // libera o que só serve para montar a árvore (projetos com centenas de milhares de triângulos estouravam a memória)
  nodeMin=nodeMax=nodeL=nodeR=nodeS=nodeC=null; bmin=bmax=cen=null; tris=null; P.tris=null;
  var stack=new Int32Array(128);
  var hitT=0, hitI=-1;
  function intersect(ox,oy,oz,dx,dy,dz,tLim){
    hitT=tLim; hitI=-1;
    var ix=1/dx, iy=1/dy, iz=1/dz, sp=0; stack[sp++]=0;
    while(sp>0){
      var nd=stack[--sp], b=nd*3;
      var t1=(NMn[b]-ox)*ix, t2=(NMx[b]-ox)*ix, tmin=Math.min(t1,t2), tmx=Math.max(t1,t2);
      t1=(NMn[b+1]-oy)*iy; t2=(NMx[b+1]-oy)*iy; tmin=Math.max(tmin,Math.min(t1,t2)); tmx=Math.min(tmx,Math.max(t1,t2));
      t1=(NMn[b+2]-oz)*iz; t2=(NMx[b+2]-oz)*iz; tmin=Math.max(tmin,Math.min(t1,t2)); tmx=Math.min(tmx,Math.max(t1,t2));
      if (tmx<Math.max(tmin,0) || tmin>hitT) continue;
      if (NC[nd]>0){
        for (var j=NS[nd], je=NS[nd]+NC[nd]; j<je; j++){
          var t=idx[j], q=t*3;
          var e1x=E1[q],e1y=E1[q+1],e1z=E1[q+2],e2x=E2[q],e2y=E2[q+1],e2z=E2[q+2];
          var px=dy*e2z-dz*e2y, py=dz*e2x-dx*e2z, pz=dx*e2y-dy*e2x;
          var det=e1x*px+e1y*py+e1z*pz; if (det>-1e-12 && det<1e-12) continue;
          var inv=1/det, sx=ox-V0[q], sy=oy-V0[q+1], sz=oz-V0[q+2];
          var u=(sx*px+sy*py+sz*pz)*inv; if (u<0||u>1) continue;
          var qx=sy*e1z-sz*e1y, qy=sz*e1x-sx*e1z, qz=sx*e1y-sy*e1x;
          var v=(dx*qx+dy*qy+dz*qz)*inv; if (v<0||u+v>1) continue;
          var tt=(e2x*qx+e2y*qy+e2z*qz)*inv;
          if (tt>1e-6 && tt<hitT){ hitT=tt; hitI=t; }
        }
      } else { stack[sp++]=NL[nd]; stack[sp++]=NR[nd]; }
    }
    return hitI;
  }
  // direct sound, all sources
  var srcs=P.srcs, nS=srcs.length, direct=[];
  for (var r=0;r<nR;r++) direct.push({d:1e9, visible:false});
  for (var si=0; si<nS; si++){
    var SP=srcs[si];
    for (var r=0;r<nR;r++){
      var dx=recs[r*3]-SP.x, dy=recs[r*3+1]-SP.y, dz=recs[r*3+2]-SP.z, d=Math.hypot(dx,dy,dz);
      var vis = intersect(SP.x,SP.y,SP.z,dx/d,dy/d,dz/d,d)<0;
      if (d<direct[r].d) direct[r].d=d; if (vis) direct[r].visible=true;
      if (vis && part===0){ var bin=Math.floor(d/c*1000); if (bin<nBins) for (var bb=0;bb<NB;bb++) hist[(r*NB+bb)*nBins+bin]+=dirLin(SP,bb,dx/d,dy/d,dz/d)*Math.exp(-air[bb]*d)/(4*Math.PI*d*d); }
    }
  }
  // Folga de cada receptor: distância até a superfície mais próxima. O disco de detecção dos raios especulares cresce com a
  // distância percorrida (traçado por cones), mas não pode passar dessa folga: a parte do disco que cai atrás de uma parede
  // não recebe raio nenhum, a energia tardia some aos poucos e o T20/T30 sai curto (5 a 7 % numa sala simples, validação BRAS CR2).
  var folga = new Float64Array(nR);
  for (var r=0;r<nR;r++){
    var px=recs[r*3], py=recs[r*3+1], pz=recs[r*3+2], best=1e30;
    for (i=0;i<nT;i++){ var q3=i*3, d2p=distPontoTri2(px,py,pz, V0[q3],V0[q3+1],V0[q3+2], E1[q3],E1[q3+1],E1[q3+2], E2[q3],E2[q3+1],E2[q3+2]); if (d2p<best) best=d2p; }
    folga[r]=Math.max(rr, Math.sqrt(best));
  }
  var kcone=2/Math.sqrt(nRays), nPaths=Math.ceil(P.nPaths/nS), paths=[], lost=0, E=new Float64Array(NB), e0=1/nRays, thr=e0*1e-7;
  for (var si=0; si<nS; si++){
  var SP=srcs[si], srcx=SP.x, srcy=SP.y, srcz=SP.z, emax=0;
  for (var bb=0;bb<NB;bb++) emax=Math.max(emax,SP.g);
  for (var ray=r0; ray<r1; ray++){
    // amostragem por importância: direções sorteadas conforme a diretividade em 1 kHz
    var dx,dy,dz,dref;
    do { var z=2*rnd()-1, ph=2*Math.PI*rnd(), rxy=Math.sqrt(1-z*z);
      dx=rxy*Math.cos(ph); dy=rxy*Math.sin(ph); dz=z; dref=dirLin(SP,3,dx,dy,dz);
    } while (rnd()*SP.g > dref);
    var ox=srcx, oy=srcy, oz=srcz, dist=0, order=0, spec=false, pw3=SP.pw[3];
    for (var bb=0;bb<NB;bb++) E[bb]=e0*pw3*dirLin(SP,bb,dx,dy,dz)/dref;
    var kc=kcone*Math.sqrt(pw3/dref);
    thr=e0*emax*1e-7;
    var rec = part===0 && ray<nPaths ? {p:[ox,oy,oz], d:[0], e:[1]} : null, ef=1;
    while (true){
      var h=intersect(ox,oy,oz,dx,dy,dz,1e9);
      var seg = h<0 ? dmax-dist : hitT;
      if (order>0 && spec){
        for (var r2=0;r2<nR;r2++){
          var wx=recs[r2*3]-ox, wy=recs[r2*3+1]-oy, wz=recs[r2*3+2]-oz;
          var tc=wx*dx+wy*dy+wz*dz; if (tc<0||tc>seg) continue;
          var d2=wx*wx+wy*wy+wz*wz-tc*tc, dd=dist+tc, Rb=Math.min(Math.max(rr, dd*kc), folga[r2]);
          if (d2>=Rb*Rb) continue;
          var bin2=Math.floor(dd/c*1000);
          if (bin2>=nBins) continue;
          var w=1/(Math.PI*Rb*Rb);
          for (var b3=0;b3<NB;b3++) hist[(r2*NB+b3)*nBins+bin2]+=E[b3]*Math.exp(-air[b3]*dd)*w;
        }
      }
      if (h<0){ lost++; if (rec){ rec.p.push(ox+dx*Math.min(seg,50),oy+dy*Math.min(seg,50),oz+dz*Math.min(seg,50)); rec.d.push(dist+Math.min(seg,50)); } break; }
      dist+=seg; ox+=dx*seg; oy+=dy*seg; oz+=dz*seg;
      if (rec && rec.d.length<60 && dist<c*0.6){ rec.p.push(ox,oy,oz); rec.d.push(dist); }
      if (dist>=dmax) break;
      var g=triG[h], mx=0;
      for (var b4=0;b4<NB;b4++){ E[b4]*=1-gA[g*NB+b4]; if (E[b4]>mx) mx=E[b4]; }
      // fração de energia que sobra (média de 500 Hz a 2 kHz) para o desenho do raio ir apagando
      ef*=1-(gA[g*NB+2]+gA[g*NB+3]+gA[g*NB+4])/3; if (rec && rec.e.length<rec.d.length) rec.e.push(ef);
      if (mx<thr) break;
      var nx=N[h*3], ny=N[h*3+1], nz=N[h*3+2], dn=dx*nx+dy*ny+dz*nz;
      if (dn>0){ nx=-nx; ny=-ny; nz=-nz; dn=-dn; }
      var sg=gS[g];
      if (sg>0){ // diffuse rain: deterministic diffuse contribution to every visible receiver
        var sx0=ox+nx*1e-5, sy0=oy+ny*1e-5, sz0=oz+nz*1e-5, ddx=dx, ddy=dy, ddz=dz, hT=hitT;
        for (var r3=0;r3<nR;r3++){
          var qx=recs[r3*3]-sx0, qy=recs[r3*3+1]-sy0, qz=recs[r3*3+2]-sz0, qd=Math.hypot(qx,qy,qz);
          var cth=(qx*nx+qy*ny+qz*nz)/qd; if (cth<=0) continue;
          var dd2=dist+qd, bin3=Math.floor(dd2/c*1000); if (bin3>=nBins) continue;
          if (intersect(sx0,sy0,sz0,qx/qd,qy/qd,qz/qd,qd)>=0) continue;
          var qe=Math.max(qd,rr), wr=sg*cth/(Math.PI*qe*qe);
          for (var b5=0;b5<NB;b5++) hist[(r3*NB+b5)*nBins+bin3]+=E[b5]*Math.exp(-air[b5]*dd2)*wr;
        }
        dx=ddx; dy=ddy; dz=ddz; hitT=hT;
      }
      spec = !(rnd()<sg);
      if (!spec){
        var u1=rnd(), u2=2*Math.PI*rnd(), sr=Math.sqrt(u1), lx=sr*Math.cos(u2), ly=sr*Math.sin(u2), lz=Math.sqrt(1-u1);
        var axx= Math.abs(nx)<0.9 ? 1:0, axy= Math.abs(nx)<0.9 ? 0:1;
        var tx=ny*0-nz*axy, ty=nz*axx-nx*0, tz=nx*axy-ny*axx, tl=Math.hypot(tx,ty,tz); tx/=tl; ty/=tl; tz/=tl;
        var bx=ny*tz-nz*ty, by=nz*tx-nx*tz, bz=nx*ty-ny*tx;
        dx=lx*tx+ly*bx+lz*nx; dy=lx*ty+ly*by+lz*ny; dz=lx*tz+ly*bz+lz*nz;
      } else { dx-=2*dn*nx; dy-=2*dn*ny; dz-=2*dn*nz; }
      var dl=Math.hypot(dx,dy,dz); dx/=dl; dy/=dl; dz/=dl;
      ox+=nx*1e-5; oy+=ny*1e-5; oz+=nz*1e-5;
      order++;
    }
    if (rec) paths.push({p:Float32Array.from(rec.p), d:Float32Array.from(rec.d), e:Float32Array.from(rec.e)});
    if (onProg && ((ray-r0) & 1023)===1023) onProg((si*(r1-r0)+ray-r0)/(nS*(r1-r0)));
  }
  }
  return {hist:hist, nBins:nBins, nR:nR, paths:paths, lost:lost, nRays:nRays*nS, direct:direct};
}
// soma as partes de vários workers (histograma e raios perdidos); som direto e caminhos vêm da parte 0
function somarPartes(parts){
  const t=parts[0]; for (let j=1;j<parts.length;j++){ const h=parts[j].hist; for (let i=0;i<h.length;i++) t.hist[i]+=h[i]; t.lost+=parts[j].lost; }
  return t;
}

/* ---------------- análise da resposta ao impulso ---------------- */
function regressT(L, fromDb, toDb){
  let i0=-1,i1=-1; for (let i=0;i<L.length;i++){ if(i0<0&&L[i]<=fromDb) i0=i; if(L[i]<=toDb){i1=i;break;} }
  if (i0<0||i1<0||i1-i0<3) return NaN;
  let n=0,sx=0,sy=0,sxx=0,sxy=0; for (let i=i0;i<=i1;i++){ const x=i/1000; n++;sx+=x;sy+=L[i];sxx+=x*x;sxy+=x*L[i]; }
  const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx); return slope<0 ? -60/slope : NaN;
}
// h = energia por milissegundo de uma banda num receptor
function analyze(h){
  let t0=0; while (t0<h.length && h[t0]<=0) t0++;
  const n=h.length; let tot=0, tw=0; for (let i=t0;i<n;i++){ tot+=h[i]; tw+=h[i]*(i-t0+0.5)/1000; }
  if (tot<=0) return {empty:true};
  const sch=new Float64Array(n-t0); let acc=0; for (let i=n-1;i>=t0;i--){ acc+=h[i]; sch[i-t0]=acc; }
  const L=Array.from(sch,v=>10*Math.log10(Math.max(v,1e-30)/tot));
  const e=ms=>{ let s=0; for (let i=t0;i<Math.min(n,t0+ms);i++) s+=h[i]; return s; };
  const e50=e(50), e80=e(80);
  return { t0, L, tot,
    EDT:regressT(L,0,-10), T20:regressT(L,-5,-25), T30:regressT(L,-5,-35),
    C50:10*Math.log10(e50/(tot-e50)), C80:10*Math.log10(e80/(tot-e80)), D50:100*e50/tot, Ts:1000*tw/tot,
    G:10*Math.log10(tot*400*Math.PI), h };
}
// STI pela função de transferência de modulação (14 frequências, 7 bandas; 8 kHz repete 4 kHz), sem ruído de fundo
function sti(bands){
  const F=[0.63,0.8,1,1.25,1.6,2,2.5,3.15,4,5,6.3,8,10,12.5], W=[0.13,0.14,0.11,0.12,0.19,0.17,0.14];
  const mti=bands.map(b=>{ if(b.empty) return 0; let s=0; F.forEach(f=>{ let re=0,im=0; for(let i=b.t0;i<b.h.length;i++){ const t=(i-b.t0+0.5)/1000, w=2*Math.PI*f*t; re+=b.h[i]*Math.cos(w); im+=b.h[i]*Math.sin(w);} let m=Math.min(Math.hypot(re,im)/b.tot,0.9999); let snr=Math.max(-15,Math.min(15,10*Math.log10(m/(1-m)))); s+=(snr+15)/30; }); return s/F.length; });
  mti.push(mti[5]);
  return mti.reduce((a,v,i)=>a+v*W[i],0);
}
// resultado do traçado → parâmetros por receptor e banda
function analisar(m){
  const out=[];
  for (let r=0;r<m.nR;r++){ const bands=[]; for (let b=0;b<6;b++) bands.push(analyze(m.hist.subarray((r*6+b)*m.nBins,(r*6+b+1)*m.nBins))); out.push({bands, sti:sti(bands), direct:m.direct[r]}); }
  return out;
}

/* ---------------- mapa (teoria revisada de Barron) ---------------- */
// valor do parâmetro par (C80, C50, D50, Ld, G) num ponto, banda bi; SPs = srcParams das fontes, PW = potência de cada uma na banda
function mapaValor(SPs, PW, bi, T, V, x, y, z, par){
  let d=0, rev=0;
  SPs.forEach((sp,si)=>{ const vx=x-sp.x, vy=y-sp.y, vz=z-sp.z, r=Math.max(0.5,Math.hypot(vx,vy,vz));
    d+=100/(r*r)*dirLin(sp,bi,vx/r,vy/r,vz/r); rev+=PW[si]*(31200*T/V)*Math.exp(-0.04*r/T); });
  const e=te=>rev*(1-Math.exp(-13.82*te/T)), l=te=>rev*Math.exp(-13.82*te/T);
  let v; if (par==='C80') v=10*Math.log10((d+e(0.08))/l(0.08)); else if (par==='C50') v=10*Math.log10((d+e(0.05))/l(0.05));
  else if (par==='D50') v=100*(d+e(0.05))/(d+rev); else if (par==='Ld') v=10*Math.log10(d); else v=10*Math.log10(d+rev);
  return v;
}

/* ---------------- isolamento (Sharp, ISO 717-1, ASTM E413) ---------------- */
const F3=[100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000];
const ISO_REF=[33,36,39,42,45,48,51,52,53,54,55,56,56,56,56,56];            // 100–3150
const SP1=[-29,-26,-23,-21,-19,-17,-15,-13,-12,-11,-10,-9,-9,-9,-9,-9];      // C (rosa)
const SP2=[-20,-20,-18,-16,-15,-14,-13,-12,-11,-9,-8,-9,-10,-11,-13,-15];    // Ctr (tráfego)
const STC_REF=[-16,-13,-10,-7,-4,-1,0,1,2,3,4,4,4,4,4,4];                  // 125–4000
const PANELS={
  gesso:{n:'Placa de gesso acartonado ST',k:'gesso',rho:720,E:2.5e9,eta:0.03},
  gesso_ru:{n:'Placa de gesso alta densidade',k:'gesso',rho:1000,E:3.5e9,eta:0.03},
  cimenticia:{n:'Placa cimentícia',k:'conc',rho:1350,E:6e9,eta:0.02},
  osb:{n:'OSB',k:'mad',rho:650,E:4.5e9,eta:0.02},
  mdf:{n:'MDF',k:'mad',rho:750,E:3.5e9,eta:0.02},
  compensado:{n:'Compensado',k:'mad',rho:600,E:7e9,eta:0.02},
  madeira:{n:'Madeira maciça',k:'mad',rho:550,E:10e9,eta:0.02},
  // perda total do vidro montado no caixilho (o vidro solto tem 0,004, mas a borda presa amortece): ajustada para
  // reproduzir a tabela da EN 12758 (4 mm Rw 29, 6 mm 31, 8 mm 32, 10 mm 33; laminado 8 mm 33). Revisão 2026-11-10.
  vidro:{n:'Vidro float',k:'vid',rho:2500,E:72e9,eta:0.04},
  vidro_lam:{n:'Vidro laminado (PVB)',k:'vid',rho:2500,E:72e9,eta:0.06},
  concreto:{n:'Concreto armado',k:'conc',rho:2300,E:30e9,eta:0.01},
  reboco:{n:'Reboco (argamassa)',k:'conc',rho:1800,E:8e9,eta:0.02},
  bloco_ceram:{n:'Bloco cerâmico (massa equivalente)',k:'alv',rho:1000,E:5e9,eta:0.015},
  bloco_conc:{n:'Bloco de concreto (massa equivalente)',k:'alv',rho:1300,E:10e9,eta:0.012},
  tijolo:{n:'Tijolo maciço',k:'alv',rho:1800,E:12e9,eta:0.015},
  aco:{n:'Chapa de aço',k:'met',rho:7850,E:210e9,eta:0.001},
  mlv:{n:'Manta de alta densidade (MLV)',k:'mem',rho:1900,E:2e7,eta:0.3},
};
// Preenchimento da cavidade por tipo e densidade. r: resistividade ao fluxo de ar estimada (Pa·s/m²), r ≈ a·ρ^1,3
// (lã de vidro tem fibra mais fina, então resiste mais que a de rocha ou PET na mesma densidade).
const FILL_TIPOS={la_vidro:{n:'Lã de vidro',a:163,col:'#efd57a',dens:[12,16,20,28,32,48,64,96]},
  la_rocha:{n:'Lã de rocha',a:105,col:'#c7ab62',dens:[28,32,48,64,96,128,160]},
  pet:{n:'Lã de PET',a:84,col:'#dfe4e8',dens:[20,28,32,40,48,64]}};
const FILLS={ar:{n:'Ar (vazia)',k:'ar'}};
Object.entries(FILL_TIPOS).forEach(([t,T])=>T.dens.forEach(d=>{ FILLS[t+'_'+d]={n:`${T.n} ${d} kg/m³`,k:'la',col:T.col,tipo:t,rho:d,r:T.a*Math.pow(d,1.3)}; }));
// chaves antigas (sem densidade) continuam abrindo
const FILL_OLD={la_vidro:'la_vidro_16',la_rocha:'la_rocha_32',pet:'pet_28'};
Object.entries(FILL_OLD).forEach(([o,n])=>{ FILLS[o]=Object.assign({},FILLS[n],{hide:true}); });
// perda de isolamento por absorção insuficiente na cavidade: 5 dB vazia, menos quanto maior r·d
function fillPen(fill,d){ const F=FILLS[fill]||FILLS.ar; if (!F.r) return 5; return 5*Math.exp(-F.r*d/(0.5*415)); }
const P=(m,h)=>({t:'panel',m,h}), CV=(h,fill)=>({t:'cav',h,fill});
const ISO_PRESETS={
  dry_simples:{n:'Drywall: 1 placa + montante 70 + 1 placa',layers:[P('gesso',12.5),CV(70,'la_vidro_16'),P('gesso',12.5)],frame:'metal',b:600},
  dry_duplo:{n:'Drywall: 2 placas + montante 90 + 2 placas',layers:[P('gesso',12.5),P('gesso',12.5),CV(90,'la_vidro_16'),P('gesso',12.5),P('gesso',12.5)],frame:'metal',b:600},
  dry_indep:{n:'Drywall dupla estrutura independente (2+2, 150 mm)',layers:[P('gesso',12.5),P('gesso',12.5),CV(150,'la_rocha_32'),P('gesso',12.5),P('gesso',12.5)],frame:'indep',b:600},
  dry_mlv:{n:'Drywall com manta MLV (2+MLV / 90 / 2)',layers:[P('gesso',12.5),P('mlv',3),P('gesso',12.5),CV(90,'la_rocha_48'),P('gesso',12.5),P('gesso',12.5)],frame:'metal',b:600},
  madeira:{n:'OSB 15 + montante de madeira 90 + gesso 12,5',layers:[P('osb',15),CV(90,'la_vidro_16'),P('gesso',12.5)],frame:'madeira',b:600},
  bloco14:{n:'Bloco cerâmico 14 cm rebocado',layers:[P('reboco',15),P('bloco_ceram',140),P('reboco',15)],frame:'none',b:600},
  bloco_conc14:{n:'Bloco de concreto 14 cm rebocado',layers:[P('reboco',15),P('bloco_conc',140),P('reboco',15)],frame:'none',b:600},
  bloco_forro:{n:'Bloco 14 cm + contraparede drywall (50 mm, lã)',layers:[P('reboco',15),P('bloco_ceram',140),P('reboco',15),CV(50,'la_rocha_32'),P('gesso',12.5),P('gesso',12.5)],frame:'metal',b:600},
  concreto10:{n:'Concreto 10 cm',layers:[P('concreto',100)],frame:'none',b:600},
  concreto15:{n:'Concreto 15 cm',layers:[P('concreto',150)],frame:'none',b:600},
  vidro6:{n:'Vidro float 6 mm',layers:[P('vidro',6)],frame:'none',b:600},
  vidro_lam8:{n:'Vidro laminado 8 mm',layers:[P('vidro_lam',8)],frame:'none',b:600},
  janela_dupla:{n:'Janela dupla: vidro 6 + ar 100 + laminado 8',layers:[P('vidro',6),CV(100,'ar'),P('vidro_lam',8)],frame:'none',b:600},
  custom:{n:'Personalizada'}
};
function isoMigrate(I){
  if (!I.layers){
    const L=[]; const pushLeaf=l=>{ for (let i=0;i<Math.max(1,Math.round(l.n||1));i++) L.push(P(l.m,l.h)); };
    pushLeaf(I.l1||{m:'gesso',h:12.5,n:2}); if (I.dbl!==false && I.l2){ L.push(CV(I.gap||90,'la_vidro')); pushLeaf(I.l2); }
    I.layers=L; I.frame=I.frame||(I.dbl?'metal':'none'); I.b=I.b||600;
  }
  I.layers.forEach(l=>{ if (l.t==='cav' && FILL_OLD[l.fill]) l.fill=FILL_OLD[l.fill]; });
  I.frame=I.frame||'none'; I.b=I.b||600; return I;
}
function stackModel(I){
  const leaves=[], cavs=[]; let cur=null, pend=null, tot=0;
  I.layers.forEach((l,idx)=>{ tot+=+l.h||0;
    if (l.t==='panel'){ const p=PANELS[l.m]||PANELS.gesso, h=(+l.h||0)/1000, m=p.rho*h;
      if (!cur){ if (pend && leaves.length) cavs.push(pend); pend=null; cur={m:0,B:0,em:0,idx:[]}; }
      cur.m+=m; cur.B+=p.E*h*h*h/(12*0.91); cur.em+=p.eta*m; cur.idx.push(idx);
    } else {
      if (cur){ leaves.push(cur); cur=null; }
      if (leaves.length){ const d=(+l.h||0)/1000; pend = pend ? {d:pend.d+d, fill:(l.fill!=='ar'?l.fill:pend.fill)} : {d, fill:l.fill}; }
    }});
  if (cur) leaves.push(cur);
  leaves.forEach(L=>{ L.fc=C0*C0/(2*Math.PI)*Math.sqrt(L.m/Math.max(L.B,1e-9)); L.eta=L.em/Math.max(L.m,1e-9); });
  cavs.forEach((c,j)=>{ const m1=leaves[j].m, m2=leaves[j+1].m; c.f0=(c.fill==='ar'?60:50)*Math.sqrt((m1+m2)/(c.d*m1*m2)); c.fl=55/c.d; });
  return {leaves, cavs, mt:leaves.reduce((a,L)=>a+L.m,0), thick:tot};
}
function Rsingle(L,f){
  const {m,fc,eta}=L, mass=ff=>20*Math.log10(m*ff)-47;
  const above=ff=>{ const et=eta+m/(485*Math.sqrt(ff)); return 20*Math.log10(m*ff)+10*Math.log10(2*et*ff/(Math.PI*fc))-47; };
  if (f<fc/2) return mass(f);
  if (f>=fc) return Math.min(mass(f), above(f));
  const r1=mass(fc/2), r2=Math.min(mass(fc),above(fc)), t=Math.log(f/(fc/2))/Math.log(2); return r1+(r2-r1)*t;
}
function Rcurve(I){
  if (I.mode==='meas' && I.meas) return I.meas.slice();
  const M=stackModel(I), Lv=M.leaves, Cv=M.cavs;
  if (!Lv.length) return F3.map(()=>0);
  if (Lv.length===1) return F3.map(f=>Rsingle(Lv[0],f));
  const f0=Math.max(...Cv.map(c=>c.f0)), bridged=(I.frame==='metal'||I.frame==='madeira');
  let dRB=0;
  if (bridged){ const m1=Lv[0].m, m2=M.mt-m1, fcH=Math.max(Lv[0].fc,Lv[1].fc);
    dRB=10*Math.log10((I.b/1000)*fcH)+20*Math.log10(Math.max(m1,m2)/(m1+m2))-18+(I.frame==='metal'?5:0); }
  const Rs=F3.map(f=>{
    // ressonância massa-ar-massa: sem absorção na cavidade a queda abaixo da lei da massa é funda (até 7 dB);
    // com lã ela é amortecida e quase some (revisão 2026-11-11)
    const pen0=Cv.reduce((a,c)=>a+fillPen(c.fill,c.d),0), xr=Math.log2(f/f0)/0.6, dip=2*Math.max(0,pen0-1.5)*Math.exp(-xr*xr);
    const RM=20*Math.log10(M.mt*f)-47;
    if (f<f0) return RM-dip;
    let R=Lv.reduce((a,L)=>a+Rsingle(L,f),0);
    Cv.forEach(c=>{ R += (f<c.fl ? 20*Math.log10(f*c.d)-29 : -6); });
    // Revisão 2026-11-11: a perda pela cavidade sem absorção entra DEPOIS do limite das pontes (montantes).
    // Antes ela sumia quando o limite das pontes valia, e a parede de drywall vazia saía quase igual à com lã
    // (1+48+1 vazia dava Rw 41; catálogos dão 36 a 38).
    const pen=Cv.reduce((a,c)=>a+fillPen(c.fill,c.d),0);
    if (bridged) R=Math.min(R, RM+dRB);
    return Math.max(RM-dip, R-pen);
  });
  return RcurveAjustes(I,M,Rs);
}
// Revisão 2026-11-10: dois casos em que a teoria de parede dupla (Sharp) promete mais do que os ensaios mostram.
// 1) Vidro duplo selado (câmara de ar até 30 mm): o espaçador liga as lâminas e a câmara não tem absorção. Fica perto da
//    lei da massa do conjunto, com a queda da ressonância massa-ar-massa e a coincidência das lâminas (EN 12758: 4-12-4
//    Rw 29, 6-12-6 Rw 31, 10-12-4 Rw 35; o modelo antigo dava 35 a 44).
// 2) Revestimento leve sobre parede ou laje pesada (contraparede de drywall, forro): ganho limitado ao da ISO 12354-1,
//    Anexo D, pela frequência de ressonância f0 (f0 até 80 Hz: ΔRw = 35 − Rw/2). Dois lados: o maior mais metade do menor.
const LIN_F=[80,100,125,160,200,250,315,400,500,630,1600,1601], LIN_A=[35,32,30,28,-1,-3,-5,-7,-9,-10,-10,-5];
function dRwLining(f0,Rw){
  let i=LIN_F.findIndex(f=>f0<=f); if (i<0) i=LIN_F.length-1;
  const v=k=>k<4?Math.max(0,LIN_A[k]-Rw/2):LIN_A[k];
  if (i===0 || i===LIN_F.length-1) return v(i);
  const t=Math.log(f0/LIN_F[i-1])/Math.log(LIN_F[i]/LIN_F[i-1]); return v(i-1)+(v(i)-v(i-1))*t;
}
function RcurveAjustes(I,M,R){
  const Lv=M.leaves, Cv=M.cavs, n=Lv.length, kind=L=>(PANELS[(I.layers[L.idx[0]]||{}).m]||PANELS.gesso).k;
  if (n===2 && Cv[0].fill==='ar' && Cv[0].d<=0.03 && kind(Lv[0])==='vid' && kind(Lv[1])==='vid'){
    const f0=Cv[0].f0;
    return F3.map((f,i)=>{ const RM=20*Math.log10(M.mt*f)-47, def=Lv.reduce((a,L)=>a+20*Math.log10(L.m*f)-47-Rsingle(L,f),0)/2, x=Math.log2(f/f0)/1.2;
      return Math.max(0, Math.min(R[i], RM-1-def)-7*Math.exp(-x*x)); });
  }
  if (n===2 || n===3){
    const h=Lv.reduce((b,L,i)=>L.m>Lv[b].m?i:b,0), H=Lv[h];
    if (H.m>=80 && Lv.every((L,i)=>i===h||L.m<=H.m/4)){
      const Rb=F3.map(f=>Rsingle(H,f)), RwB=ratingRw(Rb).Rw;
      const ds=[h-1,h].filter(j=>j>=0&&j<Cv.length).map(j=>dRwLining(Cv[j].f0,RwB)-fillPen(Cv[j].fill,Cv[j].d)).sort((a,b)=>b-a);
      const alvo=RwB+Math.round(ds[0]+(ds.length>1?Math.max(0,ds[1])/2:0));
      // logo acima da ressonância a fórmula de parede dupla cai abaixo da própria parede pesada: o revestimento tira no máximo 3 dB ali
      const fm=Math.max(...[h-1,h].filter(j=>j>=0&&j<Cv.length).map(j=>Cv[j].f0));
      R=R.map((v,i)=>F3[i]<fm?v:Math.max(v,Rb[i]-(F3[i]<1.5*fm?3:0)));
      if (ratingRw(R).Rw>alvo){ let X=40; for (;X>-20;X-=0.25){ if (ratingRw(R.map((v,i)=>Math.min(v,Rb[i]+X))).Rw<=alvo) break; }
        return R.map((v,i)=>Math.max(0,Math.min(v,Rb[i]+X))); }
    }
  }
  return R;
}
function ratingRw(R){ // R: 18 values from 100 Hz
  const r=R.slice(0,16).map(v=>Math.round(v*10)/10);
  let best=null; for (let s=-60;s<=60;s++){ let sum=0; for (let i=0;i<16;i++) sum+=Math.max(0,ISO_REF[i]+s-r[i]); if (sum<=32) best=s; else if(best!=null) break; }
  const Rw=52+best;
  const Xa=sp=>-10*Math.log10(sp.reduce((a,L,i)=>a+Math.pow(10,(L-r[i])/10),0));
  const unf=ISO_REF.map((v,i)=>Math.max(0,v+best-r[i]));
  return {Rw, C:Math.round(Xa(SP1)-Rw), Ctr:Math.round(Xa(SP2)-Rw), shift:best, unf, sumUnf:unf.reduce((a,b)=>a+b,0)};
}
function ratingSTC(R){ // 125–4000 → idx 1..16
  const r=R.slice(1,17).map(v=>Math.round(v));
  let best=null; for (let v=0;v<=120;v++){ let sum=0,mx=0; for (let i=0;i<16;i++){ const d=Math.max(0,v+STC_REF[i]-r[i]); sum+=d; mx=Math.max(mx,d);} if (sum<=32&&mx<=8) best=v; }
  return best;
}

// isolamento em campo: R' (descontando a perda pelos flancos fl, em dB) e DnT (sala receptora de volume V, parede de área S)
function isolamentoCampo(R, fl, V, S){ const Rp=R.map(v=>v-(+fl||0)), DnT=Rp.map(v=>v+10*Math.log10(0.32*(+V)/(+S))); return {Rp, DnT}; }

/* ---------------- volume de ar de modelos importados ---------------- */
// A soma de tetraedros só vale para malha fechada e com as faces viradas para o mesmo lado,
// o que quase nunca acontece em .dae/.obj do SketchUp (faces duplas, buracos, móveis soltos). Aqui o volume é o espaço de ar
// ligado à fonte S1, numa grade de voxels: marca as superfícies, enche a partir da fonte e conta o que encheu.
// groups = [{pos}], box = {min:{x,y,z}, max:{x,y,z}}, seed = {x,y,z}
function voxelVolume(groups, box, seed){
  const sz={x:box.max.x-box.min.x, y:box.max.y-box.min.y, z:box.max.z-box.min.z}, bv=Math.max(sz.x*sz.y*sz.z,1e-6);
  const h=Math.max(Math.cbrt(bv/2.5e6), Math.max(sz.x,sz.y,sz.z)/420, 0.02);
  const nx=Math.ceil(sz.x/h)+3, ny=Math.ceil(sz.y/h)+3, nz=Math.ceil(sz.z/h)+3, N=nx*ny*nz, nxy=nx*ny;
  const ox=box.min.x-h*1.5, oy=box.min.y-h*1.5, oz=box.min.z-h*1.5;
  const G=new Uint8Array(N); // 1 parede, 2 ar ligado à fonte
  const idx=(x,y,z)=>{ const i=Math.floor((x-ox)/h), j=Math.floor((y-oy)/h), k=Math.floor((z-oz)/h); return (i<0||j<0||k<0||i>=nx||j>=ny||k>=nz)?-1:i+j*nx+k*nxy; };
  groups.forEach(g=>{ const p=g.pos;
    for (let t=0;t<p.length;t+=9){
      const ax=p[t],ay=p[t+1],az=p[t+2], ux=p[t+3]-ax,uy=p[t+4]-ay,uz=p[t+5]-az, vx=p[t+6]-ax,vy=p[t+7]-ay,vz=p[t+8]-az;
      const L=Math.max(Math.hypot(ux,uy,uz),Math.hypot(vx,vy,vz),Math.hypot(ux-vx,uy-vy,uz-vz)), n=Math.max(1,Math.ceil(L/(h*0.5)));
      for (let a=0;a<=n;a++) for (let b=0;a+b<=n;b++){ const s=a/n, r=b/n, q=idx(ax+ux*s+vx*r, ay+uy*s+vy*r, az+uz*s+vz*r); if (q>=0) G[q]=1; }
    } });
  // semente: voxel livre mais próximo da fonte
  let s0=-1; const si=Math.floor((seed.x-ox)/h), sj=Math.floor((seed.y-oy)/h), sk=Math.floor((seed.z-oz)/h);
  for (let r=0;r<=4&&s0<0;r++) for (let dk=-r;dk<=r&&s0<0;dk++) for (let dj=-r;dj<=r&&s0<0;dj++) for (let di=-r;di<=r&&s0<0;di++){
    const i=si+di,j=sj+dj,k=sk+dk; if (i<1||j<1||k<1||i>=nx-1||j>=ny-1||k>=nz-1) continue; const q=i+j*nx+k*nxy; if (!G[q]) s0=q; }
  const Q=new Int32Array(N);
  const fill=(start,ok)=>{ let a=0,b=0,cnt=0,leak=false; Q[b++]=start; G[start]=2;
    while (a<b){ const q=Q[a++]; cnt++; const k=(q/nxy)|0, j=((q-k*nxy)/nx)|0, i=q-k*nxy-j*nx;
      if (i===0||j===0||k===0||i===nx-1||j===ny-1||k===nz-1) leak=true;
      const nb=[i>0?q-1:-1, i<nx-1?q+1:-1, j>0?q-nx:-1, j<ny-1?q+nx:-1, k>0?q-nxy:-1, k<nz-1?q+nxy:-1];
      for (const r of nb) if (r>=0 && G[r]===0 && ok(r)){ G[r]=2; Q[b++]=r; } }
    return {cnt,leak}; };
  const edge=()=>{ let e=0; for (let q=0;q<N;q++) if (G[q]===1){ const k=(q/nxy)|0, j=((q-k*nxy)/nx)|0, i=q-k*nxy-j*nx;
      if ((i>0&&G[q-1]===2)||(i<nx-1&&G[q+1]===2)||(j>0&&G[q-nx]===2)||(j<ny-1&&G[q+nx]===2)||(k>0&&G[q-nxy]===2)||(k<nz-1&&G[q+nxy]===2)) e++; } return e; };
  const h3=h*h*h;
  // ponto no ar ligado à fonte (o voxel ou um vizinho na horizontal, para não perder a beira junto da parede)
  const air=(x,y,z)=>{ const q=idx(x,y,z); if (q<0) return false; if (G[q]===2) return true; if (G[q]!==1) return false;
    return (q%nx>0&&G[q-1]===2)||(q%nx<nx-1&&G[q+1]===2)||(G[q-nx]===2)||(G[q+nx]===2); };
  if (s0>=0){ const f=fill(s0,()=>true); if (!f.leak) return {V:(f.cnt+0.5*edge())*h3, h, fechado:true, air}; }
  // sala com aberturas: conta como ar o que tem superfície em pelo menos 5 das 6 direções, ligado à fonte
  for (let q=0;q<N;q++) if (G[q]===2) G[q]=0;
  const hits=new Uint8Array(N);
  const line=(n,at)=>{ let f=-1,l=-1; for (let t=0;t<n;t++) if (G[at(t)]===1){ if (f<0) f=t; l=t; } if (f<0) return;
    for (let t=0;t<n;t++){ const q=at(t); if (G[q]) continue; hits[q]+=(t>f?1:0)+(t<l?1:0); } };
  for (let k=0;k<nz;k++) for (let j=0;j<ny;j++) line(nx,t=>t+j*nx+k*nxy);
  for (let k=0;k<nz;k++) for (let i=0;i<nx;i++) line(ny,t=>i+t*nx+k*nxy);
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++) line(nz,t=>i+j*nx+t*nxy);
  let V=0;
  if (s0>=0 && hits[s0]>=5) V=fill(s0,r=>hits[r]>=5).cnt;
  else { for (let q=0;q<N;q++) if (!G[q] && hits[q]>=5){ G[q]=2; V++; } }
  return {V:(V+0.5*edge())*h3, h, fechado:false, air};
}

/* ---------------- TR ótimo a 500 Hz pelo uso da sala ---------------- */
// gráfico da NBR 12179, curvas digitalizadas: TR = a + b·log V
const TRO_LINHAS={
  palavra:{nome:'Estúdio para palavra', a:-0.327, b:0.321}, conf:{nome:'Sala de conferência', a:-0.335, b:0.346},
  cinema:{nome:'Cinema', a:-0.361, b:0.372}, ginasio:{nome:'Ginásio', a:-0.248, b:0.383},
  musica:{nome:'Estúdio para música / Ópera', a:-0.346, b:0.455}, concerto:{nome:'Concerto / Igreja protestante', a:-0.175, b:0.446},
  catolica:{nome:'Igreja católica', a:0.182, b:0.428}, orgao:{nome:'Música de órgão', a:0.138, b:0.501}};
const USOS={
  palavra:{nome:'Estúdio de rádio para palavra', linha:'palavra', tipo:'fala'},
  conferencia:{nome:'Sala de conferência (palestra, aula, reunião)', linha:'conf', tipo:'fala'},
  cinema:{nome:'Cinema', linha:'cinema', tipo:'fala'},
  ginasio:{nome:'Ginásio', linha:'ginasio', tipo:'fala'},
  estudio_musica:{nome:'Estúdio de rádio para música', linha:'musica', tipo:'musica'},
  opera:{nome:'Ópera', linha:'musica', tipo:'musica'},
  concerto:{nome:'Sala de concerto', linha:'concerto', tipo:'musica'},
  protestante:{nome:'Igreja protestante / sinagoga', linha:'concerto', tipo:'fala'},
  catolica:{nome:'Igreja católica', linha:'catolica', tipo:'musica'},
  orgao:{nome:'Música de órgão', linha:'orgao', tipo:'musica'}};

function trOtimo(V, uso){ const L=TRO_LINHAS[USOS[USOS[uso]?uso:'conferencia'].linha]; return Math.max(0.2, L.a+L.b*Math.log10(Math.max(V,1))); }

/* ---------------- entrada e saída ---------------- */
// área de um grupo de triângulos (x,y,z seguidos, 9 números por triângulo)
function areaTri(pos){ let a=0; for (let i=0;i<pos.length;i+=9){ const ax=pos[i+3]-pos[i],ay=pos[i+4]-pos[i+1],az=pos[i+5]-pos[i+2],bx=pos[i+6]-pos[i],by=pos[i+7]-pos[i+1],bz=pos[i+8]-pos[i+2]; a+=0.5*Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx); } return a; }
// volume pela soma de tetraedros (vale para malha fechada)
function volumeMalha(sup){ let v=0; sup.forEach(g=>{ const p=g.pos; for (let i=0;i<p.length;i+=9) v+=(p[i]*(p[i+4]*p[i+8]-p[i+5]*p[i+7]) - p[i+1]*(p[i+3]*p[i+8]-p[i+5]*p[i+6]) + p[i+2]*(p[i+3]*p[i+7]-p[i+4]*p[i+6]))/6; }); return Math.abs(v); }
/* calcular(entrada) → resultados, numa chamada só (sem workers). Entrada:
 *   sala: { superficies: [{ nome, pos (triângulos), material: { a: [6 α de 125 a 4k], s: espalhamento } }], volume? (m³) }
 *   publico?: { tipo: 'cadeira'|'poltrona'|'empe', n: pessoas, oc: ocupação %, superficies?: [índices da plateia] }
 *   fontes: [{ x, y, z, type: 'omni'|'caixa', az, el, h, v, g }]
 *   receptores: [{ x, y, z }]
 *   opcoes?: { raios: por fonte (20000), raioReceptor: m (0,5), T: duração s ('' = automática), smin: espalhamento mínimo (0,2), ar: [6 atenuações do ar em 1/m] (20 °C, 50 % UR),
 *              caminhos: quantos desenhar (0), semente: número para repetir o mesmo sorteio, estatisticoSo: true para pular os raios }
 * Saída: { estatistico: {V,S,A,abar,sab,eyr}, raios: { tmax, perdidos (%), receptores: [{ bands: [{EDT,T20,T30,C50,C80,D50,Ts,G}], sti, direct }], bruto } } */
function calcular(E){
  const sup=E.sala.superficies, areas=sup.map(g=>areaTri(g.pos));
  const V=+E.sala.volume>0 ? +E.sala.volume : volumeMalha(sup);
  const pub=E.publico||null, Ap=pubA(pub), alfas=alfasComPublico(areas, sup.map(g=>g.material.a), Ap, (pub&&pub.superficies)||[]);
  const O=E.opcoes||{}, est=estatistico(V, areas, alfas, O.ar);
  if (O.estatisticoSo || !(E.fontes||[]).length || !(E.receptores||[]).length) return {estatistico:est, raios:null};
  const tmax=tmaxPadrao(est.eyr, O.T);
  const cena=cenaRaios(sup.map((g,i)=>({pos:g.pos, a:alfas[i], s:g.material.s||0})), +(O.smin??0.2)||0);
  const P={tris:cena.tris, triG:cena.triG, gA:cena.gA, gS:cena.gS, srcs:fontesRaios(E.fontes.map(normSrc)), recs:new Float64Array(E.receptores.flatMap(p=>[p.x,p.y,p.z])),
    rr:+(O.raioReceptor??0.5), nRays:+(O.raios??20000), tmax, air:O.ar||AIR, c:C0, nPaths:O.caminhos||0, part:0, parts:1, semente:O.semente};
  const m=tracarRaios(P);
  return {estatistico:est, raios:{tmax, perdidos:100*m.lost/m.nRays, receptores:analisar(m), bruto:m}};
}

return {
  versao: '1.1.1',
  // dados
  BANDS, AIR, C0, MATERIAIS, PUB_TIPOS, PUB_OCUP, F3, ISO_REF, SP1, SP2, STC_REF, PANELS, FILL_TIPOS, FILLS, FILL_OLD, ISO_PRESETS, TRO_LINHAS, USOS,
  // entrada e saída
  calcular, areaTri, volumeMalha, materiaisGenericos,
  // fontes e público
  normSrc, srcParams, dirLin, srcPower, fontesRaios, pubOcup, pubA, alfasComPublico,
  // TR estatístico e TR ótimo
  estatistico, absorcaoFaltando, trOtimo,
  // raios e análise
  tmaxPadrao, cenaRaios, tracarRaios, somarPartes, regressT, analyze, sti, analisar,
  // mapa e volume
  mapaValor, voxelVolume,
  // isolamento
  fillPen, isoMigrate, stackModel, Rsingle, Rcurve, dRwLining, ratingRw, ratingSTC, isolamentoCampo
};
});
