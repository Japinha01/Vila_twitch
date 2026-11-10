# Vila do Chat (nome provisório)

Jogo web que conecta com a Twitch. Cada viewer que usa um comando no chat vira um aldeão de uma vila estilo Timberborn. O chat constrói a vila junto, o streamer gerencia e acelera o tempo, e canais da mesma comunidade podem se enfrentar em guerras.

Nomes possíveis: Vila do Chat, Chatlândia, Aldeia Ao Vivo, Povoado, Clã das Vilas.

---

## 1. Visão

**Em uma frase:** o chat é o povo, o streamer é o prefeito, e a vila é o lugar onde a comunidade deixa marca.

**Por que funciona:**
- O viewer deixa de ser só audiência: ele tem um personagem que continua existindo entre as lives.
- O streamer ganha conteúdo que se gera sozinho (eventos, desastres, guerras, rivalidades).
- Guerra entre canais cria rivalidade saudável e leva viewers de um canal para o outro.

## 2. Pilares de design

1. **Zero atrito para o viewer.** Um comando digitado e ele já está dentro. Nada de cadastro.
2. **O chat nunca fica sem o que fazer.** Cada comando tem efeito visível em segundos.
3. **O streamer é o diretor, não o operário.** Ele decide prioridades e ritmo; o chat executa.
4. **Persistência gera apego.** O aldeão, as conquistas e a vila sobrevivem entre as lives.
5. **Perder não destrói.** Derrota em guerra custa recursos e orgulho, nunca a vila inteira.

## 3. Loop de jogo

1. Viewer digita `!entrar` e nasce um aldeão com o nome/cor da Twitch.
2. Aldeões trabalham sozinhos (IA simples) seguindo as prioridades definidas pelo streamer e pelos comandos do chat.
3. Recursos viram prédios, prédios viram população, população vira poder.
4. Eventos (chuva, seca, praga, saque) criam tensão e momentos de live.
5. A vila cresce, o streamer ajusta a estratégia e o ciclo recomeça.

## 4. Comandos do chat (MVP)

| Comando | Efeito |
|---|---|
| `!entrar` | Cria o aldeão do viewer |
| `!trabalhar <recurso>` | Muda a profissão atual (madeira, comida, pedra, água) |
| `!construir <prédio>` | Vota/contribui para a construção de um prédio |
| `!status` | Responde (ou mostra no overlay) o estado do aldeão |
| `!vila` | Mostra um resumo da vila |
| `!apoiar` | Dá bônus temporário à vila (cooldown por viewer) |

Regras de segurança:
- Cooldown por viewer em cada comando.
- Fila de comandos com limite por segundo para não travar o jogo.
- Filtro de nome (blocklist) para o aldeão e a vila.
- Mods e streamer podem remover aldeões.

## 5. Recursos e prédios (primeira versão)

**Recursos:** madeira, pedra, comida, água.

**Prédios:**
- Casa (aumenta população máxima)
- Fazenda e Poço (comida e água)
- Serraria e Pedreira (madeira e pedra)
- Armazém (aumenta estoque)
- Quartel e Muralha (poder militar, usados na guerra)
- Monumento (marca de prestígio, puramente cosmético/ranking)

**Profissões do aldeão** (cresce com XP de uso): lenhador, fazendeiro, pedreiro, construtor, guarda.

## 6. Controles do streamer

- Velocidade do tempo: pausa, x1, x2, x4, x8.
- Prioridades: o que construir primeiro, o que coletar primeiro.
- Eventos manuais: chuva, seca, festival, chegada de NPCs.
- Modo "assistente": o streamer vira um aldeão especial com poderes (construir mais rápido, curar, reforçar).
- Painel separado do overlay, para o chat não ver as decisões antes da hora se o streamer não quiser.

### 6.1 Eventos resgatáveis pelos viewers

Os eventos (chuva, festival, praga, chegada de NPCs, meteoro) viram "cartas de evento" que o viewer ativa. Há três formas de pagar, e elas podem coexistir:

| Fonte | Como funciona | Observação |
|---|---|---|
| Pontos do canal | Recompensa personalizada; o jogo escuta o resgate via Twitch EventSub | Só canais Afiliados/Parceiros. O streamer faz login e autoriza `channel:read:redemptions` (ler) e `channel:manage:redemptions` (confirmar ou reembolsar) |
| Doação / Bits | Webhook ou socket do serviço de doação (StreamElements, Streamlabs, Livepix etc.) ou Bits via EventSub | Conferir a API de cada serviço. Valor mínimo por evento configurável |
| Moedas da vila | Moeda do jogo, ganha jogando; o viewer gasta com `!evento <nome>` | Funciona em qualquer canal, inclusive sem Afiliado. É o plano B |

