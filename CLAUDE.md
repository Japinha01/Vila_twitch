# Instruções do projeto: Vila do Chat

Use este arquivo como instruções do Projeto no Claude e como `CLAUDE.md` na raiz do repositório. O design completo está no `README.md`.

## Contexto
Jogo web integrado à Twitch: cada viewer que usa `!entrar` vira aldeão de uma vila estilo Timberborn. O chat constrói a vila, o streamer dirige e acelera o tempo. Modos: Endless, Guerra entre canais (código de sala) e Cooperativo.

## Como trabalhar comigo
- Responda em português do Brasil, de forma direta.
- Entregue **arquivos completos e prontos para usar**, nunca trechos soltos para eu montar.
- Explique em poucas linhas como rodar e como publicar (GitHub + Vercel).
- Faça uma etapa por vez, seguindo o roadmap do README (M0 → M6). Não pule marcos.
- Antes de uma mudança grande de arquitetura, me pergunte.
- Se algo no README estiver desatualizado depois de uma decisão, sugira o ajuste no próprio README.

## Stack
- Vite + TypeScript + Canvas (ou PixiJS)
- `tmi.js` em modo anônimo para ler o chat
- Supabase (Auth Twitch, Postgres, Realtime)
- Deploy: GitHub + Vercel (sem WebSocket na Vercel; tempo real só via Supabase/PartyKit)

## Regras do código
- Separar a **simulação** (lógica pura, sem DOM) da **renderização** (canvas) e do **chat** (adaptador). Assim dá para testar com chat simulado.
- A simulação da guerra precisa ser **determinística** (mesma seed, mesmo resultado).
- Todo comando do chat passa por: validação → cooldown → fila com limite → efeito.
- Nunca colocar tokens ou segredos no código do cliente; usar variáveis de ambiente.
- Informação secreta (objetivos da Guerra de Objetivos) fica só no servidor e nunca é enviada ao overlay nem ao cliente de outros jogadores.
- Guerra de Objetivos usa modelo híbrido: vilas locais simuladas no navegador de cada streamer + mapa-mundo compartilhado na sala autoritativa. Só dados leves (territórios, exércitos, alianças) trafegam; cada cliente recebe apenas o que a névoa de guerra permite.
- Cosmético nunca dá vantagem de jogo. O visual do viewer é global, ligado ao ID da Twitch.
- Nomes de aldeões passam por filtro de blocklist.
- Código comentado só onde a lógica não for óbvia.

## Primeira tarefa sugerida (M0)
Criar a vila em canvas com aldeões que coletam recursos e constroem prédios, controlada por um painel de **chat simulado** (botões e campo de texto que fingem `!entrar`, `!trabalhar`, `!construir`). Incluir controle de velocidade (pausa, x1, x2, x4).

## Fora do escopo por enquanto
Eventos resgatáveis, conta e cosméticos, Guerra entre canais, Guerra de Objetivos, temporadas e comércio. Só entram depois do Endless estar divertido.
