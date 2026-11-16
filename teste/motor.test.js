// Testes do motor de cálculo com salas e valores de livro e de norma.
// Rodar: npm test
// Os valores esperados foram calculados à mão (ou por fórmula fechada) fora do motor, com a tolerância indicada em cada teste.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../coral-motor.js');
const { caixa, uniforme } = require('./salas.js');

const perto = (v, esperado, tol, msg) => assert.ok(Math.abs(v - esperado) <= tol, `${msg || ''} ${v} ≠ ${esperado} ± ${tol}`);
const perto_rel = (v, esperado, tol, msg) => perto(v, esperado, Math.abs(esperado) * tol, msg);
const db = x => 10 * Math.log10(x);

// ---------------------------------------------------------------- TR estatístico
test('Sabine e Eyring numa sala 10 × 8 × 3 m com α = 0,10 (com absorção do ar a 500 Hz)', () => {
  const r = M.calcular({ sala: { superficies: caixa(10, 8, 3, uniforme(0.10)) }, opcoes: { estatisticoSo: true } }).estatistico;
  perto(r.V, 240, 1e-3, 'volume'); perto(r.S, 268, 1e-3, 'área');
  // A = 268 × 0,10 = 26,8 m²; ar a 500 Hz: m = 2,73 dB/km → 6,286e-4 1/m; 4mV = 0,6035 m²
  perto(r.A[2], 26.8, 1e-6, 'A 500 Hz');
  perto(r.sab[2], 0.161 * 240 / (26.8 + 0.6035), 0.002, 'Sabine 500 Hz');     // 1,410 s
  perto(r.sab[2], 1.410, 0.002, 'Sabine 500 Hz (valor)');
  perto(r.eyr[2], 1.340, 0.002, 'Eyring 500 Hz');                             // 0,161·240 / (−268·ln 0,9 + 0,6035)
  assert.ok(r.eyr.every((e, b) => e < r.sab[b]), 'Eyring fica sempre abaixo de Sabine');
});

test('Sabine sem ar coincide com 0,161 V / A em 125 Hz (ar quase nulo)', () => {
  const r = M.calcular({ sala: { superficies: caixa(20, 15, 8, uniforme(0.05)) }, opcoes: { estatisticoSo: true } }).estatistico;
  // V = 2400, S = 1160, A = 58; ar a 125 Hz: 4mV = 4 × 1,013e-4 × 2400 = 0,973
  perto(r.sab[0], 0.161 * 2400 / (58 + 0.973), 0.003, 'Sabine 125 Hz');      // 6,553 s
});

test('público: 100 pessoas em cadeiras somam 35 m² Sabine a 500 Hz e só na plateia', () => {
  const sup = caixa(10, 8, 3, uniforme(0.10));
  const base = M.calcular({ sala: { superficies: sup }, opcoes: { estatisticoSo: true } }).estatistico;
  const com = M.calcular({ sala: { superficies: sup }, publico: { tipo: 'cadeira', n: 100, oc: 100, superficies: [0] }, opcoes: { estatisticoSo: true } }).estatistico;
  perto(com.A[2] - base.A[2], 35, 1e-6, 'absorção do público');
  const meia = M.calcular({ sala: { superficies: sup }, publico: { tipo: 'cadeira', n: 100, oc: 50 }, opcoes: { estatisticoSo: true } }).estatistico;
  perto(meia.A[2] - base.A[2], 17.5, 1e-6, 'ocupação de 50 %');
});

test('absorção que falta para chegar ao TR alvo (Sabine)', () => {
  // 1000 m³ com 2,0 s; alvo 1,2 s → 0,161 × 1000 × (1/1,2 − 1/2) = 53,67 m²
  perto(M.absorcaoFaltando(1000, 1.2, 2.0), 53.667, 0.01);
});

test('TR ótimo a 500 Hz (NBR 12179, curvas digitalizadas)', () => {
  perto(M.trOtimo(1000, 'conferencia'), -0.335 + 0.346 * 3, 1e-9, 'conferência, 1000 m³');   // 0,703 s
  perto(M.trOtimo(10000, 'catolica'), 0.182 + 0.428 * 4, 1e-9, 'igreja católica, 10 000 m³'); // 1,894 s
  perto(M.trOtimo(1000, 'nao-existe'), M.trOtimo(1000, 'conferencia'), 0, 'uso desconhecido vira conferência');
  assert.equal(M.trOtimo(1, 'palavra'), 0.2, 'nunca abaixo de 0,2 s');
});

