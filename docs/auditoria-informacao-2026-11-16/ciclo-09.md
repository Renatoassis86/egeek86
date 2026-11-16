# Ciclo 09: modelagem (reconstrução a partir dos snapshots) e consistência site x mensagem

- **Oferta-dia x snapshots brutos** (14/11, 28.727 oferta-dias, excluindo cotações isca): a mediana de `price_daily_offer` é igual à mediana bruta em 28.195 (98,2%); 527 diferem (165 em mais de 5%). Causa: com 2 cotações no dia (ex.: 539,00 e 692,06) o sistema usa a mediana INFERIOR (539,00), não a média das duas (615,45). É fórmula, não erro de dado, mas gera viés para baixo em ofertas com preço oscilando (impressoras: 101 de 1.596 com mediana diferente da última cotação). **AUD-24 BAIXA**: documentar "mediana do dia" ou usar a contínua.
- **Site x mensagem no mesmo instante** (mensagens das últimas 6 h, 447 com oferta): preço mudou mais de 2% desde o envio em 2 (0,4%); 1 oferta já inativa; 4 em quarentena de isca porque a marca nasceu depois do envio (AUD-02). Páginas de departamento x banco: 0 divergências (ciclo 07).
- **Estado do dia x conjuntos**: sem novo achado (ver ciclo 02).
- **Contagem de "vendedores"**: em 1.127 masters há vendedor repetido entre ofertas; nas páginas de games testadas o rótulo não infla. Sem achado.

Sem achado novo de severidade média ou alta neste ciclo.
