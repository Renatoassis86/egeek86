-- Rollback da 0054: remove a tabela de frete/prazo (so guarda leituras; nenhuma oferta e tocada). Desligue FRETE_PRAZO_IMPRESSORAS antes.
DROP TABLE IF EXISTS offer_shipping_quotes;
