'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { validateCampaignInput } from '@/server/coupons/campaign';
import { saveCampaignCoupon, endCampaignCoupon, reconfirmCampaignCoupon, isMissingManualKind } from '@/server/coupons/campaign-store';
import { isMissingCouponTable } from '@/server/coupons/store';

/**
 * Codigos de campanha do dono (/admin/cupons-campanha). Server Actions sao endpoints publicos: TODAS chamam requireAdmin
 * antes de qualquer leitura de formulario. Validacao em src/server/coupons/campaign.ts (validade FIM futura e fonte https
 * obrigatorias; sem isso o cadastro e recusado).
 */

export interface CampaignFormState {
  ok: boolean;
  message: string;
}

const REASONS: Record<string, string> = {
  codigo_invalido: 'Código inválido: use de 3 a 40 letras, números, hífen ou sublinhado, sem espaços.',
  validade_fim_obrigatoria_ou_invalida: 'Informe a data e hora FINAL da validade.',
  validade_ja_vencida: 'A validade informada já passou. Cupom vencido não é cadastrado.',
  fonte_url_obrigatoria: 'Informe a URL onde você viu o código (obrigatório).',
  fonte_url_deve_ser_https: 'A fonte precisa ser um link https completo.',
  valor_invalido: 'Valor inválido.',
  valor_obrigatorio: 'Informe o valor (percentual ou em reais). Só frete grátis dispensa valor.',
  percentual_acima_de_100: 'Percentual acima de 100.',
  compra_minima_invalida: 'Compra mínima inválida (use o formato 100 ou 100,00).',
  teto_invalido: 'Teto inválido (use o formato 30 ou 30,00).',
  escopo_sem_valor: 'Escolha a categoria ou informe o nome da loja.',
  categoria_desconhecida: 'Categoria desconhecida.',
};

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

export async function cadastrarCupomCampanha(_prev: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  await requireAdmin();
  const scope = str(formData, 'scope');
  const r = validateCampaignInput({
    network: str(formData, 'network'),
    code: str(formData, 'code'),
    kind: str(formData, 'kind'),
    value: str(formData, 'value'),
    minOrder: str(formData, 'minOrder'),
    cap: str(formData, 'cap'),
    scope,
    scopeValue: scope === 'categoria' ? str(formData, 'category') : str(formData, 'store'),
    validUntil: str(formData, 'validUntil'),
    sourceUrl: str(formData, 'sourceUrl'),
    note: str(formData, 'note'),
  });
  if (!r.ok) return { ok: false, message: REASONS[r.reason] ?? `Dados inválidos (${r.reason}).` };
  try {
    const saved = await saveCampaignCoupon(r.campaign);
    revalidatePath('/admin/cupons-campanha');
    return { ok: true, message: saved.created ? `Código ${r.campaign.code} cadastrado e verificado.` : `Código ${r.campaign.code} já existia: confirmado de novo com a nova validade.` };
  } catch (e) {
    if (isMissingCouponTable(e)) return { ok: false, message: 'Tabelas de cupons ausentes: falta aplicar a migração 0029.' };
    if (isMissingManualKind(e)) return { ok: false, message: 'Falta aplicar a migração 0035 (aceitar cadastro do dono).' };
    console.error('[cupons-campanha] falha ao cadastrar', e);
    return { ok: false, message: 'Não foi possível gravar agora. Nada foi salvo.' };
  }
}

export async function encerrarCupomCampanha(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, 'id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await endCampaignCoupon(id);
  revalidatePath('/admin/cupons-campanha');
}

export async function confirmarCupomCampanha(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, 'id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await reconfirmCampaignCoupon(id);
  revalidatePath('/admin/cupons-campanha');
}
