-- Rollback da 0067: remove a tabela de popularidade (so dados derivados de fontes externas; recriaveis pelo coletor). Nada mais depende dela
-- alem da ordenacao da fila de envio, que ignora a tabela quando GROUP_POPULARIDADE=off ou quando ela nao existe.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS offer_popularity;
