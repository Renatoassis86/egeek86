# Radiografia da plataforma — Espaço Geek 86

> Snapshot de tudo que está construído hoje (não é o roadmap todo, é o que já
> existe de verdade no código). Feito pra alimentar um projeto externo de
> geração de imagem (ChatGPT/DALL-E) com contexto real de estrutura, tom e
> onde cada imagem entra.

## 1. O que é

Espaço Geek 86 é um marketplace de cultura geek. Dentro dele, **Geek Deals**
é o módulo com funcionalidade real hoje: inteligência de preço pra jogos
(hoje só Nintendo Switch via Mercado Livre, ~396 itens catalogados),
histórico de preço, alertas, e agora um dashboard de monitoramento estilo
tela de bolsa. O resto do marketplace (checkout, carrinho, categorias gerais
de colecionáveis) tem schema no banco mas zero UI ainda.

## 2. Identidade visual

**Paleta (tema escuro, padrão):**
| Papel | Hex |
|---|---|
| Fundo canvas | `#0B0908` |
| Fundo superfície | `#161311` |
| Fundo elevado | `#201C18` |
| Fundo inset | mais escuro que canvas |
| Texto primário (creme) | `#F2E9D8` |
| Texto secundário | `#B8AD98` |
| Dourado (accent primário) | `#D4AF37` |
| Laranja queimado (accent "hype") | `#E8721C` |
| Sucesso (verde) | `#10B981` |
| Perigo (vermelho) | `#EF4444` |

**Paleta (tema claro, opt-in):** fundo `#FAF7F0`, dourado escurecido
`#B8901F` (contraste em fundo claro), laranja `#C75F13`.

**Tom**: cinematográfico, editorial, "premium dark" — nada de neon
cyberpunk genérico, nada de aparência de IA óbvia. Glow/bloom de luz sutil,
grain fino, sem texto/logo desenhado pela própria imagem (a logomarca real é
aplicada depois, em CSS/composição).

**Logo**: wordmark "ESPAÇO" (creme) + "GEEK 86" (dourado), fundo
transparente. Slogan atual: **"Informação real. Decisões inteligentes."**
(H1 da home), com "Tudo sobre o mundo gamer e geek" como contexto de escopo.

## 3. Mapa de páginas públicas

| Rota | Status | O que é |
|---|---|---|
| `/` | 🟢 construída | Home — vitrine editorial |
| `/ofertas` | 🟢 construída | Busca completa com filtros |
| `/ofertas/[slug]` | 🟢 construída | Detalhe de uma oferta |
| `/monitoramento` | 🟢 construída (nova) | Dashboard estilo bolsa, watchlist |
| `/monitoramento/comparar/[id]` | 🟢 construída (nova) | Comparação de preço entre vendedores |
| `/monitoramento/altas-e-baixas` | 🟢 construída (nova) | Ranking de maiores altas/baixas |
| `/conta` | 🟢 construída | Dashboard do cliente (jogos acompanhados) |
| `/conta/notificacoes` | 🟢 construída | Preferências de alerta (Telegram/e-mail) |
| `/entrar` | 🟢 construída | Login (magic link) |
| `/noticias` | 🟡 em construção agora | Blog/notícias (próxima etapa) |
| `/universos`, `/categorias`, `/hype-zone`, `/sellers`, `/busca` | ⚪ só link no menu | Rota não existe ainda (404) |

## 4. Admin (uso interno, não é o foco de imagem, mas existe)

`/admin` (dashboard), `/admin/ofertas` (+ novo/editar), `/admin/cupons` (+
novo), `/admin/redes`, `/admin/mensagens`.

## 5. Detalhamento por página (onde entra imagem)

### `/` — Home

1. **Hero** — H1 "Informação real. Decisões inteligentes.", badge de drop ao
   vivo, mosaico visual de **3 imagens** (uma de trás, uma principal com
   prioridade, uma pequena de acento), rotacionadas/sobrepostas estilo
   colagem editorial. **Hoje são placeholders atmosféricos** (gradiente
   dourado/preto gerado por CSS) — candidatas a prompt já entregue.
2. **Carrossel de promoções da semana** — full-bleed, imagem de fundo
   desfocada + foto real do produto em destaque. **Usa foto real** (capa do
   jogo vinda do Mercado Livre), não precisa de imagem gerada.
3. **Destaques de venda** — grade de cards de oferta (foto real de capa de
   jogo). Sem imagem decorativa própria.
