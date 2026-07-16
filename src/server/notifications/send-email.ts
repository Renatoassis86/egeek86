import 'server-only';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  id?: string;
  error?: string;
}

/**
 * fetch puro na API da Resend — não precisa instalar o pacote `resend`, a
 * chamada é uma única POST simples. Antes de verificar o domínio de envio
 * (resend.com/domains), a conta só consegue mandar pro próprio e-mail
 * cadastrado (modo sandbox).
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { error: 'RESEND_API_KEY ou RESEND_FROM_EMAIL não configurados' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const json = (await res.json()) as { id?: string; message?: string };
  return res.ok ? { id: json.id } : { error: json.message ?? 'falha ao enviar' };
}
