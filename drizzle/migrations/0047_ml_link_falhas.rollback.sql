-- Rollback da 0047: descarta o registro de falhas (a fila volta a oferecer todos os itens pendentes).
DROP TABLE IF EXISTS ml_link_falhas;