// ---------------------------------------------------------------- resposta ao impulso
// decaimento exponencial ideal com TR = T, 1 ms por posição, som direto em t = 0
function decaimento(T, ms) { const h = new Float64Array(ms); for (let i = 0; i < ms; i++) h[i] = Math.exp(-13.8155 * (i + 0.5) / 1000 / T); return h; }

test('EDT, T20 e T30 de um decaimento exponencial ideal são iguais ao TR', () => {
  for (const T of [0.6, 1.2, 2.5]) {
    const a = M.analyze(decaimento(T, Math.ceil(T * 1000 * 1.3)));
    perto_rel(a.EDT, T, 0.01, `EDT T=${T}`); perto_rel(a.T20, T, 0.01, `T20 T=${T}`); perto_rel(a.T30, T, 0.01, `T30 T=${T}`);
  }
});

test('C50, C80, D50 e Ts de um decaimento exponencial ideal (fórmulas fechadas)', () => {
  const T = 1.5, k = 13.8155 / T, a = M.analyze(decaimento(T, 4000));
  const e = t => 1 - Math.exp(-k * t);   // fração da energia até t
  perto(a.C80, db(e(0.08) / (1 - e(0.08))), 0.05, 'C80');   // −3,8 dB
  perto(a.C50, db(e(0.05) / (1 - e(0.05))), 0.05, 'C50');
  perto(a.D50, 100 * e(0.05), 0.3, 'D50');
  perto(a.Ts, 1000 / k, 1, 'Ts (ms)');                      // T / 13,8 = 108,6 ms
});

test('STI de um decaimento exponencial sem ruído segue a MTF de Houtgast e Steeneken', () => {
  const F = [0.63, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 12.5], W = [0.13, 0.14, 0.11, 0.12, 0.19, 0.17, 0.14];
  for (const T of [0.5, 1, 2]) {
    const ti = F.map(f => { const m = 1 / Math.sqrt(1 + Math.pow(2 * Math.PI * f * T / 13.8155, 2)); return (Math.max(-15, Math.min(15, db(m / (1 - m)))) + 15) / 30; });
    const mti = ti.reduce((a, v) => a + v, 0) / F.length, esperado = W.reduce((a, w) => a + w * mti, 0);
    const bands = Array.from({ length: 6 }, () => M.analyze(decaimento(T, Math.ceil(T * 1000 * 1.6))));
    perto(M.sti(bands), esperado, 0.01, `STI T=${T}`);
  }
  // referência de livro: TR de 1 s sem ruído fica perto de 0,6 (bom); 2 s perto de 0,45 (razoável)
  const st = T => M.sti(Array.from({ length: 6 }, () => M.analyze(decaimento(T, Math.ceil(T * 1600)))));
  assert.ok(st(1) > 0.55 && st(1) < 0.68, 'STI com 1 s'); assert.ok(st(2) > 0.4 && st(2) < 0.52, 'STI com 2 s');
});

// ---------------------------------------------------------------- estudo por raios
test('raios numa caixa difusa: T30 fica perto de Eyring (até 10 %)', () => {
  const sup = caixa(12, 9, 4, uniforme(0.15, 1));
  const r = M.calcular({ sala: { superficies: sup }, fontes: [{ x: 3, y: 2.5, z: 1.6 }], receptores: [{ x: 8, y: 6, z: 1.2 }, { x: 6, y: 4, z: 1.2 }],
    opcoes: { raios: 20000, semente: 1 } });
  assert.ok(r.raios.perdidos < 0.01, 'sala fechada não perde raios');
  for (const R of r.raios.receptores) for (const b of [2, 3]) perto_rel(R.bands[b].T30, r.estatistico.eyr[b], 0.10, `T30 banda ${b}`);
  assert.equal(r.raios.receptores[0].direct.visible, true, 'receptor vê a fonte');
  perto(r.raios.receptores[0].direct.d, Math.hypot(5, 3.5, 0.4), 1e-6, 'distância da fonte');
});

