-- Rollback da 0031 (onda 2): remove as 4 colunas aditivas. Nenhuma linha e apagada; so se perde o horario planejado e o
-- resultado da reconferencia ao vivo gravados.
SET LOCAL lock_timeout = '5s';

ALTER TABLE group_messages
  DROP COLUMN IF EXISTS planned_at,
  DROP COLUMN IF EXISTS live_checked_at,
  DROP COLUMN IF EXISTS live_price_cents,
  DROP COLUMN IF EXISTS live_note;

-- Volta os CHECKs ao desenho da 0030. Se ja existirem linhas P1..P5 ou classe 'plataforma', a restauracao fica NOT VALID
-- (nenhuma linha e apagada); remova-as antes se quiser validar.
ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_trigger_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_trigger_chk
  CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'OK1', 'OK2', 'T1', 'T2', 'RADAR', 'CUPOM')) NOT VALID;
ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_class_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_class_chk
  CHECK (msg_class IS NULL OR msg_class IN ('alerta', 'radar', 'insight', 'resumo', 'cupom')) NOT VALID;
