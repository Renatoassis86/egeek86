# Ata curta: revisão de conformidade LGPD e comissão (2026-11-03)

- **Porte:** médio (texto legal em produção; sem mudança de dado).
- **Convocado:** estrategista-mercado (compliance e divulgação). Sem advogado no conselho: a ata não substitui parecer jurídico.

## Pedido do dono
Revisão jurídica do texto de LGPD e de comissão. Entregue como revisão técnica e de redação, para validação final por advogado.

## Parecer (estrategista-mercado)
- **Posição:** apoio com ressalvas.
- **Leitura:** o site não usa analytics nem cookies opcionais (real, verificado no código), então não precisa de banner. Os riscos reais são foto do rosto sem base legal, ausência de controlador e encarregado identificados, retenção e transferência internacional sem texto, ECA Digital, `whatsapp_orders` ligado por padrão no schema e formulário `/contatos` que não envia nada.
- **Riscos:** publicar com marcadores [PREENCHER]; barra da Vercel ativa contradiz o texto de cookies; aviso de comissão insuficiente se o advogado exigir por card.
- **Recomendação:** preencher marcadores, desligar a barra, corrigir os itens técnicos, só então publicar.
- **Dado que falta:** CNPJ e endereço, encarregado, região do Supabase, prazos de retenção, regras dos programas parceiros.
- **Métrica:** zero marcadores; aviso de comissão em todas as páginas com "Ir à loja".

## Divergências
Nenhuma registrada. Ponto aberto: se a foto do rosto continua sendo coletada até haver consentimento destacado (decisão do dono com o advogado).

## Decisão
- Executado: reescrita de `/privacidade` e `/termos`, componente `CommissionNotice` no rodapé, tabela de lojas e carrinho. Sem banner de cookies. Sem commit, sem deploy.
- Decisão do responsável do projeto: **pendente** (publicação depende do preenchimento e da validação jurídica).

## Verificação
`tsc --noEmit` sem erros (ignorando `.next/types`). Regras inegociáveis: sem dado fake, nenhum arquivo de coleta, catálogo, dedup, migrations, `vercel.json` ou queries alterado; nenhuma imagem nova; a palavra "afiliado" não aparece na interface alterada.

Detalhes: `docs/revisao-legal-lgpd-comissao-2026-11-03.md`.
