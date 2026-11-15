# Backup do módulo de leilão e venda de usados (2026-11-11)

Decisão do dono (2026-11-11): leilão e venda de usados (Hype Zone, Leilões Geek, Drops, vendedor/colecionador,
"Meus leilões", "Meus drops") ficam só para o dono por enquanto. O público vê preços, pesquisa, insights e notícias.
A chave única é `MARKETPLACE_PUBLIC` em `src/lib/features.ts` (hoje `false`).

## Conteúdo
- `codigo/`: cópia dos arquivos, com a estrutura original de pastas (lista em `LISTA_ARQUIVOS.txt`). É a versão ANTES de qualquer edição do fechamento.
- `dados/`: exportação NDJSON (uma linha JSON por registro) das tabelas, gerada por `scripts/backup-leilao-usados.ts` (somente leitura). `_resumo.json` traz a contagem.
  - Contagens no momento do backup: sellers 1, seller_metrics 1, perfis com papel de colecionador 5 (arquivo `profiles_colecionadores.ndjson`, contém dados pessoais: não publicar); todas as demais tabelas 0 linhas.

## Inventário
Rotas (src/app/(shop)):
- `/leiloes` (reexporta `/hype-zone/leiloes`)
- `/hype-zone`, `/hype-zone/leiloes`, `/hype-zone/curadoria`, `loading.tsx`
- `/conta/vendedor`, `/conta/vendedor/onboarding`, `/conta/vendedor/novo-drop`
- Admin (não fechado, só admin): `src/app/admin/colecionadores`

Componentes:
- `src/components/hype/hype-zone-tabs.tsx`
- `src/components/geek-deals/`: exclusivos do módulo: collector-card, create-auction-form, create-drop-form, curation-panel, hype-countdown, hype-media-carousel, hype-stock-bar, live-bid-room, onboarding-form, points-rewards-card, antibot-shield, platform-showcase (sem uso). COMPARTILHADOS com o site público (não mexer): price-range-bar, sales-highlights, weekly-promos-*, watch-toggle-button, notification-preference-toggle, telegram-link-button, whatsapp-cart-consent-toggle.

Server actions: `src/server/actions/auction.ts`, `hype.ts`, `curation.ts`; em `collector.ts` apenas `saveCollectorOnboarding` e `createCollectorDrop` (as demais `trigger*` são do admin e do coletor de preços). Consulta: `src/server/queries/hype.ts`.

Tabelas (src/db/schema): `auctions`, `auction_bids` (auctions.ts); `drops`, `drop_waitlist`, `drop_purchases`, `drop_access_log` (hype.ts);
`drop_curations`, `review_curations` (curations.ts); `sellers` (sellers.ts), `seller_kyc_documents`, `seller_metrics`, `seller_payouts`;
pontos/gamificação da curadoria: `points_ledger`, `point_rules`, `levels`, `badges`, `user_badges`, `missions`, `user_missions` (loyalty.ts) e `profiles.geek_points`.
Nenhuma tabela foi alterada ou removida: o fechamento é só em código.

## O que o fechamento alterou (para reverter)
Novos: `src/lib/features.ts`, `src/lib/auth/marketplace-gate.ts` (isAdminViewer, assertMarketplaceVisible, marketplaceActionAllowed).
Editados: as 7 páginas das rotas acima (1 linha `await assertMarketplaceVisible()`), as 4 actions (guarda no início de cada mutação),
app-header, mobile-nav-drawer, bottom-tab-bar, site-footer, header-search-modal, profile-hub-tabs, conta/page, categories-showcase, home (grade do cluster GEEK),
sobre (ferramenta 7 removida), termos (seções 1 a 3 e 5), contatos, layout.tsx (descrição), robots.ts, tsconfig.json (exclui docs/backups).

## Como restaurar
1. Reabrir ao público: `MARKETPLACE_PUBLIC = true` em `src/lib/features.ts` (rotas, actions e menus voltam). ATENÇÃO: os textos de sobre, termos, contatos e layout.tsx foram editados ANTES de serem copiados para o backup; as versões originais não estão aqui (recuperar de backup externo/controle de versão do dono). Ao reabrir, reescrever a ferramenta 7 de /sobre, as seções 2 e 3 de /termos e o card de credenciamento de /contatos (este último só está oculto pela chave, o código segue no arquivo).
2. Restaurar arquivo apagado/alterado do módulo: copiar de `codigo/<caminho>` para a raiz do projeto, mesmo caminho.
3. Restaurar dados (se tabelas forem esvaziadas): ler cada `dados/<tabela>.ndjson` e inserir linha a linha (`insert into <tabela> select * from json_populate_record(null::<tabela>, '<linha>')`), respeitando a ordem de chaves (profiles, sellers, auctions, auction_bids, drops, demais).
