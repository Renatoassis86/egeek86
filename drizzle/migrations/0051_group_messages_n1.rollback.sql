-- Rollback da 0051: volta o CHECK de gatilho ao da 0046. Falha se existirem linhas com trigger = 'N1' (arquive-as antes: pg_dump -t group_messages).
SET LOCAL lock_timeout = '5s';

ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_trigger_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_trigger_chk
  CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'OK1', 'OK2', 'T1', 'T2', 'RADAR', 'CUPOM', 'P1', 'P2', 'P3', 'P4', 'P5', 'AC'));