**Doações vão 100% para o streamer.** O jogo nunca recebe nem repassa dinheiro: a doação cai direto no serviço do streamer (StreamElements, Streamlabs, Livepix etc.) e o jogo apenas escuta o aviso e dispara o evento. Isso evita lidar com pagamentos, taxas e impostos nessa parte. Se algum dia houver venda de cosméticos (6.2), essa receita é separada e do jogo.

Regras:
- Fila de eventos com aprovação do streamer (aceitar, recusar, reembolsar).
- Cooldown global por tipo de evento e teto por hora.
- Evento ruim tem limite de dano: nunca destrói a vila inteira.
- O evento aparece no overlay com o nome de quem ativou (reconhecimento é o que faz o viewer pagar).
- Na guerra, eventos podem ser enviados ao rival (ex.: "mandar praga no canal inimigo").

### 6.2 Conta do viewer e cosméticos

- O viewer entra no site com Twitch (OAuth só para identificar, sem permissões extras). A conta é o ID da Twitch.
- O visual é **único por viewer e global**: o mesmo aldeão aparece em todo canal onde ele jogar. Ao digitar `!entrar`, o jogo busca o visual pelo ID.
- Quem nunca logou recebe um visual padrão gerado a partir do ID (sempre o mesmo) e um convite para personalizar.
- Cosméticos: roupas, chapéus, cores, bandeira, moldura do nome, comemoração. Vêm de conquistas, guerras e eventos, e opcionalmente de compra (Pix) numa fase posterior.
- Regra de ouro: cosmético nunca dá poder.
- Dados no Supabase (perfil e inventário) com RLS: cada viewer edita só o próprio.
- Ideia extra: **passaporte** com um selo por canal visitado e ranking de "viewer que mais viajou".

## 7. Modos de jogo

### 7.1 Endless
Vila sem fim. Foco em crescimento, ranking de maiores vilas e conquistas. É o modo base, onde tudo é testado primeiro.

### 7.2 Guerra entre canais
- **Preparação:** X dias (configurável pelo streamer) para juntar aldeões, recursos e construir quartéis e muralhas.
- **Pareamento:** por **código de sala**. O streamer A cria, o streamer B entra com o código.
- **Batalha:** resolvida por uma função determinística (poder da vila + prédios militares + moral + sorte controlada por seed combinada). Os dois lados veem a mesma animação.
- **Decisões do chat durante a batalha:** votação em tempo real (atacar, defender, reforçar muralha) que dá bônus.
- **Resultado:** o vencedor ganha troféu e recursos. O perdedor perde parte do estoque e ganha "moral de revanche". Ninguém perde a vila.

### 7.3 Guerra de Objetivos (estilo War, 4 canais)

Inspirado no jogo de tabuleiro War: 4 canais, cada um com sua vila e **um objetivo secreto**. Vence quem cumprir o objetivo primeiro, ou quem estiver mais perto quando o tempo acabar.

- Sala criada com código; 4 streamers entram.
- O servidor sorteia um objetivo para cada canal. Nem o chat nem os outros jogadores sabem qual é.
- Exemplos de objetivos: conquistar a vila de um canal específico; chegar a X aldeões; acumular X de um recurso; vencer N batalhas; passar o prazo sem perder nenhum prédio; destruir o Monumento de um canal; ter a maior população sem nunca ter atacado ninguém.
- Fases: preparação, rodadas (comércio, alianças, ataques) e revelação final.
- Diplomacia entre streamers (alianças, pacto de não agressão, comércio, traição). Isso é o conteúdo da partida.
- **Como o segredo funciona:** o objetivo aparece só num **painel secreto** (página separada, fora da captura do OBS), liberado apenas para o streamer logado. O chat vota estratégias sem saber o objetivo, e o streamer conduz por pistas. É aí que está a graça.
- **Revelação final:** todos os objetivos são expostos juntos. É o momento de clipe.
- Vila derrotada não elimina o streamer: vira ruínas e o canal continua em modo apoio/sabotagem até o fim.

**Mapa (modelo híbrido):**
- **4 vilas locais:** cada streamer tem a sua, simulada no navegador dele, com o chat e o overlay dele. É o que a audiência vê o tempo todo.
- **1 mapa-mundo compartilhado:** estilo tabuleiro de War, com 4 territórios, rotas, exércitos em marcha, alianças e fronteiras. Conquistas, ataques e objetivos acontecem aqui.
- Pela rede trafegam só dados leves: dono de cada território, tamanho dos exércitos, rotas, alianças e resultados de batalha. Os aldeões nunca são sincronizados entre canais.
- **Névoa de guerra:** cada streamer vê apenas os territórios vizinhos. Reforça o segredo dos objetivos e abre espaço para espionagem e blefe.
- O overlay do OBS mostra a vila local e um mini-mapa do mundo (com a névoa aplicada).

### 7.4 Cooperativo / Ondas
A vila contra desastres e ondas de inimigos controladas pelo jogo. É barato de implementar e ótimo para lives menores que não têm rival.

