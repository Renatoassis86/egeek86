'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cadastrarCupomCampanha, type CampaignFormState } from '@/server/actions/campaign-coupons';

const selectCls =
  'flex h-11 w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] px-3 text-[15px] border border-[var(--color-border-default)] text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:border-[var(--color-border-focus)]';

const CATEGORIES: Array<[string, string]> = [
  ['games', 'Games'],
  ['tecnologia', 'Tecnologia'],
  ['eletroeletronicos', 'Eletroeletrônicos'],
  ['eletrodomesticos', 'Eletrodomésticos'],
  ['livros', 'Livros'],
  ['esporte', 'Esporte'],
];

/** Formulário do código de campanha (dono). Rede, código, regra, escopo, validade FIM e fonte obrigatórios onde a regra exige. */
export function CampaignCouponForm() {
  const [state, action, pending] = React.useActionState<CampaignFormState, FormData>(cadastrarCupomCampanha, { ok: false, message: '' });
  const [scope, setScope] = React.useState('site');
  const [kind, setKind] = React.useState('percentual');

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Rede" htmlFor="network" required>
          <select id="network" name="network" required defaultValue="mercado-livre" className={selectCls}>
            <option value="mercado-livre">Mercado Livre</option>
            <option value="shopee">Shopee</option>
            <option value="amazon">Amazon</option>
          </select>
        </Field>
        <Field label="Código (como o cliente digita)" htmlFor="code" required hint="Ex.: TODOSITE1111">
          <Input id="code" name="code" required autoComplete="off" spellCheck={false} maxLength={40} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="kind" required>
          <select id="kind" name="kind" required value={kind} onChange={(e) => setKind(e.target.value)} className={selectCls}>
            <option value="percentual">Percentual (%)</option>
            <option value="valor_fixo">Valor fixo (R$)</option>
            <option value="frete">Frete grátis</option>
          </select>
        </Field>
        <Field label={kind === 'percentual' ? 'Valor (%)' : kind === 'valor_fixo' ? 'Valor (R$)' : 'Valor (não se aplica)'} htmlFor="value" required={kind !== 'frete'}>
          <Input id="value" name="value" inputMode="decimal" placeholder={kind === 'percentual' ? '10' : '30'} disabled={kind === 'frete'} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Compra mínima (R$, se houver)" htmlFor="minOrder">
          <Input id="minOrder" name="minOrder" inputMode="decimal" placeholder="100" />
        </Field>
        <Field label="Teto de desconto (R$, se houver)" htmlFor="cap">
          <Input id="cap" name="cap" inputMode="decimal" placeholder="30" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Onde vale" htmlFor="scope" required>
          <select id="scope" name="scope" required value={scope} onChange={(e) => setScope(e.target.value)} className={selectCls}>
            <option value="site">Site todo</option>
            <option value="categoria">Uma categoria</option>
            <option value="loja">Uma loja</option>
          </select>
        </Field>
        {scope === 'categoria' && (
          <Field label="Categoria" htmlFor="category" required>
            <select id="category" name="category" required className={selectCls}>
              {CATEGORIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        )}
        {scope === 'loja' && (
          <Field label="Loja (nome como aparece na oferta)" htmlFor="store" required>
            <Input id="store" name="store" maxLength={120} />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Válido até (data e hora, Brasília)" htmlFor="validUntil" required hint="Obrigatório. Sem validade futura o código não é cadastrado.">
          <Input id="validUntil" name="validUntil" type="datetime-local" required />
        </Field>
        <Field label="Onde você viu (link https)" htmlFor="sourceUrl" required hint="Obrigatório: página, post ou regulamento que mostra o código.">
          <Input id="sourceUrl" name="sourceUrl" type="url" required placeholder="https://" />
        </Field>
      </div>

      <Field label="Observação (opcional)" htmlFor="note">
        <Textarea id="note" name="note" rows={2} maxLength={500} />
      </Field>

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" fullWidth className="sm:w-fit" loading={pending}>
          Cadastrar código
        </Button>
        {state.message && (
          <p role="status" className={state.ok ? 'text-body-sm text-[var(--color-accent-success)]' : 'text-body-sm text-[var(--color-accent-danger)]'}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