// Validação BRAS CR2 (2026-11-10): com pouco espalhamento os raios especulares eram detectados por um disco que crescia
// além das paredes, a energia tardia sumia e o T20/T30 saía 5 a 7 % abaixo de Eyring nesta sala (10 % na CR2).
// Numa caixa com absorção uniforme o decaimento fica entre Eyring e Sabine (correção de Kuttruff: cerca de 2 a 4 % acima de Eyring).
test('raios numa caixa pouco difusa (s = 0,2): T20 e T30 não ficam abaixo de Eyring', () => {
  const r = M.calcular({ sala: { superficies: caixa(8, 6, 3, uniforme(0.10, 0.2)) }, fontes: [{ x: 1.2, y: 1.2, z: 1.6 }],
    receptores: [{ x: 2.4, y: 3.6, z: 1.2 }, { x: 5.6, y: 2.1, z: 1.2 }, { x: 4.4, y: 4.8, z: 1.5 }], opcoes: { raios: 20000, semente: 1, smin: 0 } });
  const e = r.estatistico.eyr[2], m = p => r.raios.receptores.reduce((a, R) => a + R.bands[2][p], 0) / 3;
  for (const p of ['T20', 'T30']) assert.ok(m(p) > e * 0.99 && m(p) < e * 1.07, `${p} ${m(p).toFixed(3)} fora de Eyring ${e.toFixed(3)} (+0 a +7 %)`);
});

test('raios: a mesma semente dá o mesmo resultado; sementes diferentes, resultados próximos', () => {
  const E = s => ({ sala: { superficies: caixa(10, 8, 3, uniforme(0.2, 0.5)) }, fontes: [{ x: 2, y: 2, z: 1.6 }], receptores: [{ x: 7, y: 6, z: 1.2 }], opcoes: { raios: 5000, semente: s } });
  const a = M.calcular(E(5)).raios.receptores[0].bands[2], b = M.calcular(E(5)).raios.receptores[0].bands[2], c = M.calcular(E(6)).raios.receptores[0].bands[2];
  assert.equal(a.T30, b.T30); assert.equal(a.C80, b.C80);
  perto_rel(c.T30, a.T30, 0.15, 'T30 com outra semente');
});

test('raios: sala aberta (sem teto) perde raios', () => {
  const r = M.calcular({ sala: { superficies: caixa(10, 8, 3, uniforme(0.1, 0.3), 'teto'), volume: 240 }, fontes: [{ x: 3, y: 3, z: 1.5 }], receptores: [{ x: 7, y: 5, z: 1.2 }], opcoes: { raios: 3000, semente: 2 } });
  assert.ok(r.raios.perdidos > 10, `perdidos ${r.raios.perdidos}`);
});

test('dividir os raios em partes (workers) e somar dá um histograma com a mesma energia', () => {
  const sup = caixa(10, 8, 3, uniforme(0.2, 0.5)), E = M.calcular({ sala: { superficies: sup }, opcoes: { estatisticoSo: true } }).estatistico;
  const cena = M.cenaRaios(sup.map(g => ({ pos: g.pos, a: g.material.a, s: g.material.s })), 0.2);
  const P = k => Object.assign({}, cena, { srcs: M.fontesRaios([{ x: 2, y: 2, z: 1.6 }]), recs: new Float64Array([7, 6, 1.2]), rr: 0.5, nRays: 8000, tmax: M.tmaxPadrao(E.eyr, ''), air: M.AIR, c: M.C0, nPaths: 0, part: k, parts: 2, semente: 10 + k });
  const soma = M.somarPartes([M.tracarRaios(P(0)), M.tracarRaios(P(1))]);
  const um = M.tracarRaios(Object.assign(P(0), { parts: 1, semente: 99 }));
  const tot = h => h.reduce((a, v) => a + v, 0);
  perto_rel(tot(soma.hist), tot(um.hist), 0.05, 'energia total');
});

