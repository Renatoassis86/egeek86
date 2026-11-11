/**
 * TESTE DA APROVAÇÃO EM BLOCO DE IMPRESSÃO 3D (plano 2026-11-11, A4). Puro, sem banco e sem rede. Uso:
 *   npx tsx --conditions=react-server scripts/test-impressao3d-aprovacao.ts
 */
import { avaliarImpressao3d, diametroDe, massaOuVolumeDe, materialDe, tipoResinaDe, type CandidatoI3d, type OfertaCandidata } from '../src/lib/catalog/aprovacao-impressao3d';

let total = 0;
let fails = 0;
function check(nome: string, cond: boolean, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.log(`FALHA: ${nome}`, extra ?? '');
  }
}

const of = (price: number, rep: string | null = '5_green', sales = 1000, title = '3d Pla Uv 1kg', quarentena = false): OfertaCandidata => ({ priceCents: price, networkSlug: 'mercado-livre', quarentena, sellerReputation: rep, sellerSales: sales, title });
const base = (o: Partial<CandidatoI3d>): CandidatoI3d => ({
  id: 'id', name: 'Impressora 3d Bambu Lab A1', segment: 'impressora-3d', vertical: 'impressao3d', manufacturer: 'Bambu Lab', mpn: null, hasImage: true,
  gate: { verdict: 'review', suggested: 'approved' }, catalogAttributes: { BRAND: 'Bambu Lab', MODEL: 'A1' }, ofertas: [of(300000)], duplicado: false, ...o,
});
const motivos = (c: CandidatoI3d) => avaliarImpressao3d(c).motivos;

// extratores
check('material PLA', materialDe('Filamento Pla 1,75mm 1kg') === 'PLA');
check('material PLA+', materialDe('Filamento PLA+ 1kg') === 'PLA+' && materialDe('Filamento Pla Plus 1kg') === 'PLA+');
check('material PETG antes de PLA', materialDe('Filamento Petg 1kg') === 'PETG');
check('material ausente', materialDe('Filamento 3d 1kg 1.75mm') === null);
check('diametro 1,75', diametroDe('Filamento Pla 1,75mm') === '1.75mm' && diametroDe('Filamento Pla 1.75 1kg') === '1.75mm');
check('diametro 2,85', diametroDe('Filamento Abs 2.85mm') === '2.85mm');
check('diametro ausente', diametroDe('Filamento Pla 1kg') === null);
check('massa 1kg ignorando o diametro', massaOuVolumeDe('Filamento Pla 1.75mm 1kg') === '1kg');
check('massa 500 g', massaOuVolumeDe('Filamento Petg 500 g 1,75mm') === '500g');
check('massa ambigua => null', massaOuVolumeDe('Filamento Pla 1kg ou 500g') === null);
check('volume ml', massaOuVolumeDe('Resina 3d Uv 500ml') === '500ml');
check('tipo de resina', tipoResinaDe('Resina 3d Standard 1kg') === 'standard' && tipoResinaDe('Resina Abs-like 1kg') === 'abs-like' && tipoResinaDe('Resina 3d Uv 1kg') === null);

// impressora
check('impressora completa aprova', avaliarImpressao3d(base({})).aprovavel, motivos(base({})));
check('impressora sem modelo => review', motivos(base({ catalogAttributes: { BRAND: 'Bambu Lab' } })).includes('modelo_ausente'));
check('impressora sem marca => review', motivos(base({ manufacturer: null, catalogAttributes: { MODEL: 'A1' } })).includes('marca_ausente'));
check('impressora combo continua aprovavel (variante)', avaliarImpressao3d(base({ name: 'Impressora 3d Bambu Lab P1s Combo' })).aprovavel);

