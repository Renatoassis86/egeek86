/**
 * AUDITORIA DE POLUIÇÃO (checklist #38): peças, acessórios e itens soltos que poluem o catálogo monitorado FORA do tipo console.
 * SOMENTE SELECT (teto de linhas). Grava docs/backups/auditoria-poluicao-<ts>.md. Não muda nada.
 *   npx tsx --env-file=.env.local scripts/auditar-poluicao-pecas.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const PADRAO =
  '(^|[^a-z])(motor|motores|abracadeira|abracadeiras|cartela|cartelas|adesivo|adesivos|frontal|frontais|reposicao|reposição|carcaca|carcaça|engrenagem|parafuso|parafusos|mica|pelicula|película|capinha|bico para|nozzle|correia|ventoinha|placa frontal|peca de|peça de|pecas para|peças para)([^a-z]|$)';

(async () => {
  const sql = connect();
  try {
    await sql`SET statement_timeout = '60s'`;
    const porVertical = await sql<{ vertical: string; tipo: string; n: number }[]>`
      SELECT m.vertical, m.product_type::text AS tipo, count(*)::int AS n
      FROM master_products m
      WHERE (m.attributes ->> 'mergedInto') IS NULL
        AND COALESCE(m.attributes -> 'catalogGate' ->> 'manual', m.attributes -> 'catalogGate' ->> 'verdict', 'approved') = 'approved'
        AND lower(m.name) ~ ${PADRAO}
      GROUP BY 1, 2 ORDER BY 3 DESC`;
    const amostra = await sql<{ id: string; vertical: string; tipo: string; name: string; minp: string | number | null }[]>`
      SELECT m.id::text AS id, m.vertical, m.product_type::text AS tipo, m.name,
        (SELECT min(o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0) AS minp
      FROM master_products m
      WHERE (m.attributes ->> 'mergedInto') IS NULL
        AND COALESCE(m.attributes -> 'catalogGate' ->> 'manual', m.attributes -> 'catalogGate' ->> 'verdict', 'approved') = 'approved'
        AND lower(m.name) ~ ${PADRAO}
      ORDER BY m.vertical, m.name LIMIT 400`;
    const linhas = [
      '# Auditoria de poluição por peças/acessórios fora do tipo console (2026-11-13)',
      '',
      'Somente leitura. Critério: nome com palavra de peça/enfeite (motor, abraçadeira, cartela, adesivo, frontal, reposição, carcaça, engrenagem, parafuso, mica, película, bico, correia, ventoinha...) em master hoje liberado. Há falsos positivos esperados (ex.: "bico" e "correia" são peças legítimas em Impressão 3D, onde o tipo Peças e acessórios é do escopo).',
      '',
      '## Contagem por departamento e tipo',
      '',
      '| departamento | tipo | masters |',
      '|---|---|---|',
      ...porVertical.map((r) => `| ${r.vertical} | ${r.tipo} | ${r.n} |`),
      '',
      `## Amostra (até 400)`,
      '',
      '| id | departamento | tipo | menor preço | título |',
      '|---|---|---|---|---|',
      ...amostra.map((r) => `| ${r.id.slice(0, 8)} | ${r.vertical} | ${r.tipo} | ${r.minp == null ? '-' : `R$ ${(Number(r.minp) / 100).toFixed(2)}`} | ${r.name.replace(/\|/g, '/').slice(0, 110)} |`),
      '',
    ];
    const arq = path.resolve('docs/backups', `auditoria-poluicao-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
    fs.writeFileSync(arq, linhas.join('\n'), 'utf8');
    console.log(porVertical.map((r) => `${r.vertical}/${r.tipo}: ${r.n}`).join('\n'));
    console.log('amostra:', amostra.length, '->', path.relative(process.cwd(), arq));
  } finally {
    await sql.end();
  }
})();