// ---------------------------------------------------------------- fontes e mapa
test('diretividade da caixa: 0 dB no eixo, −6 dB na borda da abertura a 1 kHz', () => {
  const s = M.srcParams(M.normSrc({ type: 'caixa', az: 0, el: 0, h: 90, v: 60 }));
  perto(M.dirLin(s, 3, 0, 1, 0), 1, 1e-12, 'eixo');
  const a = 45 * Math.PI / 180;
  perto(db(M.dirLin(s, 3, Math.sin(a), Math.cos(a), 0)), -6, 1e-9, 'borda horizontal');
  perto(db(M.dirLin(s, 3, 0, -1, 0)), -25, 1e-9, 'atrás: piso de −25 dB');
  const o = M.srcParams(M.normSrc({ g: 3 }));
  perto(db(M.dirLin(o, 0, 0.3, 0.4, Math.sqrt(0.75))), 3, 1e-9, 'omni com ganho 3 dB');
  perto(M.srcPower(o)[2], Math.pow(10, 0.3), 1e-9, 'potência da omni = ganho');
});

test('mapa pela teoria revisada de Barron: valores de livro', () => {
  const sp = [M.srcParams(M.normSrc({ x: 0, y: 0, z: 0 }))], PW = [1];
  // V = 10 000 m³, T = 2 s, r = 20 m: direto 100/r² = 0,25; reverberante 31200·T/V·e^(−0,04 r/T) = 4,183
  perto(M.mapaValor(sp, PW, 2, 2, 10000, 20, 0, 0, 'G'), db(0.25 + 6.24 * Math.exp(-0.4)), 1e-9, 'G');   // 6,47 dB
  perto(M.mapaValor(sp, PW, 2, 2, 10000, 20, 0, 0, 'Ld'), db(0.25), 1e-9, 'som direto');
  const rev = 6.24 * Math.exp(-0.4), k = 13.82 / 2;
  perto(M.mapaValor(sp, PW, 2, 2, 10000, 20, 0, 0, 'C80'), db((0.25 + rev * (1 - Math.exp(-k * 0.08))) / (rev * Math.exp(-k * 0.08))), 1e-9, 'C80');
});

// ---------------------------------------------------------------- volume de modelos importados
test('volume por voxels: caixa fechada e caixa com uma face aberta', () => {
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 8, z: 3 } };
  const f = M.voxelVolume(caixa(10, 8, 3, uniforme(0.1)), box, { x: 5, y: 4, z: 1.5 });
  assert.equal(f.fechado, true); perto_rel(f.V, 240, 0.03, 'fechada');
  assert.equal(f.air(5, 4, 1.5), true); assert.equal(f.air(5, 4, 3.5), false);
  const a = M.voxelVolume(caixa(10, 8, 3, uniforme(0.1), 'fundo'), box, { x: 5, y: 4, z: 1.5 });
  assert.equal(a.fechado, false); perto_rel(a.V, 240, 0.15, 'aberta');
  perto(M.volumeMalha(caixa(10, 8, 3, uniforme(0.1))), 240, 1e-3, 'soma de tetraedros');
});

// ---------------------------------------------------------------- isolamento
// R por terço de oitava de 100 Hz a 5 kHz (18 valores), como no simulador
const F3 = M.F3, REF = [33, 36, 39, 42, 45, 48, 51, 52, 53, 54, 55, 56, 56, 56, 56, 56];

test('ISO 717-1: curva de referência e reta de 40 dB (calculado à mão)', () => {
  // R igual à curva de referência: a curva ainda sobe 2 dB (16 bandas × 2 dB = 32 dB de desvio desfavorável) → Rw 54
  assert.equal(M.ratingRw(REF.concat([56, 56])).Rw, 54);
  assert.equal(M.ratingRw(REF.map(v => v - 7).concat([49, 49])).Rw, 47);
  // reta de 40 dB: com Rw 40 (deslocamento −12) os desfavoráveis são 1+2+3+4+4+4+4+4 = 26 dB ≤ 32; com Rw 41 seriam 36
  assert.equal(M.ratingRw(F3.map(() => 40)).Rw, 40);
});