### 7.5 Ideias para depois
- **Temporadas:** reset sazonal do ranking, mantendo os troféus.
- **Torneio de comunidade:** chave com várias vilas.
- **Comércio:** duas vilas aliadas trocam recursos.
- **Cosméticos exclusivos para subs/bits** (ver 6.2).

## 8. Retenção

- Aldeão persistente por ID da Twitch.
- Vila continua rodando devagar entre lives (progressão offline limitada) para dar motivo de voltar.
- Perfil do viewer: tempo de vila, prédios construídos, guerras vencidas.
- Ranking de aldeões e de vilas.
- Eventos semanais ("Dia da colheita", "Invasão").

## 9. Arquitetura técnica sugerida

| Camada | Escolha | Motivo |
|---|---|---|
| Front/jogo | Vite + TypeScript + Canvas (ou PixiJS) | Leve, rápido para iterar, bom para overlay OBS |
| Chat | `tmi.js` no modo anônimo | Lê o chat sem login e sem bot |
| Login do streamer | Twitch OAuth (via Supabase Auth) | Necessário só para resgates de pontos e respostas no chat |
| Dados | Supabase (Postgres) | Aldeões, vilas, ranking, histórico |
| Tempo real | Supabase Realtime (ou PartyKit) | Pareamento de guerra e sincronização |
| Deploy | GitHub + Vercel | Fluxo de deploy automático |

**Observação importante:** a Vercel não mantém WebSocket aberto. Por isso o tempo real fica no Supabase/PartyKit, e a Vercel serve só o site.

**Simulação:** roda no navegador do streamer (cliente autoritativo da própria vila) e salva snapshots no Supabase. Na guerra, os dois clientes trocam só o "poder" e a seed e resolvem a batalha com a mesma função determinística, evitando servidor de jogo dedicado.

**Exceção: Guerra de Objetivos.** Informação secreta não pode morar no navegador. Nesse modo o estado da partida e os objetivos ficam numa sala autoritativa (PartyKit, ou Supabase Edge Functions + Postgres com RLS). O objetivo só chega ao painel secreto do streamer dono dele, por canal autenticado. O overlay recebe apenas o estado público. A resolução de batalhas também passa a ser feita pelo servidor, não pelos clientes.

**Mapa-mundo da Guerra de Objetivos:** o estado do mundo (territórios, exércitos, alianças) vive na sala autoritativa. Cada cliente recebe só a parte visível para ele (névoa de guerra), nunca o estado completo.

**Eventos por pontos do canal:** o cliente do streamer conecta no EventSub (WebSocket) com o token dele. Não precisa de servidor próprio para isso.

**Cuidados:**
- Validar no servidor (policies do Supabase) para ninguém editar a vila do outro.
- Rate limit nos comandos.
- Não expor tokens no cliente.

## 10. Roadmap

| Marco | Entrega |
|---|---|
| M0 | Vila em canvas com chat **simulado** (botões que fingem comandos). Testar o feeling sem estar ao vivo. |
| M1 | ✅ Leitura real do chat da Twitch (`!entrar`, `!trabalhar`, ...), anônima, com tmi.js. |
| M2 | ✅ Persistência de aldeões e vila no Supabase (login com a Twitch). |
| M3 | ✅ Painel do streamer + overlay para OBS (Fonte de navegador, via Supabase Realtime). |
| M4 | ✅ Modo Endless completo: eventos locais, conquistas e ranking na nuvem. |
| M5 | Eventos resgatáveis (moedas da vila primeiro, depois pontos do canal e doação). |
| M6 | Conta do viewer (login Twitch) e cosméticos globais. |
| M7 | Modo Guerra entre canais (código de sala). |
| M8 | Guerra de Objetivos (4 canais, objetivos secretos, sala autoritativa). |
| M9 | Cooperativo/ondas, temporadas, passaporte. |

## 11. Riscos e como tratar

- **Chat vira spam:** cooldowns e fila com limite.
- **Vila grande demais trava o navegador:** limite de aldeões visíveis, LOD (aldeões distantes viram pontos).
- **Trapaça em guerra:** resolução determinística com seed combinada e validação do snapshot.
- **Nomes ofensivos:** blocklist e remoção por mod.
- **Regras da Twitch:** respeitar os termos da API e de uso de overlay/chat.

## 12. Decisões em aberto

- Tempo de jogo: dias de jogo ligados a tempo real, ou ao tempo de live?
- Quantos aldeões simultâneos é o alvo (50, 500, 5000)?
- Estilo visual: pixel art, low poly ou vetor flat?
- Guerra: quanto tempo dura a batalha (30 s, 2 min, 10 min)?
- Será gratuito, ou haverá versão premium para streamers?
- Guerra de Objetivos: os 4 jogadores são 4 canais (suposição atual)? Quanto dura a partida (uma live, uma semana)?
- Eventos: quais são grátis (moedas) e quais exigem pontos ou doação? Qual o valor mínimo de doação?
- Cosméticos: só por conquista, ou também compra com Pix? (se vender, definir termos e impostos)

