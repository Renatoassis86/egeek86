import 'server-only';

export interface SendWhatsappResult {
  ok: boolean;
  error?: string;
  /** Quando as credenciais não estão configuradas — quem chama decide se cai pro link wa.me manual. */
  notConfigured?: boolean;
}

/**
 * Envio automático via Meta WhatsApp Cloud API — exige WHATSAPP_ACCESS_TOKEN,
 * WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_TEMPLATE_NAME configurados (nenhum
 * existe até você concluir o cadastro no Meta Business: WABA + número
 * verificado + template aprovado — ver docs internas). Mensagem
 * business-initiated (não é resposta dentro de 24h de uma mensagem do
 * cliente) TEM que usar um template pré-aprovado — não dá pra mandar texto
 * livre aqui, só os parâmetros do template.
 *
 * `bodyParams` preenche {{1}}, {{2}}... do template na ordem.
 */
export async function sendWhatsappTemplateMessage(
  to: string,
  bodyParams: string[]
): Promise<SendWhatsappResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  if (!token || !phoneNumberId || !templateName) {
    return { ok: false, notConfigured: true, error: 'WhatsApp Business API não configurada.' };
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    }),
  });

  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    return { ok: false, error: json.error?.message || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export function hasWhatsappCredentials(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME);
}
