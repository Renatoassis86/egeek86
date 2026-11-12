'use client';

import * as React from 'react';
import Link from 'next/link';
import { avaliarJobs, avaliarNos, montarAlertas, type Alerta, type JobAvaliado, type NoAvaliado } from '@/lib/fluxo/avaliar';
import { fmtMin, type FluxoSnapshot, type NoId, type Saude } from '@/lib/fluxo/modelo';

/**
 * /admin/fluxo, parte viva (client): recebe o snapshot do servidor e o renova a cada 45 s em GET /api/admin/fluxo
 * (admin-protegido; cache de 15 s no servidor; pausa com a aba oculta). Nenhum dado e inventado: bloco sem fonte mostra
 * "sem dado" ou "indisponivel". Cantos retos (padrao visual).
 */
const INTERVALO_MS = 45_000;

const COR: Record<Saude, string> = {
  ok: 'var(--color-accent-success)',
  atencao: 'var(--color-accent-primary)',
  critico: 'var(--color-accent-danger)',
  sem_dado: 'var(--color-text-tertiary)',
};
const ROTULO: Record<Saude, string> = { ok: 'Em dia', atencao: 'Atrasado', critico: 'Crítico', sem_dado: 'Sem dado' };

const NOS: Record<NoId, { rotulo: string; sub: string; x: number; y: number }> = {
  'extracao-ml': { rotulo: 'Extração ML', sub: 'API oficial', x: 10, y: 14 },
  'extracao-shopee': { rotulo: 'Extração Shopee', sub: 'API oficial', x: 10, y: 80 },
  'extracao-amazon': { rotulo: 'Amazon assistida', sub: 'aba logada', x: 10, y: 146 },
  'extracao-plus': { rotulo: 'Plus por vertical', sub: '6 lojas', x: 10, y: 212 },
  cupons: { rotulo: 'Cupons', sub: 'loop 24 h', x: 10, y: 278 },
  banco: { rotulo: 'Banco', sub: 'Postgres', x: 235, y: 146 },
  catalogo: { rotulo: 'Catálogo', sub: 'identidade e fila', x: 435, y: 146 },
  preco: { rotulo: 'Preço e médias', sub: 'oferta-dia', x: 635, y: 146 },
  mensagens: { rotulo: 'Mensagens', sub: 'Telegram', x: 835, y: 80 },
  front: { rotulo: 'Front', sub: 'vitrine do site', x: 835, y: 212 },
};
const W = 155;
const H = 52;
const ARESTAS: [NoId, NoId][] = [
  ['extracao-ml', 'banco'], ['extracao-shopee', 'banco'], ['extracao-amazon', 'banco'], ['extracao-plus', 'banco'], ['cupons', 'banco'],
  ['banco', 'catalogo'], ['catalogo', 'preco'], ['preco', 'mensagens'], ['preco', 'front'],
];

const wrap = 'overflow-x-auto border border-[var(--color-border-subtle)]';
const headRow = 'border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]';
const bodyRow = 'border-b border-[var(--color-border-subtle)] last:border-b-0';
const th = 'px-3 py-3 text-caption font-medium text-[var(--color-text-tertiary)] whitespace-nowrap text-left';
const td = 'px-3 py-2.5 align-top text-[13px] text-[var(--color-text-secondary)]';
const nfmt = (n: number) => n.toLocaleString('pt-BR');
const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'sem dado';

function Selo({ s }: { s: Saude }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium" style={{ color: COR[s] }}>
      <span aria-hidden className="inline-block size-2" style={{ background: COR[s] }} />
      {ROTULO[s]}
    </span>
  );
}

function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3 mt-10 first:mt-0">
      <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">{children}</h2>
      {sub ? <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{sub}</p> : null}
    </div>
  );
}

