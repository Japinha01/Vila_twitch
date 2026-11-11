# Modelos do Blender (.glb)

Esta pasta guarda os modelos 3D feitos no Blender. **Tudo aqui é opcional**: cada prédio ou árvore que não tiver arquivo continua com o modelo antigo, gerado por código. Dá para trocar um modelo de cada vez.

Os aldeões continuam em pixel art (sprites); só prédios e árvores vêm do Blender.

## Passo a passo

1. Abra o Blender (3.6 ou mais novo), vá na aba **Scripting**, clique em **Abrir**, escolha `tools/blender/vila_export.py` e aperte ▶.
2. Na vista 3D aperte **N**: aparece a aba **Vila do Chat**.
3. Clique em **Criar guias**. O script cria uma coleção para cada modelo do jogo, com um quadro do tamanho que o prédio ocupa e uma seta apontando para a frente.
4. Modele **dentro da coleção**, em cima do quadro. Pode fazer só as que quiser; coleção vazia é pulada.
5. Em **Pasta**, escolha esta pasta (`public/models`) e clique em **Exportar .glb**. O script grava um `.glb` por coleção e atualiza o `manifest.json` sozinho.
6. Rode o jogo (`npm run dev`) para conferir e depois envie a pasta para o GitHub; a Vercel publica junto.

Para comparar com os modelos antigos, abra o jogo com `?semglb` no endereço.

## Regras

| Regra | Valor |
| --- | --- |
| Nome | o **nome da coleção** vira o nome do arquivo (tabela abaixo) |
| Escala | 1 unidade do Blender (1 m) = 1 quadradinho do mapa |
| Chão | Z = 0; o centro do quadro da guia é o centro do prédio |
| Frente | lado **−Y** do Blender (vista frontal, tecla 1 do teclado numérico) |
| Guias | objetos com nome começando por `guia_` nunca são exportados |
| Formato | `.glb` com Y para cima e modificadores aplicados (o script já faz) |

## Nomes aceitos

| Arquivo | O que é | Área (X × Y) |
| --- | --- | --- |
| `townhall_fogueira`, `townhall_prefeitura`, `townhall_governo` | centro da vila: fogueira (Pedra e Bronze), prefeitura (Medieval em diante), palácio (Estado em diante) | 3 × 3 |
| `house_0` a `house_6` | casa em cada degrau: cabana, tábuas, enxaimel, pedra, bloco de tijolo, torre de vidro, condomínio | 2 × 2 |
| `market_0`, `market_1`, `market_2` | mercado, galeria, shopping | 2 × 2 |
| `waterwheel_0` a `waterwheel_3` | roda d'água de madeira, roda de ferro, turbina, usina | 2 × 2 |
| `farm`, `well`, `sawmill`, `quarry`, `warehouse` | fazenda, poço, serraria, pedreira, armazém | 2 × 2 |
| `dam` | represa (só aparece durante a obra) | 2 × 1 |
| `bridge` | ponte (um trecho; repete a cada quadradinho) | 1 × 1 |
| `tree_pine`, `tree_oak`, `tree_birch` | pinheiro, carvalho, bétula (cerca de 1,5 de altura) | 1 × 1 |

Um arquivo sem número (`house`, `market`, `waterwheel`, `townhall`) vale para todas as etapas que não tiverem arquivo próprio. Arquivo com outro nome é ignorado, com um aviso no console do navegador.

## Partes com comportamento

O jogo procura objetos pelo **começo do nome** (em inglês ou português). Todas são opcionais.

| Onde | Nome do objeto | O que o jogo faz |
| --- | --- | --- |
| `waterwheel_*` | `wheel` ou `roda` | gira em torno do próprio eixo **X** quando há água; a origem do objeto precisa estar no centro da roda |
| `farm` | `rows` ou `plantio` | fica amarelado quando a fazenda está sem irrigação |
| `well` | `water` ou `agua` | fica cinza quando o poço está seco |
| `tree_*` | objeto **ou material** começando por `leaf`, `folha` ou `copa` | a folhagem amarela na seca |

## Materiais e visual

- O jogo usa a **cor base**, a **textura da cor base**, a **cor por vértice**, a transparência e a **emissão** do material. Metálico, rugosidade e mapa de normal são ignorados (a iluminação do jogo é simples, estilo low poly).
- **Emissão** (janelas, lanternas, fogo) pega o brilho do bloom. Use força 2 ou mais para brilhar bem.
- Para textura com cara de pixel art, use interpolação **Closest** no nó da imagem.
- Sombreamento liso ou facetado vale o que estiver no Blender (Shade Smooth ou Shade Flat).
- Noite, bloom, tilt-shift, sombras, obra subindo aos poucos e prévia de construção funcionam sozinhos com os modelos novos.

## Desempenho

- Junte as peças paradas num objeto só (Ctrl+J) e use poucos materiais: cada objeto e cada material vira uma chamada de desenho por prédio. Deixe separadas só as partes com comportamento.
- Prédio: até uns 2 mil triângulos. Árvore: até uns 300 (o mapa tem centenas, desenhadas em lote).
- Texturas pequenas (256 ou 512 px). O `.glb` leva a textura embutida.

## manifest.json

Lista os arquivos que o jogo deve baixar. O botão **Exportar .glb** reescreve sozinho. À mão seria assim:

```json
{ "models": ["house_0.glb", "tree_pine.glb"] }
```

Com a lista vazia o jogo não baixa nada e fica igual a antes.
