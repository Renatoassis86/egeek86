-- Rollback da 0061: remove as tabelas do cofre (so guardam provas e trilha; nenhuma oferta e tocada). Desligue COFRE_CUPONS antes.
DROP TABLE IF EXISTS coupon_validation_trail;
DROP TABLE IF EXISTS coupon_validations;
