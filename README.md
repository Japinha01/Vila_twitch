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
| M4 | Modo Endless completo com eventos e ranking. |
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
- Câmera: arraste para mover, roda do mouse dá zoom, duplo clique recentraliza. Velocidade: pausa, x1, x2, x4 (atalhos: espaço, 1, 2, 3).

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

**Overlay para o OBS (M3):** precisa da nuvem configurada (variáveis do Supabase; o login não é necessário). No painel, em "Overlay para o OBS", clique em Ativar overlay e copie o link. No OBS: Fontes > + > Navegador, cole o link, largura 1920 e altura 1080 (o fundo é transparente). Mantenha a aba do jogo aberta durante a live: é ela que roda a vila e transmite para o overlay, só enquanto houver um overlay aberto. O link é secreto (192 bits aleatórios); "Gerar novo link" invalida o antigo. Opções no link: `&fundo=1` (fundo sólido) e `&2d` (visual 2D). O jogo não precisa de nenhuma configuração extra no Supabase (usa canais públicos de Realtime, só o link secreto dá acesso).

O overlay acompanha a **câmera do jogo** (zoom, giro e deslocamento) e mostra o **status da vila** (dia, estação, recursos, população) e os **nomes dos aldeões**; no painel você liga ou desliga os nomes e o status. Só dados públicos da live são transmitidos: informação secreta (como os objetivos da Guerra) nunca vai para o overlay.

**Aldeões autônomos e seed (fatia 1 das eras):** viewers que não escolheram profissão com `!trabalhar` decidem sozinhos: vão para o recurso que a vila mais precisa e ajudam em obras. Quando faltam moradias, constroem uma casa perto da prefeitura, gastando o estoque da vila (uma de cada vez, em terra que não é irrigada). `!livre` devolve a decisão ao aldeão. A caixa "Aldeões autônomos" do painel liga e desliga tudo. Cada mapa tem uma **seed** (aparece no painel; clique para copiar): em "Nova vila" você digita um número ou texto, ou use `?seed=minha-vila` na URL; a mesma seed gera sempre o mesmo mapa.

**Pontes:** nova construção (madeira, só sobre o rio) que liga as margens sem degrau nem vau: aldeões andam na velocidade normal sobre ela e ela não alaga. Aldeões autônomos constroem uma ponte sozinhos onde vivem atravessando o rio com água até o joelho, ou quando o rio isola recursos úteis (no máximo 6 tiles de rio e uma travessia por trecho).
