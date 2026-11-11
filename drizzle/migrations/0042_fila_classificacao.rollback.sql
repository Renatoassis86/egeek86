-- Rollback da 0042: remove somente as duas tabelas da fila de classificacao. Ofertas/masters ja movidos por decisoes NAO voltam sozinhos:
-- antes do rollback, desfazer as decisoes pelo painel (ou usar identity_decisions.from_master_id/prev_status para reverter) e depois rodar este arquivo.
DROP TABLE IF EXISTS identity_review_items;
DROP TABLE IF EXISTS identity_decisions;
