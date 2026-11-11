// Puro (sem server-only): validação da origem do clique em /go (canal e id da mensagem).
// Decisão do dono: só valores de lista permitida são gravados; texto livre nunca entra em analytics_events.

export const CANAIS_ORIGEM = ['tg', 'wa', 'site'] as const;
export type CanalOrigem = (typeof CANAIS_ORIGEM)[number];
const ID_MENSAGEM = /^[a-z0-9-]{3,40}$/;

/** Devolve só o que casa com a lista permitida; qualquer outro valor é ignorado. */
export function parseOrigemClique(s: string | null | undefined, m: string | null | undefined): { origem?: CanalOrigem; mensagem?: string } {
  const out: { origem?: CanalOrigem; mensagem?: string } = {};
  if (typeof s === 'string' && (CANAIS_ORIGEM as readonly string[]).includes(s)) out.origem = s as CanalOrigem;
  if (typeof m === 'string' && ID_MENSAGEM.test(m)) out.mensagem = m;
  return out;
}
