-- Rollback da 0030 (motor de mensagens v2). Volta group_messages ao desenho da 0028.
-- ANTES: ponha a automacao em 'off' (linha group_messages_auto de feature_flags) e GROUP_MESSAGES_ENABLED desligado.
-- Backup antes (as colunas novas e as 2 tabelas novas sao descartadas): pg_dump -t group_messages -t group_member_counts -t group_offer_watch.
-- Linhas ja gravadas com status/gatilho novos (simulada, retida, proposta_auto, RADAR, OK1...) NAO sao apagadas: os CHECKs antigos
-- voltam como NOT VALID (valem so para linhas novas). Para limpar depois, se quiser:
--   DELETE FROM group_messages WHERE status IN ('proposta_auto','simulada','retida','enviando') OR trigger IN ('OK1','OK2','T1','T2','RADAR','CUPOM');
SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS group_offer_watch;
DROP TABLE IF EXISTS group_member_counts;

DROP INDEX IF EXISTS group_messages_recheck_idx;
DROP INDEX IF EXISTS group_messages_auto_idx;

ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_class_chk;
ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_status_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_status_chk
  CHECK (status IN ('proposta', 'aprovada', 'enviada', 'rejeitada', 'expirada', 'erro')) NOT VALID;
ALTER TABLE group_messages DROP CONSTRAINT IF EXISTS group_messages_trigger_chk;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_trigger_chk
  CHECK (trigger IN ('G1', 'G2', 'G3', 'G4', 'G5', 'G6')) NOT VALID;

ALTER TABLE group_messages
  DROP COLUMN IF EXISTS msg_class,
  DROP COLUMN IF EXISTS is_sound,
  DROP COLUMN IF EXISTS has_card,
  DROP COLUMN IF EXISTS sim_state,
  DROP COLUMN IF EXISTS automation_state,
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS claim_from,
  DROP COLUMN IF EXISTS recheck_due_at,
  DROP COLUMN IF EXISTS recheck_at,
  DROP COLUMN IF EXISTS recheck_price_cents,
  DROP COLUMN IF EXISTS recheck_divergence_pct,
  DROP COLUMN IF EXISTS recheck_note;
