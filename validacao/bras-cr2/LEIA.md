# Validação do motor com a sala CR2 do BRAS

Compara o que o motor calcula com o que foi medido numa sala de verdade: a sala de seminários CR2 (146 m³) do
**BRAS, Benchmark for Room Acoustical Simulation** (TU Berlin e RWTH Aachen), publicado com licença
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Referência: Aspöck, Brinkmann, Ackermann, Weinzierl, Vorländer,
*BRAS – Benchmark for Room Acoustical Simulation*, doi:10.14279/depositonce-6726.3.

Rodar: `node validacao/bras-cr2/cr2.js fitted 20000 1 '{"ur":40}'`
(conjunto de materiais `fitted` ou `initial`, raios por fonte, repetições, opções: `ur` umidade %, `temp` °C, `T` duração em s).

## Arquivos (derivados do BRAS, mesma licença CC BY-SA 4.0)
- `geometria.json`: o modelo 3D da sala (CR2.skp exportado em .dae e convertido com `dae2json.py`), triângulos por material, em metros.
- `materiais/fitted` e `materiais/initial`: absorção e espalhamento por terço de oitava, como publicados (linha 1 frequências,
  linha 2 absorção, linha 3 espalhamento). `fitted` foi ajustado pelos autores ao TR medido, pela fórmula de Eyring.
- `medido.json`: EDT, T20, T30, C50, C80 e D50 por oitava, calculados com `medido.py` (ISO 3382-1) a partir das 10 respostas
  ao impulso medidas com o dodecaedro (2 fontes × 5 microfones).

## Como a conta é feita
Os materiais vêm em terços de oitava e o motor trabalha em oitavas. Para a comparação ser justa, cada oitava é a soma de três
traçados (terço de baixo, do meio e de cima), cada um com a absorção do ar pela ISO 9613-1. A umidade no dia da medição não é
informada; 20 °C e 40 % é a condição em que Eyring com os materiais `fitted` reproduz o TR medido nos agudos.
O espalhamento de cada superfície é a média de 500 Hz a 2 kHz (o motor usa um valor só por superfície).

## Resultado (2026-11-10, motor 1.1.0, materiais `fitted`, 20 000 raios, 20 °C e 40 %)
Ver o relatório do projeto. Resumo: de 500 Hz a 4 kHz o T20 e o T30 ficam até 5 % do medido, o EDT até 7 %, o C80 até 0,6 dB.
Em 125 e 250 Hz a sala está abaixo da frequência de Schroeder (cerca de 220 Hz) e o método de raios não vale.