test('ASTM E413: contorno STC 50 e a regra dos 8 dB (calculado à mão)', () => {
  // R igual ao contorno 50: sobe até 52 (16 bandas × 2 dB = 32); com um vale de 9 dB numa banda, a regra dos 8 dB segura em 49
  const STC = [-16, -13, -10, -7, -4, -1, 0, 1, 2, 3, 4, 4, 4, 4, 4, 4];
  const R = [0].concat(STC.map(v => v + 50), [0]);
  assert.equal(M.ratingSTC(R), 52);
  const V = R.slice(); V[9] -= 9; assert.equal(M.ratingSTC(V), 49);
});

test('lei das massas: placa de gesso 12,5 mm (9 kg/m²) dá 26 dB a 500 Hz', () => {
  const I = { mode: 'calc', layers: [{ t: 'panel', m: 'gesso', h: 12.5 }], frame: 'none', b: 600 };
  const R = M.Rcurve(I);
  perto(R[F3.indexOf(500)], 20 * Math.log10(9 * 500) - 47, 0.01, 'R 500 Hz');   // 26,06 dB
  const L = M.stackModel(I).leaves[0];
  perto(L.fc, 2657, 20, 'frequência crítica');                                  // c²/2π · √(m/B)
});

test('Rw de paredes conhecidas fica na faixa dos catálogos e da ISO 12354-1', () => {
  const rw = k => { const p = M.ISO_PRESETS[k]; return M.ratingRw(M.Rcurve({ mode: 'calc', layers: p.layers, frame: p.frame, b: p.b })).Rw; };
  const conc = rw('concreto15');                       // 345 kg/m²: 37,5·log m − 42 = 53,2; medido 55 a 56
  assert.ok(conc >= 51 && conc <= 58, `concreto 15 cm: Rw ${conc}`);
  const dry = M.ratingRw(M.Rcurve({ mode: 'calc', layers: [{ t: 'panel', m: 'gesso', h: 12.5 }], frame: 'none', b: 600 })).Rw;
  assert.ok(dry >= 25 && dry <= 31, `uma placa de gesso: Rw ${dry}`);   // catálogos: 26 a 28
  const duplo = rw('dry_duplo');                        // 2+2 placas, montante 90, lã: catálogos 48 a 53
  assert.ok(duplo >= 44 && duplo <= 56, `drywall 2+2: Rw ${duplo}`);
  assert.ok(rw('dry_indep') > duplo, 'estrutura independente isola mais que a simples');
});

test('drywall com a cavidade vazia isola menos que com lã (revisão 2026-11-11)', () => {
  const P = () => ({ t: 'panel', m: 'gesso', h: 12.5 });
  const rw = fill => M.ratingRw(M.Rcurve({ mode: 'calc', layers: [P(), { t: 'cav', h: 48, fill }, P()], frame: 'metal', b: 600 })).Rw;
  const vazia = rw('ar'), la = rw('la_vidro_16');
  assert.ok(vazia >= 35 && vazia <= 39, `1+48+1 vazia: Rw ${vazia}`);   // catálogos: 36 a 38
  assert.ok(la >= 41 && la <= 45, `1+48+1 com lã: Rw ${la}`);          // catálogos: 42 a 44
  assert.ok(la - vazia >= 4, `a lã tem que valer pelo menos 4 dB (deu ${la - vazia})`);
});

test('isolamento em campo: DnT = R\' + 10·log(0,32 V/S)', () => {
  const { Rp, DnT } = M.isolamentoCampo([50, 50], 3, 40, 12.8);   // 0,32·40/12,8 = 1 → DnT = R'
  assert.deepEqual(Rp, [47, 47]); perto(DnT[0], 47, 1e-9);
});

// ---------------------------------------------------------------- materiais
test('biblioteca de materiais genéricos: 6 bandas entre 0 e 1 e cópia independente', () => {
  for (const m of M.MATERIAIS) { assert.equal(m.a.length, 6, m.id); assert.ok(m.a.every(v => v >= 0 && v <= 1), m.id); assert.ok(m.s >= 0 && m.s <= 1, m.id); }
  const a = M.materiaisGenericos(); a[0].a[0] = 9; assert.notEqual(M.MATERIAIS[0].a[0], 9);
});