// filamento
const fil = (name: string, extra: Partial<CandidatoI3d> = {}) => base({ name, segment: 'filamento-3d', catalogAttributes: { BRAND: 'Creality', MODEL: 'Hyper PLA' }, manufacturer: 'Creality', ...extra });
check('filamento completo aprova', avaliarImpressao3d(fil('Filamento Pla 1,75mm 1kg Creality Hyper')).aprovavel, motivos(fil('Filamento Pla 1,75mm 1kg Creality Hyper')));
check('filamento sem material => review', motivos(fil('Filamento 3d 1,75mm 1kg Creality', { catalogAttributes: { BRAND: 'Creality' } })).includes('material_ausente'));
check('filamento sem diametro => review', motivos(fil('Filamento Pla 1kg Creality', { catalogAttributes: { BRAND: 'Creality' } })).includes('diametro_ausente'));
check('filamento sem massa => review', motivos(fil('Filamento Pla 1,75mm Creality', { catalogAttributes: { BRAND: 'Creality' } })).includes('massa_ausente_ou_ambigua'));
check('filamento: cor nao e criterio (preto/branco aprovam igual)', avaliarImpressao3d(fil('Filamento Pla 1,75mm 1kg Preto')).aprovavel && avaliarImpressao3d(fil('Filamento Pla 1,75mm 1kg Branco')).aprovavel);
check('filamento caneta 3d => fora', motivos(fil('Filamento Pla para Caneta 3d 1,75mm 1kg')).some((m) => m.startsWith('escopo:')));

// resina
const res = (name: string) => base({ name, segment: 'resina-3d', catalogAttributes: { BRAND: 'Elegoo' }, manufacturer: 'Elegoo' });
check('resina completa aprova', avaliarImpressao3d(res('Resina 3d Uv Standard 1kg Elegoo')).aprovavel, motivos(res('Resina 3d Uv Standard 1kg Elegoo')));
check('resina sem tipo => review', motivos(res('Resina 3d Uv 1kg Elegoo')).includes('tipo_de_resina_ausente'));
check('resina sem volume => review', motivos(res('Resina 3d Uv Standard Elegoo')).includes('volume_ausente_ou_ambiguo'));
check('resina epoxi => fora do escopo', motivos(res('Resina Epoxi Standard 1kg')).some((m) => m.startsWith('escopo:')));

// comuns
check('usado => rejeitavel e nao aprova', (() => { const a = avaliarImpressao3d(base({ name: 'Impressora 3d Ender 3 Usada' })); return !a.aprovavel && a.rejeitavel; })());
check('open box na oferta => nao aprova', !avaliarImpressao3d(base({ ofertas: [of(300000, '5_green', 1000, 'Impressora 3d Open Box')] })).aprovavel);
check('sem foto => review', motivos(base({ hasImage: false })).includes('sem_foto'));
check('duplicata => review', motivos(base({ duplicado: true })).includes('possivel_duplicata'));
check('sem oferta => review', motivos(base({ ofertas: [] })).includes('sem_oferta_ativa_ml_ou_shopee'));
check('oferta em quarentena nao conta', motivos(base({ ofertas: [of(300000, '5_green', 1000, 'x', true)] })).includes('sem_oferta_ativa_ml_ou_shopee'));
check('vendedor sem reputacao => review', motivos(base({ ofertas: [of(300000, null, 0)] })).includes('sem_vendedor_com_reputacao_aceita'));
check('vendedor 4_light_green com 50 vendas passa', avaliarImpressao3d(base({ ofertas: [of(300000, '4_light_green', 50)] })).aprovavel);
check('vendedor 3_yellow nao passa', motivos(base({ ofertas: [of(300000, '3_yellow', 9999)] })).includes('sem_vendedor_com_reputacao_aceita'));
check('amplitude > 3x => review', motivos(base({ ofertas: [of(100000), of(400000)] })).includes('amplitude_acima_de_3x'));
check('amplitude 1,4x passa', avaliarImpressao3d(base({ ofertas: [of(689900), of(949999)] })).aprovavel);
check('ja aprovado nao reaprova', motivos(base({ gate: { verdict: 'approved', suggested: 'approved' } })).includes('ja_aprovado'));
check('porteiro sem evidencia positiva => review', motivos(base({ gate: { verdict: 'review', suggested: 'review' } })).includes('sem_evidencia_positiva_do_porteiro'));
check('peca (segmento sem regra) fica para a proxima onda', motivos(base({ segment: 'peca-impressora-3d' })).includes('segmento_sem_regra_nesta_onda'));
check('vertical errada nao aprova', motivos(base({ vertical: 'tecnologia' })).includes('vertical_diferente_de_impressao3d'));
check('palavra proibida', motivos(base({ name: 'Impressora 3d Bambu Lab A1 afiliado' })).includes('palavra_proibida'));
check('atributo unknown => review', motivos(base({ catalogAttributes: { BRAND: 'Bambu Lab', MODEL: 'A1', COLOR: 'unknown' } })).includes('atributo_unknown'));

console.log(`${total - fails}/${total} verificacoes passaram`);
if (fails > 0) process.exit(1);
