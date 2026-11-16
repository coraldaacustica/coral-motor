// Salas de referência para os testes do motor: caixas retangulares montadas em triângulos.
'use strict';
const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
// caixa W × L × H (m) com o canto em (0,0,0); material = { a: [6 α], s } igual em todas as faces, ou um por face
// (piso, teto, frente, fundo, esquerda, direita). semFace = nome de uma face a deixar aberta.
function caixa(W, L, H, material, semFace) {
  const p = (x, y, z) => [x, y, z];
  const faces = {
    piso: quad(p(0, 0, 0), p(W, 0, 0), p(W, L, 0), p(0, L, 0)),
    teto: quad(p(0, 0, H), p(0, L, H), p(W, L, H), p(W, 0, H)),
    frente: quad(p(0, 0, 0), p(0, 0, H), p(W, 0, H), p(W, 0, 0)),
    fundo: quad(p(0, L, 0), p(W, L, 0), p(W, L, H), p(0, L, H)),
    esquerda: quad(p(0, 0, 0), p(0, L, 0), p(0, L, H), p(0, 0, H)),
    direita: quad(p(W, 0, 0), p(W, 0, H), p(W, L, H), p(W, L, 0)) };
  return Object.entries(faces).filter(([n]) => n !== semFace)
    .map(([nome, pos]) => ({ nome, pos: new Float32Array(pos), material: material[nome] || material }));
}
const uniforme = (a, s = 0) => ({ a: [a, a, a, a, a, a], s });
module.exports = { caixa, uniforme };