---

## Como jogar (versão Timberborn)

O **streamer joga como no Timberborn**: constrói e melhora a vila clicando no mapa. Os **viewers são os aldeões**: `!entrar` cria o aldeão e `!trabalhar madeira|pedra|comida|água|construir` define o que ele faz. O chat não constrói; quem decide a vila é o streamer.

**Streamer (painel à direita):**
- Escolha um prédio na paleta e clique no mapa (a prévia fica verde ou vermelha). Botão direito ou Esc cancela.
- ★ Prioridade: clique numa obra para os construtores irem primeiro nela. ✖ Demolir: numa obra em andamento devolve tudo; num prédio pronto devolve metade.
- Câmera: arraste ou use **W A S D** para mover (Shift acelera), roda do mouse dá zoom, duplo clique recentraliza. Velocidade: pausa, x1, x2, x4 (atalhos: espaço, 1, 2, 3).

**Mundo:**
- Terreno com relevo (degraus) e um **rio** que nasce no norte e corre até o sul. A água escorre pelo relevo de verdade.
- **Irrigação:** só a terra perto da água fica verde. Árvores e arbustos só rebrotam em solo irrigado; **fazenda** só pode ser construída (e só rende) em solo irrigado; **poço** só rende com água por perto. Fazenda tem 3 vagas de trabalhadores, poço tem 2 e pedreira tem 3.
- **Pedra:** as pedras do mapa acabam; a **pedreira** é a fonte sustentável de pedra (e não depende de água).
- **Seca:** o jogo avisa 1 dia antes. A cada 4 dias de estação temperada vêm 2 dias de seca. O rio seca, a terra amarela e as plantações param. Guarde água e comida antes.
- **Represa:** construída sobre o rio, sobe o terreno e segura a água a montante, formando um reservatório que irriga uma área maior e aguenta mais a seca.
- **Alagamento:** prédio com água alta sobre ele (por exemplo, perto de um reservatório) para de funcionar até secar; casa alagada não conta para a população e armazém alagado não conta para o estoque.
- **Salvar:** a vila é salva sozinha neste navegador (a cada 30 s e ao sair da aba) e carregada ao abrir. Botões 💾 Salvar e Nova vila no painel.
- Fome ou sede só deixa o trabalho mais lento; ninguém morre.

---

## Como rodar

Requer Node 20+.

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes da simulação e do chat
npm run build    # gera a pasta dist/
```

**Publicar:** suba o repositório no GitHub, importe na Vercel (preset *Vite*; build `npm run build`, saída `dist`) e cada push na `main` publica sozinho.

**Visual:** o padrão é 3D low poly (Three.js). Sombras e luz que muda com a seca. O botão 🧊/🗺 no painel alterna para o isométrico 2D (ou use `?2d` na URL); se o WebGL falhar, o jogo cai sozinho para o 2D. Q e E (ou botão do meio do mouse) giram a câmera no 3D.

**Estrutura:** `src/sim` (lógica pura e determinística: relevo, água, aldeões, prédios), `src/chat` (comandos: validação → cooldown → fila → efeito), `src/render` (Canvas isométrico, vetor flat), `src/ui` (painel do streamer e chat simulado).

**Chat da Twitch (M1):** no painel, digite o seu canal e clique em Conectar. A leitura é anônima (sem login nem token), então as respostas do jogo aparecem só no painel, não no chat da Twitch. O ID numérico da Twitch identifica cada viewer. O chat simulado continua para testes.

**Nuvem (M2, opcional):** guarda a vila e o XP dos viewers na sua conta (Supabase + login com a Twitch). Sem configurar nada, o jogo segue só com o save do navegador. Para ligar:

1. Crie um projeto grátis em supabase.com e rode `supabase/schema.sql` no SQL Editor (cria as tabelas com regras para que cada streamer só veja os próprios dados).
2. Registre um app em dev.twitch.tv/console (tipo "Website"). Em "OAuth Redirect URLs" coloque a URL de callback que o Supabase mostra em Authentication > Providers > Twitch. Copie o Client ID e o Client Secret para esse mesmo provedor no Supabase e ative-o.
3. Em Authentication > URL Configuration, coloque a URL do jogo (`http://localhost:5173` e a da Vercel) em Site URL / Redirect URLs.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (só a chave **anon**, nunca a `service_role`). Na Vercel, cadastre as mesmas duas variáveis em Settings > Environment Variables.

Com isso aparece a seção "Nuvem" no painel. A vila é salva sozinha a cada 60 s; viewers que voltam numa vila nova recuperam XP e função (só os do chat real, identificados pelo ID da Twitch).

