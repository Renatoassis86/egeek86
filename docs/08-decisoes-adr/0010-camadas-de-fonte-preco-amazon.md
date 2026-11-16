# ADR 0010: camadas de fonte para o preco da Amazon (R-82)

Status: aceita pelo dono em 2026-11-16 ("implementar as formas da melhor para a pior, cada uma na sua fase como validacao da outra; uma nao funcionando, cai a outra").

Contexto: a Amazon BR nao da API a conta (ADR 0009); o preco vinha so da aba logada do Chrome, que congela e fica horas sem ler. Erro real: P2S Combo na lista por R$ 8.499,90 com a pagina em R$ 9.499,05.

Decisao: tres camadas, da melhor para a pior: (1) API oficial (Creators API) quando a conta liberar; (2) Keepa; (3) Chrome. Fonte externa so confirma ou veta o par (cheio, Pix) conhecido; nunca escreve preco. Divergencia bloqueia. Detalhes e invariantes: FLUXO_MESTRE R-82.

Consequencias: camada 2 fica dormente sem `KEEPA_API_KEY`; com ela, o Chrome parado deixa de esconder ofertas cujo preco a Keepa confirma. Risco declarado: a licenca da Amazon limita cache de preco a 24 h (mantemos leituras de 3 h) e a Keepa e terceiro (conferir termos). Formato da resposta da Keepa nao foi verificado contra a API real.
