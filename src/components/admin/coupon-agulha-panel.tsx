import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { AGULHA, ITEM_READ_NETWORKS } from '@/lib/coupons/agulha';
import { COUPON_ADAPTERS } from '@/lib/coupons/network-adapters';
import { MOTIVO_LABEL, idadeLabel, pct, semaforoLeitura, type MotivoSemCupom, type Semaforo } from '@/lib/coupons/agulha-health-model';
import type { SaudeAgulha } from '@/server/coupons/agulha-health';

const NET_LABEL: Record<string, string> = { 'mercado-livre': 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };
const SEM_COR: Record<Semaforo, string> = {
  verde: 'border-l-4 border-l-[var(--color-success,#2e9e5b)]',
  amarelo: 'border-l-4 border-l-[var(--color-warning,#d9a400)]',
  vermelho: 'border-l-4 border-l-[var(--color-danger,#d64545)]',
  cinza: 'border-l-4 border-l-[var(--color-border-default)]',
};
const SEM_TEXTO: Record<Semaforo, string> = { verde: 'leitura em dia', amarelo: 'leitura parcial', vermelho: 'leitura insuficiente', cinza: 'sem alvo' };
const fmtPct = (v: number | null) => (v == null ? 'sem dado' : `${v.toLocaleString('pt-BR')}%`);

/**
 * Cobertura de cupom NA AGULHA por loja (somente leitura). "Na agulha" = cupom lido há no máximo 2 h, que passa nas conferências de
 * condição e de preço; só ele entra em mensagem. Cada número é uma contagem direta do banco.
 */