**Overlay para o OBS (M3):** precisa da nuvem configurada (variáveis do Supabase; o login não é necessário). No painel, em "Overlay para o OBS", clique em Ativar overlay e copie o link. No OBS: Fontes > + > Navegador, cole o link, largura 1920 e altura 1080 (o fundo é escuro; para transparente use `&transparente=1`). Mantenha a aba do jogo aberta durante a live: é ela que roda a vila e transmite para o overlay, só enquanto houver um overlay aberto. O link é secreto (192 bits aleatórios); "Gerar novo link" invalida o antigo. Opções no link: `&transparente=1` (fundo transparente) e `&2d` (visual 2D). O jogo não precisa de nenhuma configuração extra no Supabase (usa canais públicos de Realtime, só o link secreto dá acesso).

O overlay acompanha a **câmera do jogo** (zoom, giro e deslocamento) e mostra o **status da vila** (dia, estação, recursos, população) e os **nomes dos aldeões**; no painel você liga ou desliga os nomes e o status. Só dados públicos da live são transmitidos: informação secreta (como os objetivos da Guerra) nunca vai para o overlay.

**Aldeões autônomos e seed (fatia 1 das eras):** viewers que não escolheram profissão com `!trabalhar` decidem sozinhos: vão para o recurso que a vila mais precisa e ajudam em obras. Eles **planejam** com o estoque da vila: comida e água primeiro (fazenda e poço), depois moradia (só se a vila se sustenta), armazém quando o estoque enche, serraria e pedreira quando falta o recurso; no máximo duas obras abertas por vez. A mão de obra vai para o recurso mais urgente (comida e água pesam o dobro) e ninguém junta o que já está no limite do estoque. `!livre` devolve a decisão ao aldeão. A caixa "Aldeões autônomos" do painel liga e desliga tudo. Cada mapa tem uma **seed** (aparece no painel; clique para copiar): em "Nova vila" você digita um número ou texto, ou use `?seed=minha-vila` na URL; a mesma seed gera sempre o mesmo mapa.

**Terreno (streamer e aldeões):** no painel, "Terreno": **⛏ Cavar** baixa o terreno 1 nível (madeira 1), **⛰ Elevar** sobe 1 nível (pedra 1, até o nível 9) e **💧 Nascente** (pedra 8, madeira 4) faz a água brotar num tile, enchendo o que estiver cavado em volta (a nascente fica marcada de azul-claro e só jorra na estação temperada). Arraste para pintar; cada tile muda uma vez por pincelada. Para ligar o rio a um lago, cave um canal até a água chegar; para criar um lago, cave um buraco e ponha uma nascente. Não vale sobre prédios, represa ou ponte, e árvores no tile são derrubadas. Os **aldeões autônomos** também mexem no terreno: cavam um canal da água mais próxima até terra seca perto do acampamento quando falta lugar irrigado para uma fazenda (até 4 canais) e aplainam um terreno quase plano (desnível de 1) quando não há lugar para um prédio. Alturas e nascentes vão no save e no overlay.

**Começo primitivo na floresta (fatia 1):** não há prefeitura no início. A vila nasce de uma **fogueira** (com duas barracas) no meio de uma floresta fechada que vai rareando com a distância (mais cheia no bioma de floresta). Árvores não impedem andar, mas ocupam o terreno: obra ou estrada em cima delas derruba as árvores (a clareira se abre), e quem corta uma árvore até acabar a derruba, deixando o tile livre. A floresta se espalha devagar com mudas. A fogueira vira **prefeitura** na Era Medieval (o modelo muda na hora). 
**Ferramentas (fatia 2):** os aldeões fabricam sozinhos machados e picaretas de pedra (machado: 4 madeira + 2 pedra; picareta: 4 madeira + 3 pedra), um de cada vez, sempre o que está mais atrasado, só se sobrar estoque (reserva de 20 madeira e 6 pedra). Até um por aldeão; cada um rende +60% na coleta de madeira (machado) ou de pedra (picareta), proporcional à cobertura. Entram no save e aparecem no painel (🪓/⛏). Próxima fatia: cabanas simples que evoluem.

**Mapa maior e vila que cresce (fase 1 do estilo Cities: Skylines):** o mapa agora tem 72×52 tiles (antes 48×34), com recursos e lagos proporcionais, e a prefeitura começa perto do rio com espaço para a cidade se espalhar. Os aldeões planejam com antecedência (casa antes de lotar a moradia) e fazem mais obras ao mesmo tempo conforme a população cresce. Próxima fase: estradas e zonas (residencial, comercial, industrial) com lotes que se enchem sozinhos.

