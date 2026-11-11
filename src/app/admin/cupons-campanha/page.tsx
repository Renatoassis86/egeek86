import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { requireAdmin } from '@/lib/auth/require-admin';
import { CampaignCouponForm } from '@/components/admin/campaign-coupon-form';
import { relatorioCupons } from '@/server/messaging/agente-cupons';
import { listCampaignCoupons } from '@/server/coupons/campaign-store';
import { describeRule, isCampaignUsable } from '@/server/coupons/campaign';
import { encerrarCupomCampanha, confirmarCupomCampanha } from '@/server/actions/campaign-coupons';

// Dado ao vivo, sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

const NET: Record<string, string> = { 'mercado-livre': 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function CampanhasPage() {
  await requireAdmin();
  const now = new Date();
  const items = await listCampaignCoupons();
  const rel = await relatorioCupons(now).catch(() => null);
  const hojeSP = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) === now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const encerradosHoje = rel?.encerrados.lista.filter((e) => hojeSP(e.endedAt)) ?? [];
  const MOTIVO: Record<string, string> = {
    sumiu_da_pagina: 'sumiu da página', venceu: 'venceu', cancelado_pelo_dono: 'cancelado pelo dono', sem_leitura_recente: 'sem leitura há 6 h', oferta_inativa: 'oferta inativa',
  };
  const numeros: [string, number | string][] = rel
    ? [
        ['Novos (24 h)', rel.novos.total], ['Encerrados (24 h)', rel.encerrados.total], ['Expiram em < 24 h', rel.expirandoEm24h.total],
        ['Divergências', rel.divergencias.total], ['Fontes sem leitura > 2 h', rel.fontesSemLeitura.length],
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Text as="h1" variant="heading-xl">
          Códigos de campanha
        </Text>
        <Text variant="body-sm" color="secondary">
          Códigos que você viu e quer divulgar (ex.: TODOSITE1111). Só entram nas mensagens com validade futura e fonte. A confirmação vale 24 h: depois disso o
          código sai das mensagens até você confirmar de novo.
        </Text>
      </div>

      <div className="flex flex-col gap-2">
        <Text as="h2" variant="heading-md">
          Agente de Cupons
        </Text>
        {!rel && (
          <Text variant="body-sm" color="secondary">
            Relatório indisponível (a migração 0037 ainda não foi aplicada ou o banco não respondeu).
          </Text>
        )}
        {rel && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {numeros.map(([nome, n]) => (
                <Card key={nome}>
                  <CardContent className="p-3">
                    <Text variant="heading-lg">{n}</Text>
                    <Text variant="caption" color="tertiary">
                      {nome}
                    </Text>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Text variant="caption" color="tertiary">
              Gerado em {fmt(rel.geradoEm)}. O guardião confere os cupons divulgados a cada ~5 min e avisa o grupo da loja uma vez, em silêncio, quando um deles acaba.
            </Text>
            {rel.fontesSemLeitura.length > 0 && (
              <Text variant="body-sm" color="secondary">
                Sem leitura há mais de 2 h:{' '}
                {rel.fontesSemLeitura.map((f) => `${f.fonte}${f.idadeMin != null ? ` (${Math.round(f.idadeMin / 60)} h)` : ' (nunca)'}`).join(', ')}.
              </Text>
            )}
            {rel.divergencias.lista.map((d) => (
              <Text key={d.id} variant="body-sm" color="secondary">
                Divergência: {d.label} ({d.detalhe}).
              </Text>
            ))}
            {rel.expirandoEm24h.lista.map((e) => (
              <Text key={e.id} variant="body-sm" color="secondary">
                Expira em breve: {e.label} · {NET[e.network] ?? e.network} · {e.origem} · até {fmt(e.validUntil)}.
              </Text>
            ))}
            <Text as="h3" variant="heading-sm">
              Encerrados hoje
            </Text>
            {encerradosHoje.length === 0 && (
              <Text variant="body-sm" color="secondary">
                Nenhum cupom divulgado encerrou hoje.
              </Text>
            )}
            {encerradosHoje.map((e) => (
              <Card key={e.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <Text variant="body-md">{e.kind === 'anuncio' ? 'Cupom no anúncio' : e.label}</Text>
                    <Text variant="caption" color="tertiary">
                      {NET[e.network] ?? e.network} · {e.vertical} · {MOTIVO[e.reason] ?? e.reason} · {fmt(e.endedAt)}
                    </Text>
                  </div>
                  <Badge variant={e.notifiedAt ? 'primary' : 'outline'} size="sm">
                    {e.notifiedAt ? 'grupo avisado' : 'sem aviso no grupo'}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      <Card className="max-w-3xl">
        <CardContent className="p-4 sm:p-6">
          <CampaignCouponForm />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Text as="h2" variant="heading-md">
          Cadastrados
        </Text>
        {items.length === 0 && (
          <Text variant="body-sm" color="secondary">
            Nenhum código cadastrado ainda (ou as migrações 0029/0035 ainda não foram aplicadas).
          </Text>
        )}
        {items.map((c) => {
          const expired = !!c.validUntil && Date.parse(c.validUntil) <= now.getTime();
          const active = c.state === 'verificado' && !expired;
          const inMessages = isCampaignUsable(c, now);
          const scopeValue = c.scope.categorias?.[0] ?? c.scope.vendedores?.[0] ?? null;
          const kind = c.kind === 'percentual' || c.kind === 'valor_fixo' || c.kind === 'frete' ? c.kind : 'valor_fixo';
          const rule = describeRule(
            {
              kind, valueNum: c.valueNum, valueUnit: c.valueUnit, minOrderCents: c.minOrderCents, maxDiscountCents: c.maxDiscountCents,
              scopeKind: c.scopeKind === 'categoria' ? 'categoria' : c.scopeKind === 'lista_itens' ? 'lista_itens' : 'loja_inteira', scopeValue,
            },
            NET[c.network] ?? c.network
          );
          return (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text variant="body-md" className="font-mono">
                      {c.code}
                    </Text>
                    <Badge variant={active ? 'primary' : 'danger'} size="sm">
                      {active ? 'ativo' : expired ? 'vencido' : 'encerrado'}
                    </Badge>
                    {active && (
                      <Badge variant={inMessages ? 'primary' : 'outline'} size="sm">
                        {inMessages ? 'nas mensagens' : 'fora das mensagens: confirme de novo'}
                      </Badge>
                    )}
                  </div>
                  <Text variant="caption" color="tertiary" className="mt-0.5">
                    {NET[c.network] ?? c.network} · {rule}
                  </Text>
                  <Text variant="caption" color="tertiary">
                    {c.validUntil ? `válido até ${fmt(c.validUntil)}` : 'sem validade'}
                    {c.verifiedAt ? ` · confirmado em ${fmt(c.verifiedAt)}` : ''} ·{' '}
                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      fonte
                    </a>
                  </Text>
                </div>
                {active && (
                  <div className="flex gap-2">
                    <form action={confirmarCupomCampanha}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Confirmar de novo
                      </Button>
                    </form>
                    <form action={encerrarCupomCampanha}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Encerrar
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export const metadata = { title: 'Admin: Códigos de campanha' };
