-- Rollback da 0053: remove a tabela de beneficios de cartao (so guarda leituras; nenhuma oferta/cupom e tocado). Desligue PRINTER_COUPON_ALERT antes.
DROP TABLE IF EXISTS offer_card_benefits;