**Estradas e zonas (fase 2 do estilo Cities: Skylines):** no painel, "Estradas e zonas": arraste no mapa para pintar uma **estrada** (madeira 2 e pedra 1 por tile; aldeões andam mais rápido nela e as rotas a preferem), uma zona **residencial**, **comercial** ou **industrial** (pincel 3×3), ou **apagar**. Com zona pintada, os aldeões constroem sozinhos só nela, em lotes colados a uma estrada: casas na residencial, **mercados** na comercial (novo prédio: cada mercado pronto reduz em 8% o consumo de comida e água, até 40%) e serrarias, pedreiras e armazéns na industrial. Se a zona fica sem estrada por perto, os próprios aldeões abrem a estrada da prefeitura (ou da rede existente) até ela. Sem zona pintada, os prédios nascem perto da prefeitura (nunca em terra zoneada) e os aldeões abrem estradas sozinhos até cada prédio que ficou sem estrada por perto (só quando sobra madeira; a zona pedida por você tem prioridade). A Era da Cidade passou a pedir um mercado.

**Sem pausa em segundo plano:** a simulação, o autosave e a transmissão do overlay rodam num relógio de Web Worker (`src/ticker.ts`), então o jogo e o overlay continuam com a aba do streamer escondida ou em outra janela. Só o desenho 3D pausa, o que é economia. O batimento da conexão do Supabase Realtime também usa Worker.

**Mapas variados:** a seed agora muda também o rio (posição e curvas), de 1 a 4 lagos de formas e tamanhos diferentes (cada um com a sua nascente; secam na seca e voltam depois) e os **biomas**: floresta (mais árvores, verde mais escuro), terra pedregosa (mais pedras, tom terroso) e campo (mais arbustos). A quantidade de árvores, arbustos e pedras também varia por seed.

**Eras (automáticas):** a vila começa na Era da Pedra e sobe sozinha quando cumpre as metas da próxima (população e prédios prontos): Bronze (8 aldeões, casa, fazenda, poço), Medieval (16 aldeões, 3 casas, 2 fazendas, armazém) e Cidade (30 aldeões, 6 casas, 3 poços, 2 armazéns). Cada subida dispara uma celebração com faixa e confete, no jogo e no overlay do OBS; o painel e o status do overlay mostram as metas que faltam. Metas em `src/sim/eras.ts`. Ainda não há construções bloqueadas por era; Estado, País, Nação e Futuro vêm nas próximas fatias.

**Pontes:** nova construção (madeira, só sobre o rio) que liga as margens sem degrau nem vau: aldeões andam na velocidade normal sobre ela e ela não alaga. Aldeões autônomos constroem uma ponte sozinhos onde vivem atravessando o rio com água até o joelho, ou quando o rio isola recursos úteis (no máximo 6 tiles de rio e uma travessia por trecho).

**Câmera seguindo o viewer:** clique num aldeão na lista (ou perto dele no mapa) e a câmera 3D passa a acompanhá-lo, com zoom e giro livres; arrastar o mapa, Esc ou "📹 Soltar câmera" soltam. No overlay do OBS a câmera segue junto, porque ele copia a do jogo.

**Lista de espera:** com a vila cheia, `!entrar` coloca o viewer numa fila (até 200) e responde a posição; ele entra sozinho, na ordem, quando surge moradia. `!fila` (ou `!sair`) tira da fila; para quem já mora, mostra o tamanho dela. A fila pesa no planejador: os aldeões constroem casas conforme quantos esperam (uma obra de casa em aberto, mais uma para cada 4 na fila). Checkbox "Lista de espera" no painel (desligada, a vila cheia recusa como antes). A fila aparece no painel, no `!vila` e no overlay, e vai no save.

**Gráficos renovados (3D):** árvores em três tipos (pinheiro, carvalho, bétula), arbustos e pedras com mais volume; casas que **evoluem com a era** (cabana de palha → casa de tábuas → enxaimel com telhas → casa de pedra de dois andares com janelas e chaminé; o modelo troca sozinho ao subir de era); prefeitura com colunas, escada e torre de relógio; fogueira com lenha, espeto e barracas; fazenda com cerca, mudas e espantalho; poço com telhado de duas águas e balde; serraria, pedreira, armazém, mercado (balcão, frutas, caixotes), ponte e represa com mais detalhes. **Água** com degradê raso→fundo, margem transparente e brilho de ondas que correm; névoa suave no horizonte.

**Beira d'água:** casas, armazéns, mercados, serrarias e pedreiras exigem um tile de folga da água (lago, rio ou canal). Poço, fazenda, ponte e represa seguem as regras próprias.

**Eras avançadas:** além de Pedra, Bronze, Medieval e Cidade, agora há **Era Industrial** (40 aldeões, 9 casas, serraria, pedreira, 2 mercados), **Era do Estado** (60, 13 casas, 4 armazéns, 3 mercados, 5 poços), **Era da Nação** (90, 20 casas, 8 fazendas, 5 mercados, 6 armazéns) e **Era do Futuro** (130, 30 casas, 8 mercados, 8 armazéns, 8 poços). Cada era traz vantagens que acumulam: coleta de madeira e pedra +5%, +15%, +35%, +50%, +70% e +100%; mais moradores por casa (+1 na Industrial, +2 na Nação, +3 no Futuro); estoque +25%, +50% e +100% (Estado, Nação, Futuro). Visual: casas de tijolo de três andares na Industrial e no Estado, torres de vidro com teto verde e painéis solares na Nação e no Futuro; a prefeitura vira **palácio de governo** (colunata, frontão e cúpula) a partir do Estado. O planejador passa a construir serrarias, pedreiras, mercados e armazéns que a próxima era pede quando a população chega a 70% da meta de aldeões. As metas de população são só dos viewers: num canal pequeno a vila pode demorar nas últimas eras.

