-- Rollback da 0056: remove a tabela de auditoria (so guarda leituras; nenhuma oferta e tocada). Desligue AUDITORIA_LINKS antes.
DROP TABLE IF EXISTS offer_link_audit;
