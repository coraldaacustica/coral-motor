# Coral Motor

O motor de cálculo acústico do [Coral da Acústica](https://www.coraldaacustica.app), aberto para quem quiser ler, conferir e melhorar as contas.

Aqui estão **só os cálculos**. A tela do simulador, a modelagem 3D, a biblioteca de produtos, o orçamento e o restante da plataforma não fazem parte deste repositório.

## O que o motor calcula

- **Tempo de reverberação estatístico**: Sabine e Eyring, por oitava de 125 Hz a 4 kHz, com absorção do ar (ISO 9613-1) e do público.
- **Estudo por raios**: traçado de raios com BVH, reflexão difusa, receptores esféricos e resposta ao impulso por receptor.
- **Parâmetros da resposta ao impulso** (ISO 3382-1): EDT, T20, T30, C50, C80, D50, Ts, G e STI.
- **Mapa de cobertura** pela teoria revisada de Barron.
- **Isolamento de paredes**: método de Sharp, Rw, C e Ctr (ISO 717-1) e STC (ASTM E413).
- **Volume de ar** de modelos importados (grade de voxels) e **TR ótimo** pelo uso da sala (NBR 12179).
- **Biblioteca de materiais genéricos** com absorção por oitava e espalhamento.

Tudo fica em um arquivo só, [`coral-motor.js`](coral-motor.js), sem dependências. Roda no navegador, em Web Worker e no Node.

## Como usar

```js
const CoralMotor = require('./coral-motor.js');
const { caixa } = require('./teste/salas.js');   // monta uma sala retangular em triângulos

// sala de aula 8 × 6 × 3 m: forro mineral, piso cerâmico e paredes de reboco
const mat = id => CoralMotor.MATERIAIS.find(m => m.id === id);
const paredes = mat('reboco');
const sala = { superficies: caixa(8, 6, 3, { piso: mat('ceramica'), teto: mat('forro_min'),
  frente: paredes, fundo: paredes, esquerda: paredes, direita: paredes }) };

const r = CoralMotor.calcular({
  sala,
  fontes:     [{ x: 1, y: 3, z: 1.6, type: 'omni' }],
  receptores: [{ x: 6, y: 3, z: 1.2 }],
  opcoes:     { raios: 20000, semente: 42 }
});

r.estatistico.eyr[2];                 // TR de Eyring em 500 Hz, em segundos (0,68)
r.raios.receptores[0].bands[2].C80;   // C80 em 500 Hz no receptor, em dB
```

Cada superfície é `{ pos: Float32Array com triângulos x,y,z em metros, material: { a: [α de 125 Hz a 4 kHz], s: espalhamento } }`.
A entrada e a saída completas estão descritas no comentário de `calcular()`, no fim de `coral-motor.js`.

## Testes

```
npm test
```

São 23 testes com salas e valores de livro e de norma, calculados à mão fora do motor.

## Validação com medição real

A pasta [`validacao/bras-cr2`](validacao/bras-cr2) compara o motor com a sala de seminários CR2 do
**BRAS, Benchmark for Room Acoustical Simulation** (TU Berlin e RWTH Aachen). Com os materiais ajustados do BRAS,
de 500 Hz a 4 kHz o T20 e o T30 ficam até 5 % do medido, o EDT até 7 % e o C80 até 0,6 dB.
Abaixo de cerca de 220 Hz (frequência de Schroeder da sala) o método de raios não vale.

```
npm run validar     # cerca de 9 minutos
```

## Licença

O código do motor é distribuído sob a **GNU Affero General Public License v3.0 ou posterior** ([LICENSE](LICENSE)).
Quem usar o motor, inclusive em um serviço na internet, precisa publicar o código das suas alterações sob a mesma licença.

Os dados em `validacao/bras-cr2` (geometria, materiais e medições) são derivados do BRAS e seguem a licença
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Referência: Aspöck, Brinkmann, Ackermann, Weinzierl, Vorländer,
*BRAS – Benchmark for Room Acoustical Simulation*, doi:10.14279/depositonce-6726.3.

Copyright (C) 2026 SELO Inteligência em Fidelização e Tecnologia Ltda.