**Desempenho:** as árvores são desenhadas em lote (instâncias) e cada prédio vira uma malha só, o que derrubou as chamadas de desenho de uma vila grande de ~1.950 para ~275 por quadro (e o tempo de desenho a cerca de um terço). Botão **⚙ Qualidade** (Alta, Média, Baixa: sombras e resolução); se o quadro ficar lento por alguns segundos seguidos, a qualidade baixa sozinha e avisa no registro. A escolha fica salva no navegador. Pedreira redesenhada (paredão em degraus, blocos cortados, guindaste).

**Overlay mais fluido ao mover e girar:** a câmera do streamer agora vai ao overlay num sinal à parte (`cam`, até ~20 por segundo, só quando ela mexe, mais um por segundo parada), em vez de pegar carona nos quadros leves (~6 por segundo). O overlay segue a câmera com atraso de ~60 ms. O cliente Supabase passou a permitir 40 eventos por segundo. Não testado ao vivo com o Supabase real.

**Minas de pedra:** o mapa tem jazidas (manchas cinzentas de terra pedregosa com pedregulhos, longe da vila e da água; 3 em mapa base, mais em mapa maior). A **pedreira só pode ser construída numa mina** (pelo menos 2 dos 4 tiles dela), e nenhum outro prédio ocupa a jazida. Os aldeões procuram a mina mais próxima (até 45 tiles) e abrem estrada até lá; sem lugar plano para aplainar, pedreira não vira terraplanagem. As jazidas são sorteadas da seed com um sorteio próprio (os mapas continuam iguais) e vão no save; save antigo ganha as da seed ao carregar. Dica do mapa: "⛰ Mina de pedra".

