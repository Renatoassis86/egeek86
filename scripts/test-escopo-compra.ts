/**
 * Testes puros da função de escopo de compra real das lojas Plus (ata 2026-11-12).
 * FIXTURES: valores abaixo são EXEMPLOS DE TESTE para exercitar as regras; não são dados de catálogo.
 * Uso: npx tsx scripts/test-escopo-compra.ts   (código 1 se algo falhar)
 */
import { escopoCompra, mediana, pisoCents, VERSAO_REGRA_ESCOPO, type EntradaEscopo } from '../src/lib/catalog/escopo-compra';

let fails = 0;
const check = (n: string, c: boolean, extra?: unknown) => { if (!c) { fails++; console.log(`FALHA: ${n}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } };
const R = (v: number) => Math.round(v * 100);
const e = (departamento: string, tipo: string, preco: number, nOfertas: number, nVendedores: number, extra: Partial<EntradaEscopo> = {}): EntradaEscopo =>
  ({ departamento, tipo, precoMedianoCents: R(preco), nOfertas, nVendedores, ...extra });
const dentro = (n: string, x: EntradaEscopo) => { const r = escopoCompra(x); check(`dentro: ${n}`, r.dentro, r); };
const fora = (n: string, x: EntradaEscopo, motivo: string) => { const r = escopoCompra(x); check(`fora(${motivo}): ${n}`, !r.dentro && r.motivo === motivo, r); };

// R1 tipo excluído por inteiro, qualquer preço/demanda
fora('cabo caro e popular', e('eletroeletronicos', 'cabos-acessorios', 900, 40, 20), 'tipo_excluido');
fora('cabo barato', e('eletroeletronicos', 'cabos-acessorios', 8, 3, 2), 'tipo_excluido');
// R2 pisos por tipo
fora('fone R$28', e('eletroeletronicos', 'fones', 28, 3, 2), 'abaixo_do_piso');
dentro('fone R$100', e('eletroeletronicos', 'fones', 100, 1, 1, { maxVendasVendedor: 5000 }));
fora('carregador R$45', e('eletroeletronicos', 'carregadores', 45, 4, 2), 'abaixo_do_piso');
fora('eletrônico outros R$60 (rede de segurança R$100)', e('eletroeletronicos', 'outros', 60, 4, 3), 'abaixo_do_piso');
fora('casa R$80', e('eletrodomesticos', 'ventilador', 80, 4, 3), 'abaixo_do_piso');
dentro('casa R$129', e('eletrodomesticos', 'ventilador', 129, 3, 2));
fora('bola R$25', e('esporte', 'bola', 25, 4, 3), 'abaixo_do_piso');
dentro('bola R$119', e('esporte', 'bola', 119, 1, 2));
fora('caneleira R$20', e('esporte', 'protecao', 20, 3, 2), 'abaixo_do_piso');
fora('corda R$20', e('esporte', 'fitness', 20, 3, 2), 'abaixo_do_piso');
fora('meia R$25', e('esporte', 'meias-roupas', 25, 3, 2), 'abaixo_do_piso');
fora('garrafa R$30', e('esporte', 'garrafas', 30, 3, 2), 'abaixo_do_piso');
dentro('halter R$40 (sem piso, com demanda)', e('esporte', 'halter-peso', 40, 3, 2));
dentro('livro RPG R$22 com 1 oferta (sem piso, sem demanda)', e('livros', 'rpg', 22, 1, 1));
dentro('filamento R$105 1 oferta', e('impressao3d', 'filamentos', 105, 1, 1));
dentro('resina R$90 1 oferta', e('impressao3d', 'resinas', 90, 1, 1));
fora('peça 3D R$30', e('impressao3d', 'pecas', 30, 3, 2), 'abaixo_do_piso');
fora('mouse R$40', e('tecnologia', 'mouse', 40, 3, 2), 'abaixo_do_piso');
dentro('ssd R$150 sem piso', e('tecnologia', 'ssd-hd', 150, 3, 2));
// R4 exceção ao piso
dentro('bola R$25 com 5 ofertas e 3 vendedores', e('esporte', 'bola', 25, 5, 3));
fora('bola R$25 com 5 ofertas e 2 vendedores', e('esporte', 'bola', 25, 5, 2), 'abaixo_do_piso');
// R3 demanda só abaixo de R$300
dentro('halter R$80, 1 oferta e 1 vendedor (produto unico e bem-vindo)', e('esporte', 'halter-peso', 80, 1, 1));
dentro('halter R$80, 3 ofertas', e('esporte', 'halter-peso', 80, 3, 1));
dentro('halter R$80, 2 vendedores', e('esporte', 'halter-peso', 80, 2, 2));
dentro('ssd R$150, 1 oferta (produto unico)', e('tecnologia', 'ssd-hd', 150, 1, 1));
dentro('fone R$120 vendedor grande, 1 oferta (só fones/mouse/headset)', e('eletroeletronicos', 'fones', 120, 1, 1, { maxVendasVendedor: 1500 }));
dentro('ssd R$150 vendedor grande, 1 oferta', e('tecnologia', 'ssd-hd', 150, 1, 1, { maxVendasVendedor: 9000 }));
dentro('fone R$120 vendedor pequeno, 1 oferta', e('eletroeletronicos', 'fones', 120, 1, 1, { maxVendasVendedor: 3 }));
// ticket alto nunca barrado (1 oferta, 1 vendedor)
for (const [d, t, p] of [['eletroeletronicos', 'smart-tv', 2670], ['eletrodomesticos', 'geladeira-freezer', 3356], ['tecnologia', 'notebook', 3500], ['impressao3d', 'impressoras', 1800], ['esporte', 'esteira-eliptico', 1832], ['eletroeletronicos', 'outros', 300], ['esporte', 'tenis-calcado', 450]] as const)
  dentro(`ticket alto ${t} R$${p}`, e(d, t, p, 1, 1));
// Fronteira de R$300
dentro('R$300 exato com 1 oferta', e('tecnologia', 'ssd-hd', 300, 1, 1));
dentro('R$299,99 com 1 oferta', e('tecnologia', 'ssd-hd', 299.99, 1, 1));
// R5 anomalia: >10x a mediana do tipo => fora + revisão (vale até para ticket alto)
{
  const r = escopoCompra(e('eletrodomesticos', 'lavadora-secadora', 1_800_000, 2, 2, { medianaTipoCents: R(2500) }));
  check('anomalia vai para revisão', !r.dentro && r.motivo === 'preco_anomalo' && r.revisao, r);
  const r2 = escopoCompra(e('eletrodomesticos', 'lavadora-secadora', 24_000, 2, 2, { medianaTipoCents: R(2500) }));
  check('9,6x não é anomalia', r2.dentro, r2);
  const rc = escopoCompra(e('eletrodomesticos', 'cafeteira', 3512, 7, 7, { medianaTipoCents: R(150) }));
  check('produto caro legitimo de tipo barato (30x a mediana, abaixo de R$50 mil) nao e anomalia', rc.dentro, rc);
  const r3 = escopoCompra(e('eletrodomesticos', 'lavadora-secadora', 2500, 1, 1, { medianaTipoCents: null }));
  check('sem mediana do tipo não decide anomalia', r3.dentro, r3);
}
// Sem preço / games
dentro('sem preço', { departamento: 'esporte', tipo: 'bola', precoMedianoCents: null, nOfertas: 0, nVendedores: 0 });
dentro('games nunca', e('games', 'outros', 5, 1, 1));
// Versão e helpers
check('versão >= 1', VERSAO_REGRA_ESCOPO >= 1);
check('piso bola', pisoCents('esporte', 'bola') === 6000);
check('piso halter ausente', pisoCents('esporte', 'halter-peso') === null);
check('mediana', mediana([1, 3]) === 2 && mediana([5, 1, 3]) === 3 && mediana([]) === null);

if (fails) { console.log(`${fails} falha(s)`); process.exit(1); }
console.log('OK: escopo de compra');