4. **Inteligência de preço** — seção só de texto + ícones, sem imagem.
5. **Universos** (Naruto, One Piece, Marvel, Star Wars, Pokémon, Dragon
   Ball) — mosaico de **6 tiles**, hoje placeholder atmosférico.
   **Atenção**: são franquias de terceiros, não gerar arte "no estilo de"
   delas — usar tratamento abstrato por cor (já especificado nos prompts
   entregues) ou foto real de produto quando existir catálogo daquele
   universo.
6. **Hype Zone (teaser)** — card com **1 imagem** de banner (painel lateral
   do card), hoje placeholder atmosférico.
7. **Benefícios** — lista numerada, só ícone, sem imagem.
8. **Newsletter CTA** — só texto/form, sem imagem.

### `/ofertas` — Vitrine completa

Hero com stat blocks (números), toolbar de filtro, seção "Melhores ofertas
agora" (cards grandes) + grade padrão. Todas as imagens são **foto real de
capa de jogo**. Sem imagem decorativa própria na página.

### `/ofertas/[slug]` — Detalhe de oferta

Painel de imagem grande (foto real do produto, nunca cortada — `fit=contain`
específico pra isso), painel de histórico de preço, selo de menor preço,
reputação de vendedor. Sem imagem decorativa, só foto real de produto.

### `/monitoramento` — Dashboard de preço (novo)

Card do gráfico principal (preço + gráfico de linha estilo TradingView) +
painel lateral "watchlist". **Hoje 100% dado/gráfico, zero imagem** — é uma
tela de dado, não editorial. Estado vazio (deslogado / sem watchlist) é só
texto + botão, **candidato a ganhar uma imagem atmosférica de fundo** (ex:
um "cockpit de dados" abstrato, gráficos flutuantes estilizados).

### `/monitoramento/comparar/[id]` — Comparação de preço (novo)

Card do "menor preço" em destaque (foto real do produto) + lista de outras
ofertas (sem imagem própria, só badge de rede/vendedor). Foto real, sem
necessidade de imagem gerada.

### `/monitoramento/altas-e-baixas` — Altas e baixas (novo)

Tabela de ranking, sem imagem própria além do ícone de tendência.

### `/conta` — Painel do cliente

Cards de jogos acompanhados (foto real). Estado vazio (nenhum jogo
acompanhado) é só texto + ícone — candidato a uma pequena imagem
atmosférica, mas baixa prioridade.

### `/entrar` — Login

Só formulário, sem imagem hoje. Poderia ganhar uma imagem lateral tipo
"split screen" (metade form, metade visual) se quiser um tratamento mais
premium — não construído assim hoje (formulário centralizado simples).

### `/noticias` (em construção)

Vai ter: capa de artigo (`coverImageUrl`, imagem por artigo — cada matéria
publicada vai precisar de uma imagem própria, gerada ou foto real conforme
o tema da matéria) e um badge diferenciando "Artigo" (conteúdo próprio) de
"Também na mídia" (destaque de outro portal, com link de saída). Como o
conteúdo é dinâmico (artigo por artigo), **não dá pra gerar prompts fixos
aqui** — cada matéria vai precisar do seu próprio prompt na hora de
publicar, seguindo a mesma paleta/tom.

## 6. Padrão técnico de imagem (`SceneImage`)

Componente único usado em todo canto que precisa de imagem
(`src/components/motion/scene-image.tsx`): recebe `src` (foto real, quando
existe) e cai num fallback atmosférico bonito (gradiente por "tom" + grain +
selo "em produção") quando não existe ainda. Três tons disponíveis:
`gold` (dourado quente), `ember` (laranja/vermelho), `ink` (neutro escuro).
Duas variações de enquadramento: `cover` (preenche e corta, uso decorativo)
e `contain` (nunca corta, obrigatório pra foto de produto real).

## 7. Inventário consolidado de prompts de imagem

**Já entregue** (ver `docs/image-generation-prompts.json`, com tamanho exato
em pixels por slot): os 3 tiles do mosaico da Hero, o banner da Hype Zone,
os 6 tiles de Universos (tratamento abstrato), e 5 mascotes originais de uso
livre (não vinculados a uma franquia específica).

**Candidatos novos, ainda sem prompt** (baixa prioridade, telas de dado, não
bloqueiam nada):
- Imagem de fundo atmosférica pro estado vazio de `/monitoramento`
  (deslogado ou sem watchlist) — algo como painel de dados/gráficos
  flutuantes em dourado sobre fundo escuro.
- Possível imagem lateral pra `/entrar` (split screen), se quiser sair do
  formulário centralizado simples de hoje.
- Capas de artigo de `/noticias` — geradas uma a uma, por matéria, na hora
  de publicar (não dá pra prever o tema com antecedência).