**Energia (roda d'água):** novo prédio **Roda d'água** (madeira 35, pedra 15) que só se constrói na margem (3+ tiles de água encostados). Cada roda gera força conforme a água em volta (**cai na seca**, volta com a chuva) e conforme a era: roda de madeira (10, até a Medieval), roda de ferro (20, Cidade e Industrial), turbina (35, Estado e Nação) e usina (60, Futuro); o modelo muda sozinho com a era e a roda gira. A energia alimenta **serrarias, pedreiras e mercados** (demanda 4, 6 e 3): com energia plena eles rendem **+50%** (coleta de madeira e pedra, alívio do consumo). Se faltar energia, o bônus é proporcional. A vila constrói a roda sozinha quando há máquinas sem energia (uma para começar, mais uma a cada 8 casas); a Era Industrial passa a pedir uma roda. Painel: "⚡ oferta/demanda"; a dica do prédio mostra a força e o bônus.

## Centros urbanos densos
Nas eras avançadas, casas e mercados cercados por muitas construções (6 ou mais vizinhas) evoluem visualmente: casas viram **condomínios** (torres com varandas e passarela) e mercados viram **galerias** (teto de vidro, arcadas) e depois **shoppings** (átrio de vidro, letreiro, estacionamento). É só visual; a simulação não muda.

Os aldeões também focam em subir de era: ao chegar a 70% da meta de população da próxima era, o planejador passa a construir tudo o que falta nas metas (casas, fazendas e poços incluídos), sem pressa e só com a vila estável (comida e água acima de 25%).

## Profissões, líderes e donos
Cada viewer tem uma **profissão**: a função em que mais trabalhou (lenhador, pedreiro, fazendeiro, aguadeiro ou construtor). O **pioneiro** de cada profissão vira o **líder** (👑) até sair ou mudar de profissão. Estabelecimentos prontos ganham dono: fazendas e poços vão para os líderes da área, serrarias e pedreiras também, e mercados, armazéns e rodas d'água para o líder dos construtores. Cada viewer sem casa ganha uma. O nome fica "tipo de viewer" (ex.: "Fazenda de Ana"; o mercado vira "Galeria Ana" na era 4 e "Shopping Ana" na era 6). Aparece ao passar o mouse e nos comandos `!profissao` e `!meus`. Nomes já passam pelo filtro de blocklist; nada novo vai para o overlay além do que a vila salva.

## Drenagem de alagamentos
Se algum prédio fica alagado por duas rodadas de autonomia seguidas, os aldeões cavam um canal da água ao lado dele até terra mais baixa ou o ralo da borda sul, longe de outras construções (o fundo desce 1 nível a cada 6 tiles). Gasta madeira (1 por nível), no máximo 8 canais por vila.

Os estabelecimentos (menos as casas) ganham um **letreiro dourado** com o nome (tipo + dono) no jogo e no overlay do OBS. O dono viaja nos keyframes do overlay e é preservado nos quadros leves.

## Moradores NPC
Quando a população está abaixo da meta da próxima era, há casa livre, ninguém espera na fila e comida e água estão acima de 30%, chega um **NPC** (a cada ~30 s). Nunca há mais NPCs do que viewers (mínimo 6, para a vila crescer mesmo com o chat vazio). NPCs trabalham sozinhos e contam na população, mas não lideram profissões nem têm estabelecimentos. **Viewer tem prioridade**: com a vila cheia, um NPC sai para dar a vaga (também para quem está na fila). Os aldeões agora nascem fora de prédios e de água funda.

## Aldeões que cavam, aterram e demolem
Prédio alagado: após 2 rodadas de autonomia (~20 s) os aldeões cavam um canal de drenagem; após 6 (~1 min) aterram o terreno do prédio (sobe 1 nível, gasta pedra, uma vez por prédio, só se não criar penhasco); após 14 (~2 min) e com o aterro já tentado, demolem o prédio (reembolso de 50%, no máximo 6 por vila) e o planejador reconstrói em terreno melhor.

## Carga sem destino
Aldeão com carga que não acha caminho até um depósito tenta mais 4 vezes e então **desiste**: larga a carga e volta a procurar trabalho. Quem sobra com carga de outra função (trocou de profissão no caminho) vai guardá-la antes de procurar trabalho. Com muita gente sem trabalho e estoque cheio, o planejador constrói mais armazéns (1 extra a cada 10 aldeões parados).

## Sem trabalho, rotas e overlay
- **Estoque cheio:** quem estaria parado larga a carga que não tem onde guardar e ajuda nas obras abertas (até 3 ajudantes por obra); a profissão automática ignora recurso com estoque cheio.
- **Rotas espalhadas:** cada aldeão no tile soma um custo extra de rota (0,5, até 4), então os caminhos se espalham em vez de formar fila indiana.
- **Overlay:** o fundo agora é escuro por padrão; `&transparente=1` no link volta ao fundo transparente.

## Visual novo dos aldeões
Cada aldeão agora tem pernas que andam, torso na cor do viewer, cabeça e cabelo variados (tom de pele e cabelo vêm do ID, estáveis), a **ferramenta da função na mão** (machado, picareta, enxada, balde ou martelo, que balança ao trabalhar) e a carga nas costas. **Líderes de profissão** usam uma coroa dourada; NPCs têm cabelo grisalho. Tudo em instâncias (cerca de 10 chamadas de desenho para centenas de aldeões).

## Amizades e famílias
Aldeões que ficam perto um do outro (mesmo tile ou vizinhos) ganham afinidade a cada 2 s. Com 40 pontos viram **amigos** 🤝 (até 3 amigos cada); amigos com 140 pontos viram **casal** 💞. Casais com casa livre na vila e ninguém na fila têm, a cada minuto, 30% de chance de um **filho NPC** 👶 (até 2 por casal): menor, conta na população, vira adulto em 10 minutos (a x1) e é o último a sair quando um viewer precisa de vaga. Vínculos somem quando o outro sai da vila. Aparece ao passar o mouse (💞, 🤝, 👶) e no comando `!amigos` (também `!amigo` e `!familia`). Eventos de amizade, namoro e nascimento aparecem no log.

Aldeões que dividem o mesmo tile se espalham em espiral (só visual, a simulação não muda), com movimento suave, para ninguém ficar dentro do outro.

## Eventos, conquistas e ranking (M4)
**Eventos locais**: a cada novo dia (a partir do dia 3), com 35% de chance e sem outro ativo, sorteia-se um evento determinístico por seed + dia (não mexe no gerador principal): 🌾 Dia da colheita (+50% de coleta), ⛈ Tempestade (trabalho −20%, +40 água), 🐪 Caravana (suprimentos de graça), 🔥 Incêndio (perde 20% de madeira e comida, a partir de 8 aldeões), 🤒 Praga (trabalho −25% por 2 dias, a partir de 10). Aparecem no log e ao lado da estação; entram no save.

**Conquistas**: 17 marcos (população, eras, prédios, casais, drenagem, XP, etc.) com aviso `🏆 Conquista` no log e contador no painel. Entram no save.

**Ranking na nuvem**: rode `supabase/ranking.sql` uma vez no SQL Editor do Supabase. Com login, a cada salvamento (1 min) a vila sobe com nome, população, era, dia e pontuação (`pop×10 + era×200 + prédios×5 + dia`), junto com os 20 viewers de mais XP (só IDs reais da Twitch). Leitura pública; cada streamer só grava a própria linha. Os valores vêm do navegador, então o ranking é de confiança (sem anti-fraude por enquanto). Nenhuma informação secreta é enviada.
