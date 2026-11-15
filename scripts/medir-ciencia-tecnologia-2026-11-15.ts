/** #60 (2026-11-15): mede masters/ofertas de ciência, tecnologia industrial e demais itens de tecnologia. SOMENTE SELECT. */
import { connect } from './_dup-shared';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';

export {};
const TERMOS: Record<string, string> = {
  microscopio: 'microscopi', telescopio: 'telescopi', multimetro: 'multimetro|multímetro', osciloscopio: 'osciloscopi', paquimetro: 'paqu[ií]metro|micr[oô]metro',
  balanca: 'balan[cç]a (de )?(precis|anal[ií]tic|digital)', termometro_iv: 'term[oô]metro (infra|digital|laser)|pir[oô]metro', arduino: 'arduino|esp32|esp8266|raspberry|pico w|stm32|micro:?bit|jetson',
  sensor_kit: 'kit (de )?(sensores|eletr[oô]nica|rob[oó]tica)|m[oó]dulo sensor', fonte_bancada: 'fonte (de )?(bancada|ajust[aá]vel)|esta[cç][aã]o de solda|ferro de solda|soldador|esta[cç][aã]o de retrabalho',
  scanner3d: 'scanner 3d|escaner 3d', cnc: '\mcnc\M|router cnc|fresadora|grav(ador|adora) a laser|laser (cortador|gravador)|cortadora (a )?laser|plotter|cortadora de vinil|silhouette|cricut',
  ferramenta: 'furadeira|parafusadeira|esmerilhadeira|serra (tico|circular|marmore|sabre)|lixadeira|plaina|retifica|micro ret[ií]fica|dremel|compressor|soprador t[eé]rmico|pistola de calor',
  drone: '\mdrone', iot: 'sonoff|shelly|zigbee|gateway|raspberry|automa[cç][aã]o|clp|rel[eé] inteligente|tuya',
  rede: 'roteador|switch|access point|servidor|nas |synology|ubiquiti|mikrotik|tp-?link', armazenamento: 'ssd|hd externo|pendrive|cart[aã]o de mem[oó]ria|nas ',
  pc: 'placa m[aã]e|placa de v[ií]deo|processador|mem[oó]ria ram|fonte atx|gabinete', celular: 'smartphone|celular|tablet|smartwatch|iphone|galaxy',
  impressora: 'impressora|multifuncional|etiquetas|t[eé]rmica', lupa: 'lupa|estere[oó]scopi|bin[oó]culo|lunete',
  eletronica: 'protoboard|soldagem|estanho|multiteste|gerador de fun|analisador l[oó]gico|c[aâ]mera t[eé]rmica|detector',
};
async function main() {
  const sql = connect();
  try {
    console.log('== masters por vertical x gate ==');
    console.table(await sql`SELECT vertical, COALESCE(attributes->'catalogGate'->>'verdict','(sem)') AS gate, count(*)::int n FROM master_products GROUP BY 1,2 ORDER BY 1,2`);
    console.log('== por termo (todas as verticais): masters por gate; ofertas ativas ==');
    const out: any[] = [];
    for (const [k, re] of Object.entries(TERMOS)) {
      const rows = await sql<{ vertical: string; gate: string; n: number; ativos: number; ofertas: number }[]>`
        SELECT m.vertical, COALESCE(m.attributes->'catalogGate'->>'verdict','(sem)') gate, count(*)::int n,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id=m.id AND o.status='active'))::int ativos,
               COALESCE(sum((SELECT count(*) FROM affiliate_offers o WHERE o.master_product_id=m.id AND o.status='active')),0)::int ofertas
        FROM master_products m WHERE lower(m.name) ~ ${re.toLowerCase()} GROUP BY 1,2 ORDER BY 1,2`;
      for (const r of rows) out.push({ termo: k, ...r });
    }
    console.table(out);
    if (process.argv.includes('--amostra')) {
      const t = process.argv[process.argv.indexOf('--amostra') + 1];
      const re = TERMOS[t];
      const rows = await sql`SELECT m.vertical, m.attributes->'catalogGate'->>'verdict' gate, m.attributes->'catalogGate'->>'reason' motivo, left(m.name,90) nome FROM master_products m WHERE lower(m.name) ~ ${re.toLowerCase()} LIMIT 40`;
      console.table(rows);
    }
    console.log('== tecnologia aprovados/visíveis por tipo ==');
    const tec = await sql<{ name: string }[]>`SELECT name FROM master_products WHERE vertical='tecnologia' AND attributes->'catalogGate'->>'verdict'='approved'`;
    const c = new Map<string, number>();
    for (const t of tec) { const s = classificarTipo('tecnologia', t.name); c.set(s, (c.get(s) ?? 0) + 1); }
    console.table([...c.entries()].sort((a, b) => b[1] - a[1]).map(([tipo, n]) => ({ tipo, n })));
  } finally { await sql.end(); }
}
main();
