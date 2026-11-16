/**
 * R-68 (2026-11-16): relatório dos avisos de cupom de ANÚNCIO que saíram só com leitura de texto (sem prova no item), para o DONO decidir o que apagar/corrigir no Telegram.
 * SOMENTE LEITURA: não apaga nem posta nada. Gera docs/avisos-cupom-sem-prova-2026-11-16.md e o NDJSON ao lado.
 *   npx tsx --env-file=.env.local scripts/relatorio-avisos-cupom-sem-prova-123.ts [--horas=48]
 * Medida (c): para cada aviso, o "R$ X com Cupom" lido bate EXATAMENTE (centavos) com o preço de OUTRA oferta ML (último preço gravado antes da leitura)? É o sinal de que o leitor antigo
 * leu o cupom de outro card da mesma página (carrossel de relacionados, outros vendedores). Mesmo catálogo = outro vendedor do mesmo produto; outro catálogo = produto relacionado.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

const horas = Number(process.argv.find((a) => a.startsWith('--horas='))?.slice(8) ?? 48);

async function main() {
  const sql = connect();
  try {
    const rows = await sql`
      SELECT a.id::text AS ann, a.offer_id::text AS oferta, left(o.title, 70) AS titulo, o.external_ref AS catalogo, a.vertical, a.store_id::text AS loja, a.group_message_id::text AS group_message_id,
             g.channel, g.provider_message_id, to_char(a.first_sent_at, 'YYYY-MM-DD HH24:MI') AS enviado_em, a.ended_at IS NULL AS aberto, a.end_reason, a.end_notified_at IS NOT NULL AS card_encerrado,
             o.current_price_cents AS preco_atual, r.label, r.price_with_coupon_cents AS pw, r.price_seen_cents AS visto, r.campaign_id, r.status AS status_leitura, to_char(r.read_at, 'HH24:MI') AS lido_as,
             (SELECT count(*) FROM coupon_validations v WHERE v.offer_id = a.offer_id AND v.validated_at IS NOT NULL AND v.proof_type IS NOT NULL)::int AS provas_no_cofre,
             x.offer AS outro_offer, left(x.title, 50) AS outro_titulo, (x.ref = o.external_ref) AS mesmo_catalogo
      FROM coupon_announcements a
      JOIN affiliate_offers o ON o.id = a.offer_id
      LEFT JOIN group_messages g ON g.id = a.group_message_id
      LEFT JOIN LATERAL (SELECT label, price_with_coupon_cents, price_seen_cents, campaign_id, status, read_at FROM offer_coupon_reads r2
                         WHERE r2.offer_id = a.offer_id AND r2.price_with_coupon_cents IS NOT NULL AND r2.read_at <= a.first_sent_at + interval '2 minutes' ORDER BY r2.read_at DESC LIMIT 1) r ON true
      LEFT JOIN LATERAL (
        SELECT o2.id::text AS offer, o2.title, o2.external_ref AS ref
        FROM affiliate_offers o2 JOIN affiliate_networks n2 ON n2.id = o2.network_id AND n2.slug = 'mercado-livre'
        WHERE o2.id <> a.offer_id AND r.price_with_coupon_cents IS NOT NULL
          AND (SELECT s.price_cents FROM affiliate_price_snapshots s WHERE s.offer_id = o2.id AND s.collected_at <= r.read_at ORDER BY s.collected_at DESC LIMIT 1) = r.price_with_coupon_cents
          AND o2.last_checked_at > r.read_at - interval '6 hours'
        ORDER BY (o2.external_ref = o.external_ref) DESC LIMIT 1) x ON true
      WHERE a.kind = 'anuncio' AND a.first_sent_at > now() - make_interval(hours => ${horas})
      ORDER BY a.first_sent_at`;
    const total = rows.length;
    const semProva = rows.filter((r) => r.provas_no_cofre === 0);
    const semCampanha = rows.filter((r) => !r.campaign_id);
    const batemOutro = rows.filter((r) => r.outro_offer);
    const batemMesmoCat = batemOutro.filter((r) => r.mesmo_catalogo);
    const comCard = rows.filter((r) => r.card_encerrado);
    const abertos = rows.filter((r) => r.aberto);
    const brl = (c: number | null) => (c == null ? '-' : `R$ ${(Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    const L: string[] = [];
    L.push(`# Avisos de cupom de anúncio sem prova (R-68) - ${new Date().toISOString().slice(0, 16)}Z`, '');
    L.push(`Janela: últimas ${horas} h. **Nada foi apagado nem postado no Telegram**: esta lista é para o dono decidir apagar/corrigir.`, '');
    L.push('## Dimensão', '');
    L.push(`- avisos de cupom de anúncio: **${total}**; sem nenhuma prova no cofre: **${semProva.length}**; sem campaign_id na leitura que os gerou: **${semCampanha.length}**`);
    L.push(`- abertos agora: ${abertos.length}; com card "Cupom encerrado" já publicado: **${comCard.length}** (segunda notícia falsa se o cupom nunca existiu)`);
    L.push(`- o "R$ X com Cupom" lido bate EXATAMENTE (centavos) com o preço de OUTRA oferta ML na hora da leitura: **${batemOutro.length}** de ${total} (${total ? Math.round((batemOutro.length / total) * 100) : 0}%), dos quais ${batemMesmoCat.length} do mesmo catálogo (outro vendedor do mesmo produto) e ${batemOutro.length - batemMesmoCat.length} de produto diferente (carrossel de relacionados)`, '');
    L.push('Limite da medida: só detecta o caso em que o preço do outro card existe como oferta nossa; leitura de outro card que não temos no banco não aparece (nesse sentido é um piso), e preço redondo igual por coincidência é possível (nesse sentido é um sinal, não uma prova caso a caso: a prova é a ausência de campaign_id em 45 de 46 e de qualquer prova no cofre).', '');
    L.push('## Lista', '');
    L.push('| oferta | produto | canal | group_message_id | telegram msg | enviado | estado | lido (cupom) | bate com outra oferta |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      L.push(`| ${String(r.oferta).slice(0, 8)} | ${String(r.titulo).replace(/\|/g, '/')} | ${r.channel ?? '-'} / ${r.vertical} | ${String(r.group_message_id ?? '-').slice(0, 8)} | ${r.provider_message_id ?? '-'} | ${r.enviado_em} | ${r.aberto ? 'aberto' : `encerrado (${r.end_reason}${r.card_encerrado ? ', card publicado' : ''})`} | ${r.label ?? '-'} (${brl(r.pw)} x ${brl(r.visto)}) ${r.campaign_id ? `camp ${r.campaign_id}` : 'sem campanha'} | ${r.outro_offer ? `${String(r.outro_offer).slice(0, 8)} ${String(r.outro_titulo).replace(/\|/g, '/')}${r.mesmo_catalogo ? ' (mesmo catálogo)' : ''}` : '-'} |`);
    }
    fs.writeFileSync('docs/avisos-cupom-sem-prova-2026-11-16.md', L.join('\n') + '\n');
    fs.writeFileSync('docs/avisos-cupom-sem-prova-2026-11-16.ndjson', rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(L.slice(0, 12).join('\n'));
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
export {};