export function CouponAgulhaPanel({ saude }: { saude: SaudeAgulha | null }) {
  if (!saude) {
    return (
      <Card>
        <CardContent className="p-4">
          <Text as="h2" variant="heading-lg">Cupom na agulha</Text>
          <Text variant="body-sm" color="secondary">Não foi possível calcular a cobertura agora.</Text>
        </CardContent>
      </Card>
    );
  }
  const ml = saude.cobertura.filter((c) => c.network === 'mercado-livre');
  const paginaRedes = ITEM_READ_NETWORKS.filter((n) => n !== 'mercado-livre');
  const semFonte = saude.cobertura.filter((c) => !ITEM_READ_NETWORKS.includes(c.network));
  const alvo = ml.reduce((a, c) => a + c.ofertasAlvo, 0);
  const lidas = ml.reduce((a, c) => a + c.lidas2h, 0);
  const naAgulha = ml.reduce((a, c) => a + c.naAgulha, 0);
  const semPorRede = new Map<string, number>();
  for (const c of semFonte) semPorRede.set(c.network, (semPorRede.get(c.network) ?? 0) + c.ofertasAlvo);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div>
          <Text as="h2" variant="heading-lg">Cupom na agulha, por loja</Text>
          <Text variant="body-sm" color="secondary">
            Só entra em mensagem o cupom lido na loja há no máximo {AGULHA.ITEM_FRESH_MIN} min, com validade futura, condição conferida contra a oferta e preço final coerente.
            Falhou qualquer conferência: a mensagem sai sem cupom (o preço nunca é bloqueado). Meta de releitura das ofertas que importam: {AGULHA.REREAD_TARGET_MIN} min.
          </Text>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Ofertas-alvo (Mercado Livre)" value={String(alvo)} hint="mais barata de cada produto, com link oficial" />
          <Stat label="Lidas nas últimas 2 h" value={fmtPct(pct(lidas, alvo))} hint={`${lidas} de ${alvo}`} />
          <Stat label="Com cupom na agulha agora" value={String(naAgulha)} hint={`${fmtPct(pct(naAgulha, alvo))} do alvo`} />
          <Stat
            label="Guardião de cupons"
            value={saude.guardiao ? `${saude.guardiao.abertos} abertos` : 'indisponível'}
            hint={saude.guardiao ? `${saude.guardiao.encerrados24h} encerrados em 24 h; ${saude.guardiao.avisosPendentes} avisos pendentes` : 'migration 0037 não aplicada'}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Text variant="body-sm" className="font-semibold">Mercado Livre por departamento</Text>
          {ml.length === 0 && <Text variant="body-sm" color="secondary">Nenhuma oferta-alvo.</Text>}
          {ml.map((c) => {
            const sem = semaforoLeitura(c);
            return (
              <div key={c.vertical} className={`border border-[var(--color-border-subtle)] p-2 ${SEM_COR[sem]}`}>
                <Text variant="body-sm" className="font-semibold">
                  {c.vertical} <span className="text-xs font-normal">({SEM_TEXTO[sem]})</span>
                </Text>
                <Text variant="body-sm" color="secondary">
                  Alvo {c.ofertasAlvo} · lidas em 2 h {c.lidas2h} ({fmtPct(pct(c.lidas2h, c.ofertasAlvo))}) · cupom na agulha {c.naAgulha} · cupom visto em 24 h mas velho {c.cupomVelho} · última leitura há {idadeLabel(c.ultimaLeituraMin)}
                </Text>
              </div>
            );
          })}
        </div>

        {paginaRedes.map((rede) => {
          const linhas = saude.cobertura.filter((c) => c.network === rede);
          const a = linhas.reduce((x, c) => x + c.ofertasAlvo, 0);
          const l = linhas.reduce((x, c) => x + c.lidas2h, 0);
          const n = linhas.reduce((x, c) => x + c.naAgulha, 0);
          const ult = linhas.map((c) => c.ultimaLeituraMin).filter((m): m is number => m != null);
          return (
            <div key={rede} className="flex flex-col gap-1">
              <Text variant="body-sm" className="font-semibold">{NET_LABEL[rede] ?? rede} (leitura pela página do item)</Text>
              <Text variant="body-sm" color="secondary">
                Alvo {a} · lidas em 2 h {l} ({fmtPct(pct(l, a))}) · cupom na agulha {n} · última leitura há {idadeLabel(ult.length ? Math.min(...ult) : null)}
                {' '}({COUPON_ADAPTERS[rede as keyof typeof COUPON_ADAPTERS]?.itemRead === 'ativo' ? 'rota ativa; a leitura depende do Chrome do dono' : 'aguarda decisão do dono'}).
              </Text>
              {linhas.map((c) => (
                <Text key={`${rede}-${c.vertical}`} variant="body-sm" color="secondary">
                  {c.vertical}: alvo {c.ofertasAlvo} · lidas {c.lidas2h} · na agulha {c.naAgulha} · cupom visto em 24 h mas velho {c.cupomVelho}
                </Text>
              ))}
            </div>
          );
        })}

        <div className="flex flex-col gap-2">
          <Text variant="body-sm" className="font-semibold">Outras redes</Text>
          {[...semPorRede.entries()].map(([net, n]) => (
            <Text key={net} variant="body-sm" color="secondary">
              {NET_LABEL[net] ?? net}: {n} ofertas ativas, sem leitura de cupom ({COUPON_ADAPTERS[net as keyof typeof COUPON_ADAPTERS]?.status === 'pendente_decisao_do_dono' ? 'aguarda decisão do dono' : 'sem fonte'}). Nenhuma mensagem leva cupom dessas redes.
            </Text>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <Text variant="body-sm" className="font-semibold">Listas de cupons do portal</Text>
          {saude.listas.map((l) => (
            <Text key={l.network} variant="body-sm" color="secondary">
              {NET_LABEL[l.network] ?? l.network}: {l.vivos} vivos, {l.conferidos12h} conferidos nas últimas 12 h, última leitura há {idadeLabel(l.ultimaLeituraMin)}
            </Text>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <Text variant="body-sm" className="font-semibold">Mensagens enviadas em 24 h: com cupom ou por que não</Text>
          {saude.mensagens24h.length === 0 && <Text variant="body-sm" color="secondary">Nenhuma enviada.</Text>}
          {saude.mensagens24h.map((m) => (
            <div key={`${m.network}-${m.vertical}`}>
              <Text variant="body-sm">
                {NET_LABEL[m.network] ?? m.network} / {m.vertical}: {m.enviadas} enviadas
              </Text>
              <Text variant="body-sm" color="secondary">
                {(Object.entries(m.porMotivo) as [MotivoSemCupom, number][]).map(([k, v]) => `${MOTIVO_LABEL[k]}: ${v}`).join(' · ')}
              </Text>
            </div>
          ))}
        </div>

        {saude.motivosRegistrados && saude.motivosRegistrados.length > 0 && (
          <div className="flex flex-col gap-1">
            <Text variant="body-sm" className="font-semibold">Motivos registrados pelo motor (24 h)</Text>
            <Text variant="body-sm" color="secondary">{saude.motivosRegistrados.map((m) => `${m.motivo}: ${m.consultas}`).join(' · ')}</Text>
          </div>
        )}
        {saude.motivosRegistrados == null && (
          <Text variant="body-sm" color="secondary">Motivos por consulta aparecem depois da migration 0041 (apply-cupom-agulha.ts).</Text>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border border-[var(--color-border-subtle)] p-3">
      <Text variant="body-sm" color="secondary">{label}</Text>
      <Text variant="heading-md">{value}</Text>
      <Text variant="body-sm" color="secondary">{hint}</Text>
    </div>
  );
}
