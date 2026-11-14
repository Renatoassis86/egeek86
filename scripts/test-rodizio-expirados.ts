/** Testes puros do rodízio de reconferência das expiradas do ML (C6). npx tsx scripts/test-rodizio-expirados.ts */
import { escolherRodizio, prioridadeRodizio, rodizioConfig, rodizioSelectSql, type RodizioCandidato } from '../src/lib/affiliate/rodizio-expirados';

let ok = 0, falhas = 0;
const t = (nome: string, cond: boolean) => { if (cond) ok++; else { falhas++; console.error('FALHOU:', nome); } };

const c = (id: string, ref: string, nome: string, tipo: string, chk: number | null, vert = 'games'): RodizioCandidato => ({
  id, externalRef: ref, networkId: 'n1', networkSlug: 'mercado-livre', masterProductId: 'm' + id, masterName: nome,
  productType: tipo, vertical: vert, lastCheckedAt: chk == null ? null : new Date(chk),
});

// Config: desligado por padrão, valores saneados.
t('desligado por padrão', rodizioConfig({}).ativo === false);
t('liga com on', rodizioConfig({ COLLECT_RODIZIO_EXPIRADOS: 'on' }).ativo === true);
t('porRun padrão 20', rodizioConfig({}).porRun === 20);
t('porRun limitado a 60', rodizioConfig({ COLLECT_RODIZIO_POR_RUN: '999' }).porRun === 60);
t('porRun inválido volta ao padrão', rodizioConfig({ COLLECT_RODIZIO_POR_RUN: 'abc' }).porRun === 20);
t('horas padrão 12', rodizioConfig({}).horasEntreChecagens === 12);

// SQL: inteiros inline, sem marcadores sobrando.
const q = rodizioSelectSql(12.9, 80.7);
t('sql sem marcador', !q.includes('__'));
t('sql inteiros', q.includes('hours => 12') && q.includes('LIMIT 80'));
t("sql só expired", q.includes("o.status = 'expired'") && !q.includes("'paused'"));
t('sql exige approved', q.includes("'approved'"));
t('sql ordena por prioridade antes do limite', q.indexOf('t.prio') < q.indexOf('LIMIT') && q.includes("'impressao3d'") && q.includes('kobra|bambu'));

// Prioridade.
t('3D Kobra primeiro', prioridadeRodizio({ vertical: 'impressao3d', masterName: 'Impressora 3D Anycubic Kobra S1', productType: 'general' }) === 0);
t('3D Bambu primeiro', prioridadeRodizio({ vertical: 'impressao3d', masterName: 'Bambu Lab A1 Combo', productType: 'general' }) === 0);
t('jogo 1', prioridadeRodizio({ vertical: 'games', masterName: 'Elden Ring PS5', productType: 'game' }) === 1);
t('console 1', prioridadeRodizio({ vertical: 'games', masterName: 'Console PS5', productType: 'console' }) === 1);
t('acessório 2', prioridadeRodizio({ vertical: 'games', masterName: 'Controle', productType: 'accessory' }) === 2);

// Escolha: ordem, dedupe, fila normal, retrô, limite.
const lista = [
  c('1', 'A', 'Acessorio PS5', 'accessory', 100),
  c('2', 'B', 'Jogo Novo PS5', 'game', 500),
  c('3', 'C', 'Jogo Velho PS5', 'game', 50),
  c('4', 'D', 'Jogo nunca checado PS5', 'game', null),
  c('5', 'C', 'Jogo Velho PS5 (outra oferta do mesmo catalogo)', 'game', 10),
  c('6', 'E', 'FIFA 14 Xbox 360', 'game', null),
  c('7', 'F', 'Jogo na fila normal PS5', 'game', null),
];
const esc = escolherRodizio(lista, { limite: 10, catalogosNaFila: new Set(['n1:F']) });
t('nunca checado vem antes', esc[0]?.id === '4');
t('mais velho antes do novo', esc.findIndex((x) => x.id === '3') < esc.findIndex((x) => x.id === '2'));
t('acessório depois dos jogos', esc[esc.length - 1]?.id === '1');
t('sem catálogo repetido', new Set(esc.map((x) => x.externalRef)).size === esc.length);
t('retrô/fora de linha fora', !esc.some((x) => x.id === '6'));
t('catálogo da fila normal fora', !esc.some((x) => x.id === '7'));
t('limite respeitado', escolherRodizio(lista, { limite: 2 }).length === 2);

console.log(`test-rodizio-expirados: ${ok}/${ok + falhas} ok`);
process.exit(falhas ? 1 : 0);
