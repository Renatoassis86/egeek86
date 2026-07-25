# Plano de Métricas e Regras de Negócio (Espaço Geek 86)

Este documento define e consolida as regras de negócio referentes à precificação, ciclo de vida das ofertas, histórico de dados e infraestrutura de banco de dados do projeto.

---

## 1. Integridade de Dados Históricos (Machine Learning)

*   **Regra de Ouro**: **NUNCA deletar registros físicos de ofertas** (`affiliate_offers`) ou de histórico de preços (`affiliate_price_snapshots`) do banco de dados.
*   **Motivo**: Esses registros são fundamentais para o treinamento de modelos de aprendizado de máquina (Machine Learning), análise de sazonalidade e geração de painéis estatísticos retroativos.
*   **Comportamento**: Em vez de exclusão, os registros fora de estoque ou pausados na origem têm seu status alterado para `'expired'`.

---

## 2. Visibilidade de Ofertas (Público vs. Histórico)

*   **Regra de Ouro**: O menor preço exibido nos destaques da Homepage, nas buscas, no ranking e no painel de monitoramento público deve sempre pertencer a uma **oferta ativa e disponível para compra imediata**.
*   **Comportamento do Coletor**:
    1.  O coletor automático compara os vendedores na API do Mercado Livre.
    2.  Qualquer vendedor que saia do ar ou esgote o estoque tem sua oferta alterada para `'expired'`.
    3.  As consultas do portal público filtram estritamente por `status = 'active'` e `current_price_cents > 0`.
    4.  Caso a oferta mais barata expire, o sistema promove automaticamente a próxima menor oferta ativa (ex: de R$ 189,99 para R$ 349,00), impedindo que o cliente encontre anúncios inválidos ou falsos.

---

## 3. Automação de Links de Afiliado (Mercado Livre)

*   **Comportamento Automatizado**:
    *   O coletor busca o `item_id` específico do anúncio do vendedor que deu o menor preço (evitando a página genérica de catálogo público).
    *   Se a variável de ambiente `MELI_TOOL_ID` estiver configurada no servidor, o sistema monta a URL de destino com o código de afiliado incorporado (`?matt_tool_id=...`) e define `affiliateLinkPending: false`, ativando o botão de compra instantaneamente sem depender de aprovação manual.

---

## 4. Prevenção de 504 Gateway Timeout (Limites de Conexão Postgres)

*   **O Problema**: O erro `504: GATEWAY_TIMEOUT` (Function Invocation Timeout) em produção ocorre quando as instâncias serverless da Vercel esgotam as conexões diretas permitidas no banco de dados Supabase (limite máximo de 15 conexões na modalidade gratuita). Como cada contêiner abre até 10 conexões (conforme `max: 10` em `db/index.ts`), 2 contêineres simultâneos geram rejeição e travam as páginas até estourar o limite de tempo.
*   **A Solução**:
    *   A variável `DATABASE_URL` nas configurações da Vercel **DEVE** utilizar a porta do **Transaction Pooler (6543)** em vez da porta direta (5432).
    *   A configuração de pooling de transações permite que centenas de requisições compartilhem conexões simultâneas de forma segura, garantindo tempos de resposta abaixo de 1 segundo.