function Mapa({ nos }: { nos: NoAvaliado[] }) {
  const por = new Map(nos.map((n) => [n.id, n]));
  return (
    <div className={wrap + ' bg-[var(--color-bg-inset)]'}>
      <svg viewBox="0 0 1000 345" className="block min-w-[760px] w-full" role="img" aria-label="Mapa do fluxo: extração, banco, catálogo, preço, mensagens e front, cada nó colorido pela saúde">
        <defs>
          <marker id="seta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--color-border-strong)" />
          </marker>
        </defs>
        {ARESTAS.map(([a, b]) => {
          const A = NOS[a]; const B = NOS[b];
          const x1 = A.x + W; const y1 = A.y + H / 2; const x2 = B.x; const y2 = B.y + H / 2;
          const mx = (x1 + x2) / 2;
          return <path key={a + b} d={`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 2} ${y2}`} fill="none" stroke="var(--color-border-strong)" strokeWidth="1.5" markerEnd="url(#seta)" />;
        })}
        {(Object.keys(NOS) as NoId[]).map((id) => {
          const n = NOS[id]; const e = por.get(id); const s: Saude = e?.saude ?? 'sem_dado';
          return (
            <g key={id}>
              <title>{`${n.rotulo}: ${ROTULO[s]}. ${e?.detalhe ?? 'sem fonte'}`}</title>
              <rect x={n.x} y={n.y} width={W} height={H} fill="var(--color-bg-surface)" stroke={COR[s]} strokeWidth="1.5" />
              <rect x={n.x} y={n.y} width="6" height={H} fill={COR[s]} />
              <text x={n.x + 16} y={n.y + 22} fontSize="13" fontWeight="600" fill="var(--color-text-primary)">{n.rotulo}</text>
              <text x={n.x + 16} y={n.y + 40} fontSize="11" fill={COR[s]}>{ROTULO[s]} <tspan fill="var(--color-text-tertiary)">{`· ${n.sub}`}</tspan></text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Tile({ label, value, sub, saude }: { label: string; value: string; sub?: string; saude?: Saude }) {
  return (
    <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4" style={saude ? { borderLeft: `3px solid ${COR[saude]}` } : undefined}>
      <div className="text-caption text-[var(--color-text-tertiary)]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</div>
      {sub ? <div className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">{sub}</div> : null}
    </div>
  );
}

const indisp = <span className="text-[var(--color-text-tertiary)]">indisponível agora</span>;

function Filas({ s, agora }: { s: FluxoSnapshot; agora: number }) {
  const ofe = s.ofertas.dados; const cls = s.classificacao.dados; const msg = s.mensagens.dados; const tx = s.idleTx.dados;
  const idade = (iso: string | null) => (iso ? fmtMin((agora - new Date(iso).getTime()) / 60000) : 'sem dado');
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Classificação pendente" value={cls ? nfmt(cls.pendentes) : '—'} sub={cls ? `${nfmt(cls.adiadas)} adiadas; mais antiga há ${idade(cls.maisAntigaEm)}` : 'indisponível agora'} />
        <Tile label="Links ML pendentes (ativas)" value={ofe ? nfmt(ofe.mlLinksPendentes) : '—'} sub={ofe ? `de ${nfmt(ofe.mlAtivas)} ofertas ML ativas` : 'indisponível agora'} />
        <Tile label="Ofertas em rascunho" value={ofe ? nfmt(ofe.rascunhos) : '—'} sub={ofe ? 'todas as redes' : 'indisponível agora'} />
        <Tile label="Amazon com preço fresco (< 40 min)" value={ofe ? nfmt(ofe.amazonFrescas40) : '—'} sub={ofe ? `de ${nfmt(ofe.amazonAtivas)} ativas; última confirmação ${idade(ofe.amazonUltimaConfirmacaoEm)} atrás` : 'indisponível agora'} saude={ofe && ofe.amazonAtivas > 0 ? (ofe.amazonFrescas40 > 0 ? 'ok' : 'atencao') : undefined} />
        <Tile label="Transações presas" value={tx ? nfmt(tx.n) : '—'} sub={tx ? (tx.n ? `a mais longa há ${fmtMin((tx.maisLongaS ?? 0) / 60)}` : 'nenhuma em "idle in transaction"') : 'indisponível agora'} saude={tx ? (tx.maisLongaS != null && tx.maisLongaS > 120 ? 'atencao' : 'ok') : undefined} />
      </div>
      <div className={wrap + ' mt-4'}>
        <table className="w-full min-w-[480px] border-collapse">
          <thead><tr className={headRow}><th className={th}>Mensagens do grupo (24 h)</th><th className={th + ' text-right'}>Quantidade</th><th className={th}>Mais antiga criada há</th></tr></thead>
          <tbody>
            {!s.mensagens.ok || !msg ? (
              <tr><td className={td} colSpan={3}>{indisp}</td></tr>
            ) : msg.porStatus.length === 0 ? (
              <tr><td className={td} colSpan={3}>Nenhuma mensagem criada nas últimas 24 h.</td></tr>
            ) : (
              msg.porStatus.map((p) => (
                <tr key={p.status} className={bodyRow}>
                  <td className={td}>{p.status}</td>
                  <td className={td + ' text-right tabular-nums'}>{nfmt(p.n)}</td>
                  <td className={td}>{idade(p.maisAntigoEm)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Jobs({ jobs, s, agora }: { jobs: JobAvaliado[]; s: FluxoSnapshot; agora: number }) {
  const sn = s.snapshots.dados;
  return (
    <>
      <div className={wrap}>
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className={headRow}>
              <th className={th}>Job</th><th className={th}>Rede</th><th className={th}>Situação</th><th className={th}>Última ok</th><th className={th}>Cadência</th>
              <th className={th + ' text-right'}>Execuções 24 h</th><th className={th + ' text-right'}>Erros</th><th className={th + ' text-right'}>Consultas</th>
              <th className={th}>Parou por</th><th className={th + ' text-right'}>Devida mais velha</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.chave} className={bodyRow} title={j.motivo}>
                <td className={td}><div className="font-medium text-[var(--color-text-primary)]">{j.rotulo}</div><div className="text-[11px] text-[var(--color-text-tertiary)]">{j.linha?.job ?? j.chave}</div></td>
                <td className={td}>{j.linha?.network ?? '—'}</td>
                <td className={td}><Selo s={j.saude} /><div className="mt-0.5 max-w-[260px] text-[11px] text-[var(--color-text-tertiary)]">{j.motivo}</div></td>
                <td className={td + ' whitespace-nowrap'}>{j.linha?.lastOkAt ? `${hora(j.linha.lastOkAt)} (${fmtMin((agora - new Date(j.linha.lastOkAt).getTime()) / 60000)})` : 'sem dado'}</td>
                <td className={td + ' whitespace-nowrap'}>{j.cadenciaMin != null ? `${j.cadenciaMin} min` : 'não definida'}</td>
                <td className={td + ' text-right tabular-nums'}>{j.linha ? nfmt(j.linha.runs24h) : '—'}</td>
                <td className={td + ' text-right tabular-nums'}>{j.linha ? `${nfmt(j.linha.errors24h)}${j.linha.rateLimited ? ` (429: ${nfmt(j.linha.rateLimited)})` : ''}` : '—'}</td>
                <td className={td + ' text-right tabular-nums'}>{j.linha?.checked != null ? nfmt(j.linha.checked) : '—'}</td>
                <td className={td}>{j.linha?.stoppedBecause ?? (j.linha?.budgetExhausted ? 'orçamento de tempo' : '—')}</td>
                <td className={td + ' text-right tabular-nums'}>{j.linha?.oldestDueAgeS != null ? fmtMin(j.linha.oldestDueAgeS / 60) : '—'}</td>
              </tr>
            ))}
            {!jobs.length ? <tr><td className={td} colSpan={10}>{indisp}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Estatística V1 (product_price_stats)" value={sn?.statsEm ? `há ${fmtMin((agora - new Date(sn.statsEm).getTime()) / 60000)}` : 'sem dado'} sub={sn ? hora(sn.statsEm) : 'indisponível agora'} />
        <Tile label="Vitrine: chave mais antiga (pode ser legada)" value={sn?.showcaseMaisAntigoEm ? `há ${fmtMin((agora - new Date(sn.showcaseMaisAntigoEm).getTime()) / 60000)}` : 'sem dado'} sub={sn ? hora(sn.showcaseMaisAntigoEm) : 'indisponível agora'} />
        <Tile label="Vitrine: chave mais recente" value={sn?.showcaseMaisRecenteEm ? `há ${fmtMin((agora - new Date(sn.showcaseMaisRecenteEm).getTime()) / 60000)}` : 'sem dado'} sub={sn ? hora(sn.showcaseMaisRecenteEm) : 'indisponível agora'} />
      </div>
    </>
  );
}

function Alertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 text-[13px] text-[var(--color-text-secondary)]">Nenhum alerta com os dados lidos agora.</div>;
  const cor = { critico: COR.critico, atencao: COR.atencao, info: COR.sem_dado } as const;
  const rot = { critico: 'Crítico', atencao: 'Atenção', info: 'Informativo' } as const;
  return (
    <ul className="flex flex-col gap-2">
      {alertas.map((a) => (
        <li key={a.id} className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3" style={{ borderLeft: `3px solid ${cor[a.severidade]}` }}>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: cor[a.severidade] }}>{rot[a.severidade]}</span>
            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{a.titulo}</span>
            {a.href ? <Link href={a.href} className="text-[12px] text-[var(--color-accent-primary)] underline">abrir tela</Link> : null}
          </div>
          <div className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">{a.detalhe}</div>
        </li>
      ))}
    </ul>
  );
}

const REGRAS: { id: string; regra: string; verificador: (s: FluxoSnapshot) => string }[] = [
  { id: 'R1', regra: 'Média única: selo, gráfico e cabeçalho usam a mesma média (oferta-dia, ADR 0004); mudança do menor preço sempre registrada.', verificador: () => 'verificação manual (comparar lista e página do produto)' },
  { id: 'R2', regra: 'Proibido dado fake ou sintético; falha de leitura vira "indisponível", nunca zero.', verificador: () => 'verificação manual; este painel segue a regra (sem fonte = "sem dado")' },
  { id: 'R3', regra: 'Lojas Plus aparecem como Plus; sem selo nem média pública até 27/11 (média pública só games).', verificador: () => 'verificação manual' },
  { id: 'R4', regra: 'Concorrência real: menor preço = oferta ativa mais barata agora; sem estoque cai para a próxima.', verificador: () => 'verificação manual (oferta inativa nunca no topo)' },
  { id: 'R5', regra: 'Sem a palavra "afiliado" na interface do cliente; aviso de comissão só pelo componente aprovado.', verificador: () => 'verificação manual (grep fora do admin)' },
  { id: 'R6', regra: 'Uma imagem, um lugar só em public/images.', verificador: () => 'verificação manual (grep pelo nome do arquivo)' },
  { id: 'R7', regra: 'Cantos retos nas telas novas.', verificador: () => 'verificação manual (revisão visual)' },
  { id: 'R8', regra: 'Frescor visível: toda tela mostra de quando é o dado.', verificador: () => 'verificação manual' },
  { id: 'R9', regra: 'Só produto novo e em linha; retrô, usado, fora de linha e Open Box fora das médias.', verificador: () => 'verificação manual (filtros do porteiro)' },
  { id: 'R10', regra: 'Plataforma "unknown" nunca como padrão; derivar do título antes de desistir.', verificador: (s) => (s.plataformaDesconhecida.dados ? `automático: ${nfmt(s.plataformaDesconhecida.dados.n)} masters de games ainda com plataforma unknown` : 'automático, mas indisponível agora') },
  { id: 'R11', regra: 'Um jogo, um master: checar duplicata por título e plataforma antes de cadastrar.', verificador: () => 'verificação manual (findExistingMasterProduct no cadastro; auditoria no guardião do catálogo)' },
  { id: 'R12', regra: 'Coleta somente por API oficial; scraping proibido.', verificador: () => 'verificação manual (revisão de código)' },
];

export function FluxoView({ inicial }: { inicial: FluxoSnapshot }) {
  const [snap, setSnap] = React.useState<FluxoSnapshot>(inicial);
  const [agora, setAgora] = React.useState<number>(() => Date.parse(inicial.geradoEm) || 0);
  const [falha, setFalha] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    let busy = false;
    const tick = () => setAgora(Date.now());
    tick();
    const relogio = setInterval(tick, 15_000);
    const buscar = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const r = await fetch('/api/admin/fluxo', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as FluxoSnapshot;
        if (vivo) { setSnap(j); setFalha(null); tick(); }
      } catch (e) {
        if (vivo) setFalha(e instanceof Error ? e.message : 'falha');
      } finally { busy = false; }
    };
    const t = setInterval(buscar, INTERVALO_MS);
    const vis = () => { if (!document.hidden) void buscar(); };
    document.addEventListener('visibilitychange', vis);
    return () => { vivo = false; clearInterval(t); clearInterval(relogio); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const jobs = React.useMemo(() => avaliarJobs(snap, agora), [snap, agora]);
  const nos = React.useMemo(() => avaliarNos(snap, jobs, agora), [snap, jobs, agora]);
  const alertas = React.useMemo(() => montarAlertas(snap, jobs, agora), [snap, jobs, agora]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--color-text-primary)]">Fluxo ao vivo</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">Extração, banco, catálogo, preço, mensagens e front. Somente leitura.</p>
        </div>
        <div className="text-right text-[12px] text-[var(--color-text-tertiary)]">
          consultado em {hora(snap.geradoEm)} · atualiza a cada 45 s
          {falha ? <div style={{ color: COR.atencao }}>última atualização falhou ({falha}); mostrando a leitura anterior</div> : null}
        </div>
      </div>

      <Titulo sub="Verde: ok dentro da cadência. Âmbar: atrasado até 2x. Vermelho: mais de 2x ou erro. Cinza: sem dado. Passe o mouse no nó para o motivo.">1. Mapa de nós</Titulo>
      <Mapa nos={nos} />
      <div className={wrap + ' mt-3'}>
        <table className="w-full min-w-[560px] border-collapse">
          <thead><tr className={headRow}><th className={th}>Nó</th><th className={th}>Situação</th><th className={th}>Motivo</th></tr></thead>
          <tbody>
            {nos.map((n) => (
              <tr key={n.id} className={bodyRow}>
                <td className={td + ' font-medium text-[var(--color-text-primary)]'}>{NOS[n.id].rotulo}</td>
                <td className={td}><Selo s={n.saude} /></td>
                <td className={td}>{n.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Titulo sub="Contagens ao vivo no banco (cache de 15 s no servidor).">2. Filas e tamanhos</Titulo>
      <Filas s={snap} agora={agora} />

      <Titulo sub="collector_runs das últimas 24 h, uma linha por job. Atraso medido contra a cadência de vercel.json e slo.ts.">3. Jobs e última execução</Titulo>
      <Jobs jobs={jobs} s={snap} agora={agora} />

      <Titulo sub="Calculados agora a partir dos blocos acima.">4. Alertas de pontas soltas</Titulo>
      <Alertas alertas={alertas} />

      <Titulo sub="Do capítulo 5 do Fluxo Mestre e do AGENTS.md. Regra sem verificador automático fica marcada como verificação manual.">5. Regras imperativas</Titulo>
      <div className={wrap}>
        <table className="w-full min-w-[640px] border-collapse">
          <thead><tr className={headRow}><th className={th}>#</th><th className={th}>Regra</th><th className={th}>Verificação</th></tr></thead>
          <tbody>
            {REGRAS.map((r) => (
              <tr key={r.id} className={bodyRow}>
                <td className={td + ' font-medium text-[var(--color-text-primary)]'}>{r.id}</td>
                <td className={td}>{r.regra}</td>
                <td className={td}>{r.verificador(snap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Titulo sub="Lida de docs/fila-de-execucao.md no servidor.">Fila de execução (viva)</Titulo>
      {!snap.fila.ok ? (
        <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 text-[13px]" style={{ borderLeft: `3px solid ${COR.atencao}` }}>
          Aviso: {snap.fila.erro}. Nada é exibido no lugar.
        </div>
      ) : (
        <div className={wrap}>
          <table className="w-full min-w-[900px] border-collapse">
            <thead><tr className={headRow}><th className={th}>#</th><th className={th}>Prio</th><th className={th}>Tarefa</th><th className={th}>Dono</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {snap.fila.linhas.map((l) => (
                <tr key={l.numero} className={bodyRow}>
                  <td className={td}>{l.numero}</td>
                  <td className={td + ' font-medium'} style={{ color: l.prio === 'P0' ? COR.critico : l.prio === 'P1' ? COR.atencao : undefined }}>{l.prio}</td>
                  <td className={td + ' text-[var(--color-text-primary)]'}>{l.tarefa}</td>
                  <td className={td}>{l.dono}</td>
                  <td className={td}>{l.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
