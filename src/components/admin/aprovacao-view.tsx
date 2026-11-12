'use client';

import * as React from 'react';
import { Check, X, SkipForward, Undo2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import { EXPLICACOES, LOJA_ROTULO, QUEDA_SUSPEITA, type Motivo } from '@/lib/aprovacao/motivos';
import {
  atualizarPainel, carregarCartoes, confirmarLoteObvios, decidirCartao, desfazerDecisao, previaLoteObvios, type RespostaAprovacao,
} from '@/server/actions/aprovacao';
import type { Cartao, HistoricoRow, Painel, PreviaLote } from '@/server/aprovacao/aprovacao';

interface Props { painel: Painel; historico: HistoricoRow[]; cartoes: Cartao[] }

const ERROS: Record<string, string> = {
  oferta_em_quarentena: 'Oferta em quarentena de preço: não pode ser liberada.',
  sem_preco_lido: 'Sem preço lido: não pode ser liberada.',
  open_box_fora: 'É Open Box: fica fora (só produto novo).',
  usado_fora: 'É usado/seminovo: fica fora (só produto novo).',
  duas_geracoes_no_titulo: 'O título cita duas gerações (ex.: PS4 e PS5): não libera sem prova.',
  produto_rejeitado_no_catalogo: 'O produto foi rejeitado no catálogo.',
  possivel_duplicata_de_outro_produto: 'Parece duplicata de outro produto do catálogo (um jogo, uma média só). Não libera.',
  escolha_uma_opcao: 'Este caso exige escolher uma das opções (botões abaixo).',
  rascunho_fora_do_caminho_de_promocao: 'Este rascunho não tem caminho de liberação por aqui.',
  verificacao_duplicata_falhou: 'Não deu para checar duplicata agora; por segurança não libera. Tente de novo.',
  promocao_nao_ativou: 'A oferta não pôde ser ativada; nada foi gravado.',
  falha: 'Não foi possível gravar agora. Tente de novo.',
};
const msgErro = (e?: string) => (e && ERROS[e]) || `Não foi possível gravar (${e ?? 'erro'}).`;
const rede = (r: string) => LOJA_ROTULO[r] ?? r;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const hora = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function Num({ rotulo, valor, destaque }: { rotulo: string; valor: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={cn('border p-3', destaque ? 'border-[var(--color-accent-success)]' : 'border-[var(--color-border-default)]', 'bg-[var(--color-bg-surface)]')}>
      <div className="text-caption text-[var(--color-text-tertiary)]">{rotulo}</div>
      <div className="text-[26px] font-semibold leading-tight text-[var(--color-text-primary)]">{valor}</div>
    </div>
  );
}

export function AprovacaoView({ painel: p0, historico: h0, cartoes: c0 }: Props) {
  const [painel, setPainel] = React.useState(p0);
  const [hist, setHist] = React.useState(h0);
  const [cards, setCards] = React.useState(c0);
  const [skipped, setSkipped] = React.useState<string[]>([]);
  const [feitos, setFeitos] = React.useState(0);
  const [total0] = React.useState(p0.total);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [last, setLast] = React.useState<{ decisionId: string; titulo: string; card: Cartao } | null>(null);
  const [aba, setAba] = React.useState<'cartao' | 'lote' | 'historico'>('cartao');
  const [aberto, setAberto] = React.useState<Motivo | null>(null);
  const [previa, setPrevia] = React.useState<PreviaLote | null>(null);
  const [confirma, setConfirma] = React.useState(false);
  const loading = React.useRef(false);
  const card = cards[0];

  const aplica = (r: RespostaAprovacao) => { if (r.painel) setPainel(r.painel); if (r.historico) setHist(r.historico); };

  const recarregar = React.useCallback(async (skip: string[]) => {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await carregarCartoes(skip);
      if (r.ok) setCards((cs) => { const have = new Set(cs.map((c) => c.key)); return [...cs, ...r.cartoes.filter((c) => !have.has(c.key))]; });
    } catch { /* sessao expirada: o proximo clique avisa */ } finally { loading.current = false; }
  }, []);

  React.useEffect(() => { if (cards.length < 4 && cards.length < painel.total) void recarregar(skipped); }, [cards.length, painel.total, skipped, recarregar]);

  const decidir = React.useCallback(async (acao: 'aprovar' | 'recusar' | 'pular' | 'escolha', value?: string) => {
    if (!card || busy) return;
    setBusy(true); setMsg(null);
    try {
      if (acao === 'pular' && card.itemId === null) {
        // Rascunho sem item: pular nao grava nada (sem decisao 'nao sei' artificial); some so nesta sessao.
        setSkipped((s) => [...s, card.key]); setCards((cs) => cs.filter((c) => c.key !== card.key)); setMsg({ tipo: 'ok', texto: 'Pulado nesta sessão.' });
        return;
      }
      const r = await decidirCartao(card.key, acao, value);
      if (!r.ok) { setMsg({ tipo: 'erro', texto: msgErro(r.error) }); return; }
      aplica(r);
      setCards((cs) => cs.filter((c) => c.key !== card.key));
      if (acao === 'pular') { setSkipped((s) => [...s, card.key]); setMsg({ tipo: 'ok', texto: 'Pulado: a pergunta volta em 7 dias.' }); return; }
      setFeitos((n) => n + 1);
      if (r.decisionId && !r.already) setLast({ decisionId: r.decisionId, titulo: card.title, card });
      setMsg({
        tipo: 'ok',
        texto: r.liberada
          ? `Liberada. ${r.masterAprovado ? 'O produto entrou no catálogo. ' : ''}Já é elegível à aba Black Friday e às mensagens (Amazon: com preço confirmado há menos de 40 min).`
          : acao === 'recusar' ? 'Recusada (fica fora). Dá para desfazer.' : 'Resposta gravada. Dá para desfazer.',
      });
    } catch { setMsg({ tipo: 'erro', texto: 'Sessão expirada ou sem conexão. Recarregue a página.' }); } finally { setBusy(false); }
  }, [card, busy]);

  const desfazer = React.useCallback(async (id: string, card?: Cartao) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await desfazerDecisao(id);
      if (!r.ok) { setMsg({ tipo: 'erro', texto: msgErro(r.error) }); return; }
      aplica(r);
      if (card) setCards((cs) => [card, ...cs.filter((c) => c.key !== card.key)]);
      else void recarregar(skipped);
      setLast(null); setFeitos((n) => Math.max(0, n - 1));
      setMsg({ tipo: 'ok', texto: 'Desfeito: a oferta voltou ao estado anterior.' });
    } catch { setMsg({ tipo: 'erro', texto: 'Sessão expirada ou sem conexão. Recarregue a página.' }); } finally { setBusy(false); }
  }, [busy, recarregar, skipped]);

  React.useEffect(() => {
    if (aba !== 'cartao') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && last) { e.preventDefault(); void desfazer(last.decisionId, last.card); }
      else if (k === 'a' || k === 'arrowright') { e.preventDefault(); void decidir('aprovar'); }
      else if (k === 'r' || k === 'arrowleft') { e.preventDefault(); void decidir('recusar'); }
      else if (k === 'p' || k === 'arrowdown') { e.preventDefault(); void decidir('pular'); }
      else if (card && /^[1-9]$/.test(k)) {
        const escolhas = card.options.filter((o) => o.kind === 'escolha');
        const o = escolhas[Number(k) - 1];
        if (o) { e.preventDefault(); void decidir('escolha', o.value); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aba, card, last, decidir, desfazer]);

  // Gesto no celular: arrastar para a direita aprova, para a esquerda recusa (so no cartao, com distancia minima).
  const toque = React.useRef<{ x: number; y: number } | null>(null);
  const aoTocar = (e: React.TouchEvent) => { toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const aoSoltar = (e: React.TouchEvent) => {
    const t = toque.current; toque.current = null;
    if (!t || !card) return;
    const dx = e.changedTouches[0].clientX - t.x; const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) < 110 || Math.abs(dx) < Math.abs(dy) * 2) return;
    void decidir(dx > 0 ? 'aprovar' : 'recusar');
  };

  async function verPrevia() {
    setBusy(true); setConfirma(false); setMsg(null);
    try { const r = await previaLoteObvios(); if (r.ok && r.previa) setPrevia(r.previa); else setMsg({ tipo: 'erro', texto: 'Não foi possível calcular a prévia agora.' }); } catch { setMsg({ tipo: 'erro', texto: 'Sessão expirada. Recarregue.' }); } finally { setBusy(false); }
  }
  async function aplicarLote() {
    if (!previa || !confirma) { setConfirma(true); return; }
    setBusy(true);
    try {
      const r = await confirmarLoteObvios(previa.ids);
      if (!r.ok) setMsg({ tipo: 'erro', texto: msgErro(r.error) });
      else { aplica(r); setMsg({ tipo: 'ok', texto: `Lote aplicado: ${r.aplicados} confirmados, ${r.mudaram} mudaram desde a prévia (ficaram de fora), ${r.erros} erros. Cada um pode ser desfeito no histórico.` }); setPrevia(null); setCards([]); void recarregar(skipped); }
    } catch { setMsg({ tipo: 'erro', texto: 'Sessão expirada. Recarregue.' }); } finally { setBusy(false); setConfirma(false); }
  }

  const exp = card ? EXPLICACOES[card.motivo] : null;
  const escolhas = card ? card.options.filter((o) => o.kind === 'escolha') : [];
  const exige = exp?.exigeEscolha ?? false;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 pb-24">
      <header>
        <h1 className="text-[22px] font-semibold text-[var(--color-text-primary)]">Aprovação</h1>
        <p className="text-body-sm text-[var(--color-text-secondary)]">Aqui você libera, um por vez, o que está esperando para ir à aba Black Friday e às mensagens do Telegram e do WhatsApp. Nada é aprovado sem o seu clique, e tudo pode ser desfeito.</p>
      </header>

      <section aria-label="Painel" className="grid gap-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Num rotulo="Esperando você" valor={painel.total.toLocaleString('pt-BR')} />
          <Num rotulo="Liberadas hoje por você" valor={painel.liberadasHoje} destaque />
          <Num rotulo="Respostas suas hoje" valor={painel.resolvidasHoje} />
          <Num rotulo="Rascunhos Amazon" valor={painel.rascunhosAmazon.toLocaleString('pt-BR')} />
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Por loja">
          {painel.porLoja.map((l) => (
            <span key={l.rede} className="border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-1 text-body-sm">{rede(l.rede)}: <strong>{l.n}</strong></span>
          ))}
          {painel.encerradas > 0 ? <span className="px-3 py-1 text-caption text-[var(--color-text-tertiary)]">+ {painel.encerradas} de ofertas já encerradas (não entram)</span> : null}
        </div>
        <div className="grid gap-2">
          {painel.porMotivo.map((m) => {
            const e = EXPLICACOES[m.motivo];
            const aberta = aberto === m.motivo;
            return (
              <div key={m.motivo} className="border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
                <button type="button" onClick={() => setAberto(aberta ? null : m.motivo)} aria-expanded={aberta} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left">
                  <span className="font-medium text-[var(--color-text-primary)]">{e.titulo}</span>
                  <span className="flex items-center gap-2"><strong className="text-[18px]">{m.n}</strong><span className="text-caption text-[var(--color-text-tertiary)]">{aberta ? 'fechar' : 'entender'}</span></span>
                </button>
                {aberta ? (
                  <div className="grid gap-2 border-t border-[var(--color-border-subtle)] p-3 text-body-sm">
                    <p><strong>Por que precisa de você:</strong> {e.porque}</p>
                    <p><strong>Se você aprovar:</strong> {e.aprovar}</p>
                    <p><strong>Se você recusar:</strong> {e.recusar}</p>
                    <p className="text-caption text-[var(--color-text-tertiary)]">{painel.porMotivoLoja.filter((x) => x.motivo === m.motivo).map((x) => `${rede(x.rede)} ${x.n}`).join(' · ')}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <nav className="grid grid-cols-3 border border-[var(--color-border-default)]" aria-label="Modos">
        {([['cartao', 'Um por vez'], ['lote', 'Lote de óbvios'], ['historico', 'Histórico']] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setAba(k)} aria-current={aba === k ? 'page' : undefined}
            className={cn('min-h-12 text-body-sm font-medium', aba === k ? 'bg-[var(--color-accent-primary-muted)] text-[var(--color-accent-primary)]' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]')}>{t}</button>
        ))}
      </nav>

      {msg ? <div role="status" className={cn('border p-3 text-body-sm', msg.tipo === 'ok' ? 'border-[var(--color-accent-success)]' : 'border-[var(--color-accent-danger)]')}>{msg.texto}</div> : null}

      {aba === 'cartao' ? (
        card && exp ? (
          <section aria-label="Cartão" onTouchStart={aoTocar} onTouchEnd={aoSoltar} className="grid gap-3 border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 md:grid-cols-[minmax(0,320px)_1fr]">
            <div className="md:col-span-2 flex items-center justify-between text-caption text-[var(--color-text-tertiary)]">
              <span>Item {feitos + 1} de {Math.max(total0, feitos + painel.total)} · restam {painel.total}</span>
              <span className="hidden md:inline">Atalhos: A aprova · R recusa · P pula · Z desfaz · 1-9 escolhe</span>
              <span className="md:hidden">Arraste: direita aprova, esquerda recusa</span>
            </div>
            <div className="flex aspect-square items-center justify-center bg-[var(--color-bg-inset)] p-2">
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt={card.title} referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
              ) : <span className="text-caption text-[var(--color-text-tertiary)]">Sem imagem na oferta</span>}
            </div>
            <div className="grid content-start gap-3">
              <div className="flex flex-wrap gap-1.5 text-caption">
                <span className="bg-[var(--color-accent-primary-muted)] px-2 py-1 font-medium text-[var(--color-accent-primary)]">{rede(card.rede)}{card.loja && card.loja !== rede(card.rede) ? ` · ${card.loja}` : ''}</span>
                {card.plataforma ? <span className="border border-[var(--color-border-default)] px-2 py-1">Plataforma: {card.plataforma}</span> : null}
                <span className="border border-[var(--color-border-default)] px-2 py-1">{card.vertical}</span>
                <span className={cn('border px-2 py-1', card.draft ? 'border-[var(--color-accent-orange)]' : 'border-[var(--color-accent-success)]')}>{card.draft ? 'Em rascunho (fora do ar)' : 'Já está no ar'}</span>
              </div>
              <h2 className="break-words text-[18px] font-semibold leading-snug text-[var(--color-text-primary)]">{card.title}</h2>
              {card.masterName && card.masterName !== card.title ? <p className="text-body-sm text-[var(--color-text-secondary)]">Produto do catálogo: <strong>{card.masterName}</strong></p> : null}
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-caption text-[var(--color-text-tertiary)]">Preço agora</div><div className="text-[28px] font-semibold">{card.priceCents ? formatBRL(card.priceCents) : 'sem preço'}</div></div>
                <div>
                  <div className="text-caption text-[var(--color-text-tertiary)]">Média de referência</div>
                  {card.refCents && card.nRefs ? (
                    <div className="text-[20px] font-medium">{formatBRL(card.refCents)} <span className="text-caption text-[var(--color-text-tertiary)]">({card.nRefs} ofertas)</span></div>
                  ) : <div className="text-body-sm text-[var(--color-text-tertiary)]">sem referência suficiente</div>}
                  {card.queda != null ? (
                    <div className={cn('text-body-sm font-medium', card.queda > QUEDA_SUSPEITA ? 'text-[var(--color-accent-orange)]' : card.queda > 0 ? 'text-[var(--color-accent-success)]' : 'text-[var(--color-text-secondary)]')}>
                      {card.queda > 0 ? `${pct(card.queda)} abaixo da média` : `${pct(-card.queda)} acima da média`}{card.queda > QUEDA_SUSPEITA ? ' · queda grande demais: confira se é a mesma versão' : ''}
                    </div>
                  ) : null}
                </div>
              </div>
              {card.confirmadoHaMin != null ? <p className="text-caption text-[var(--color-text-tertiary)]">Preço confirmado há {card.confirmadoHaMin < 60 ? `${card.confirmadoHaMin} min` : `${Math.round(card.confirmadoHaMin / 60)} h`}{card.rede === 'amazon' && card.confirmadoHaMin >= 40 ? ' (a mensagem só sai quando confirmar de novo, em até 40 min)' : ''}</p> : null}
              {card.asin ? <a className="inline-flex items-center gap-1 text-caption text-[var(--color-accent-info)]" href={`https://www.amazon.com.br/dp/${card.asin}`} target="_blank" rel="noopener noreferrer">ASIN {card.asin} <ExternalLink className="size-3" /></a> : null}
              <div className="border border-[var(--color-border-subtle)] p-3 text-body-sm">
                <div className="font-medium text-[var(--color-text-primary)]">{exp.titulo}</div>
                <p className="mt-1 text-[var(--color-text-secondary)]">{exp.porque}</p>
                <p className="mt-1"><strong>Aprovar:</strong> {exp.aprovar}</p>
                <p className="mt-1"><strong>Recusar:</strong> {exp.recusar}</p>
                {card.reason ? <p className="mt-1 text-caption text-[var(--color-text-tertiary)]">Detalhe do sistema: {card.reason}</p> : null}
              </div>
              {exige || escolhas.length > 1 && card.axis !== 'identidade' && card.axis !== 'preco' ? (
                <div className="grid gap-2" aria-label="Opções">
                  {escolhas.map((o, i) => (
                    <button key={o.value} type="button" disabled={busy} onClick={() => void decidir('escolha', o.value)}
                      className="min-h-14 border border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] px-3 py-2 text-left text-body-sm font-medium">
                      <span className="mr-2 text-[var(--color-text-tertiary)]">{i + 1}</span>{o.label}{o.hint ? <span className="block text-caption font-normal text-[var(--color-text-secondary)]">{o.hint}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="md:col-span-2 grid grid-cols-3 gap-2">
              <button type="button" disabled={busy || exige} onClick={() => void decidir('recusar')} className="flex min-h-16 flex-col items-center justify-center gap-1 border border-[var(--color-accent-danger)] text-[var(--color-accent-danger)] disabled:opacity-40"><X className="size-6" /><span className="font-semibold">RECUSAR</span></button>
              <button type="button" disabled={busy} onClick={() => void decidir('pular')} className="flex min-h-16 flex-col items-center justify-center gap-1 border border-[var(--color-border-strong)] text-[var(--color-text-secondary)]"><SkipForward className="size-6" /><span className="font-semibold">PULAR</span></button>
              <button type="button" disabled={busy || exige} onClick={() => void decidir('aprovar')} className="flex min-h-16 flex-col items-center justify-center gap-1 bg-[var(--color-accent-success)] text-[var(--color-text-inverse)] disabled:opacity-40"><Check className="size-6" /><span className="font-semibold">APROVAR</span></button>
            </div>
            {last ? (
              <div className="md:col-span-2 flex items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] pt-2 text-caption">
                <span className="min-w-0 truncate">Última: {last.titulo}</span>
                <button type="button" disabled={busy} onClick={() => void desfazer(last.decisionId, last.card)} className="inline-flex min-h-11 items-center gap-1 border border-[var(--color-border-strong)] px-3"><Undo2 className="size-4" />Desfazer última (Z)</button>
              </div>
            ) : null}
          </section>
        ) : (
          <div className="border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6 text-center">{painel.total === 0 ? 'Nada esperando por você agora.' : busy || loading.current ? 'Carregando…' : 'Não há mais cartões nesta sessão. Recarregue para ver os pulados.'}</div>
        )
      ) : null}

      {aba === 'lote' ? (
        <section className="grid gap-3 border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3" aria-label="Lote">
          <p className="text-body-sm text-[var(--color-text-secondary)]">Aprova de uma vez só os casos que o próprio sistema já considera óbvios (prova objetiva, como código de barras igual ou título idêntico com preço normal). Você vê a lista antes e confirma em dois cliques. Cada item continua podendo ser desfeito. Este lote confirma que é o mesmo produto de ofertas que já estão no ar: não solta rascunhos.</p>
          <button type="button" disabled={busy} onClick={() => void verPrevia()} className="min-h-12 border border-[var(--color-accent-primary)] px-3 font-medium">{previa ? 'Recalcular prévia' : 'Ver prévia dos óbvios'}</button>
          {previa ? (
            <div className="grid gap-3">
              <p className="font-medium">{previa.total === 0 ? 'Nenhum caso óbvio esperando agora.' : `${previa.total} casos óbvios. Esta rodada aplica os primeiros ${previa.ids.length}.`}</p>
              {previa.grupos.map((g) => (
                <div key={g.criterio} className="border border-[var(--color-border-subtle)] p-2">
                  <div className="font-medium">{g.descricao}: {g.n}</div>
                  <ul className="mt-1 grid gap-1 text-caption text-[var(--color-text-secondary)]">
                    {g.amostra.map((a) => <li key={a.itemId} className="break-words">• {a.title}{a.master ? ` → ${a.master}` : ''}</li>)}
                  </ul>
                  {g.n > g.amostra.length ? <p className="mt-1 text-caption text-[var(--color-text-tertiary)]">e mais {g.n - g.amostra.length} neste grupo (amostra acima)</p> : null}
                </div>
              ))}
              {previa.ids.length > 0 ? (
                <button type="button" disabled={busy} onClick={() => void aplicarLote()} className={cn('min-h-14 px-3 font-semibold', confirma ? 'bg-[var(--color-accent-success)] text-[var(--color-text-inverse)]' : 'border border-[var(--color-accent-success)] text-[var(--color-accent-success)]')}>
                  {confirma ? `CONFIRMAR: aprovar ${previa.ids.length} itens agora` : `Aprovar estes ${previa.ids.length} (1º clique)`}
                </button>
              ) : null}
              {confirma ? <button type="button" onClick={() => setConfirma(false)} className="min-h-11 border border-[var(--color-border-strong)]">Cancelar</button> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {aba === 'historico' ? (
        <section className="grid gap-2 border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3" aria-label="Histórico">
          <div className="flex items-center justify-between"><h2 className="font-medium">Últimas {hist.length} decisões</h2><button type="button" onClick={() => void atualizarPainel().then(aplica)} className="min-h-11 border border-[var(--color-border-strong)] px-3 text-caption">Atualizar</button></div>
          {hist.length === 0 ? <p className="text-body-sm text-[var(--color-text-tertiary)]">Nenhuma decisão ainda.</p> : null}
          <ul className="grid gap-1">
            {hist.map((h) => (
              <li key={h.decisionId} className="flex items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] py-2">
                <span className="min-w-0 break-words text-body-sm"><strong>{h.title}</strong><br /><span className="text-caption text-[var(--color-text-tertiary)]">{h.liberou ? 'Liberada · ' : ''}{h.label} · {hora(h.decidedAt)}{h.undoneAt ? ' · desfeita' : ''}</span></span>
                {h.undoneAt ? null : <button type="button" disabled={busy} onClick={() => void desfazer(h.decisionId)} className="min-h-11 shrink-0 border border-[var(--color-border-strong)] px-3 text-caption">Reverter</button>}
              </li>
            ))}
          </ul>
          <p className="text-caption text-[var(--color-text-tertiary)]">Cada decisão guarda o estado anterior no banco (reversível por aqui). Cópia em arquivo: <code>npx tsx --conditions=react-server --env-file=.env.local scripts/aprovacao-backup.ts</code>; reverter em bloco: <code>... scripts/aprovacao-backup.ts --reverter docs/backups/&lt;arquivo&gt;.ndjson</code>.</p>
        </section>
      ) : null}
    </div>
  );
}
