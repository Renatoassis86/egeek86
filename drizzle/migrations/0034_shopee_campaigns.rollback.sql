-- Rollback da 0034. Remove SO shopee_campaigns (tabela nova; nada depende dela). Sem a tabela, loadShopeeCampaignUrl devolve null
-- e a linha "Cupons e ofertas Shopee" some das mensagens. Para guardar o historico: pg_dump -t shopee_campaigns.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS shopee_campaigns;
