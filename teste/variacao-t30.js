// Quanto o T30 (e os outros parâmetros) varia entre rodadas do estudo por raios, só pelo sorteio dos raios.
// Não é teste de passa/falha: imprime média, desvio padrão e faixa de cada parâmetro por número de raios.
// Rodar: node teste/variacao-t30.js [rodadas]
'use strict';
const M = require('../coral-motor.js');
const { caixa } = require('./salas.js');
const mat = id => M.MATERIAIS.find(m => m.id === id);
// sala exemplo do simulador (16 × 24 × 9 m) com os materiais que ele escolhe sozinho: piso de madeira, forro de gesso, fundo em lã de rocha, reboco
const sala = caixa(16, 24, 9, { piso: mat('madeira_piso'), teto: mat('forro_gesso'), fundo: mat('la_rocha'), frente: mat('reboco'), esquerda: mat('reboco'), direita: mat('reboco') })
  .map(g => Object.assign(g, { pos: g.pos.map((v, i) => i % 3 === 0 ? v - 8 : v) }));   // x de −8 a 8, como no simulador
const fontes = [{ x: 0, y: 3, z: 1.6 }], receptores = [{ x: -3, y: 10, z: 1.2 }, { x: 4, y: 16, z: 1.2 }, { x: 0, y: 22, z: 1.2 }];
const N = +process.argv[2] || 8;
const est = M.calcular({ sala: { superficies: sala }, opcoes: { estatisticoSo: true } }).estatistico;
console.log(`Sala 16 × 24 × 9 m, V = ${est.V.toFixed(0)} m³; Eyring 500 Hz = ${est.eyr[2].toFixed(2)} s, 1 kHz = ${est.eyr[3].toFixed(2)} s; ${N} rodadas por linha\n`);
const stat = v => { const m = v.reduce((a, x) => a + x, 0) / v.length, d = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); return { m, d, lo: Math.min(...v), hi: Math.max(...v) }; };
const f = (x, n = 2) => x.toFixed(n).replace('.', ',');
for (const [raios, rr] of [[20000, 0.5], [20000, 1.0], [80000, 0.5]]) {
  const runs = [];
  for (let s = 1; s <= N; s++) runs.push(M.calcular({ sala: { superficies: sala }, fontes, receptores, opcoes: { raios, raioReceptor: rr, semente: s * 7919 } }).raios.receptores);
  console.log(`${raios} raios, receptor de ${rr} m:`);
  receptores.forEach((_, r) => {
    const lin = ['T30', 'T20', 'EDT', 'C80'].map(k => { const v = runs.map(R => k === 'C80' ? (R[r].bands[2].C80 + R[r].bands[3].C80 + R[r].bands[4].C80) / 3 : (R[r].bands[2][k] + R[r].bands[3][k]) / 2), q = stat(v);
      return `${k} ${f(q.m)} ± ${f(q.d)} (${f(q.lo)} a ${f(q.hi)}${k === 'C80' ? ' dB' : ' s'})`; });
    const t30b = [0, 1, 2, 3, 4, 5].map(b => { const q = stat(runs.map(R => R[r].bands[b].T30)); return f(100 * q.d / q.m, 0) + '%'; });
    console.log(`  R${r + 1}: ${lin.join(' · ')}\n       desvio do T30 por banda 125…4k: ${t30b.join(' ')}`);
  });
  console.log('');
}
