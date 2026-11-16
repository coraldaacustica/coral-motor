// CR2 por terços de oitava: cada oitava é a soma de três traçados (terço de baixo, do meio e de cima), com os materiais do BRAS
// em terços e o ar pela ISO 9613-1. Compara com o medido em oitavas.
const fs=require('fs'), path=require('path');
const M=require('../../coral-motor.js'), conj=process.argv[2]||'fitted', raios=+(process.argv[3]||20000), reps=+(process.argv[4]||1), extra=JSON.parse(process.argv[5]||'{}');
function arISO(f,T=20,h=50){ const T0=293.15,Tk=T+273.15,T01=273.16,C=-6.8346*Math.pow(T01/Tk,1.261)+4.6151,hm=h*Math.pow(10,C);
  const frO=24+4.04e4*hm*(0.02+hm)/(0.391+hm), frN=Math.pow(Tk/T0,-0.5)*(9+280*hm*Math.exp(-4.170*(Math.pow(Tk/T0,-1/3)-1)));
  const a=8.686*f*f*(1.84e-11*Math.sqrt(Tk/T0)+Math.pow(Tk/T0,-2.5)*(0.01275*Math.exp(-2239.1/Tk)/(frO+f*f/frO)+0.1068*Math.exp(-3352/Tk)/(frN+f*f/frN)));
  return a/4.343; } // 1/m em energia
const dir=path.join(__dirname,'materiais',conj)+'/';
const geo=JSON.parse(fs.readFileSync(path.join(__dirname,'geometria.json'),'utf8')), csv={};
geo.forEach(g=>csv[g.nome]=fs.readFileSync(dir+g.nome+'.csv','utf8').trim().split('\n').map(l=>l.split(',').map(Number)));
const F=csv[geo[0].nome][0];
const LS=[[0.931,-2.547,0.723],[0.119,2.880,0.723]], MP=[[-0.993,1.426,1.23],[0.439,-0.147,1.23],[1.361,-0.603,1.23],[-1.110,-0.256,1.23],[-0.998,-1.409,1.23]];
const med=JSON.parse(fs.readFileSync(path.join(__dirname,'medido.json'),'utf8'));
const PAR=['EDT','T20','T30','C50','C80','D50'], sim={}, t0=Date.now(), eyr=[[],[],[]];
for (let rep=0;rep<reps;rep++) LS.forEach((s,si)=>{
  let soma=null, nB, nR;
  [-1,0,1].forEach((d,di)=>{
    const idx=M.BANDS.map(fc=>F.indexOf(fc)+d), ar=idx.map(i=>arISO(F[i], extra.temp??20, extra.ur??50));
    const sup=geo.map(g=>{ const L=csv[g.nome], iS=[F.indexOf(500),F.indexOf(1000),F.indexOf(2000)]; return {pos:Float32Array.from(g.pos), material:{a:idx.map(i=>L[1][i]), s:(L[2][iS[0]]+L[2][iS[1]]+L[2][iS[2]])/3}}; });
    const R=M.calcular({sala:{superficies:sup, volume:146.1}, fontes:[{x:s[0],y:s[1],z:s[2],type:'omni'}], receptores:MP.map(p=>({x:p[0],y:p[1],z:p[2]})),
      opcoes:Object.assign({raios, semente:1000*rep+10*si+di+1, smin:0.2, ar, T:extra.T||4}, extra)});
    eyr[di]=R.estatistico.eyr; const h=R.raios.bruto.hist; nB=R.raios.bruto.nBins; nR=R.raios.bruto.nR;
    if (!soma) soma=Float64Array.from(h); else for (let i=0;i<h.length;i++) soma[i]+=h[i]; });
  for (let r=0;r<nR;r++){ const k=`LS${si+1}_MP${r+1}`; (sim[k]=sim[k]||[]).push(M.BANDS.map((fc,b)=>M.analyze(soma.subarray((r*6+b)*nB,(r*6+b+1)*nB)))); } });
const mean=a=>{ a=a.filter(v=>v!==null&&Number.isFinite(v)); return a.reduce((x,y)=>x+y,0)/a.length; }, sd=a=>{ const m=mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); };
const f=(v,n=2)=>(Number.isFinite(v)?v.toFixed(n):'  nan').padStart(7);
console.log(`${conj} | ${raios} raios x3 terços | ${JSON.stringify(extra)} | ${((Date.now()-t0)/1000).toFixed(0)} s`);
console.log('Eyring terços (baixo/meio/cima):'); eyr.forEach(e=>console.log('            ',e.map(v=>f(v)).join('')));
const out={eyr, par:{}}, keys=Object.keys(sim);
PAR.forEach(p=>{
  const m=M.BANDS.map(fc=>mean(keys.map(k=>med[k][fc][p]))), s=M.BANDS.map((fc,b)=>mean(keys.map(k=>mean(sim[k].map(r=>r[b][p])))));
  const rp=M.BANDS.map((fc,b)=>mean(keys.map(k=>sd(sim[k].map(r=>r[b][p]))))), dpM=M.BANDS.map(fc=>sd(keys.map(k=>med[k][fc][p])));
  out.par[p]={medido:m, simulado:s, repet:rp, dpPosMedido:dpM, porPos:Object.fromEntries(keys.map(k=>[k,{m:M.BANDS.map(fc=>med[k][fc][p]), s:M.BANDS.map((fc,b)=>mean(sim[k].map(r=>r[b][p])))}]))};
  const ab=p[0]=='C'||p=='D50';
  console.log(p.padEnd(4),'medido ',m.map(v=>f(v)).join('')); console.log('     simul. ',s.map(v=>f(v)).join('')); console.log('     '+(ab?'dif    ':'dif %  '),s.map((v,i)=>ab?f(v-m[i]):f(100*(v/m[i]-1),1)).join(''));
  if (reps>1) console.log('     dp rep ',rp.map(v=>f(v,3)).join('')); });
if (process.argv[6]) fs.writeFileSync(process.argv[6], JSON.stringify(out));
