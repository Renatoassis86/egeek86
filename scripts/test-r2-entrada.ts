/**
 * Testes das decisões do dono de 2026-11-14 sobre a ENTRADA de itens (R2-6, R2-13, R2-16): só usado e retrô barram; dúvida de identidade vira grupo próprio.
 *   npx tsx scripts/test-r2-entrada.ts
 */
import { usadoLidoNaPagina } from '../src/lib/catalog/usado-lido-na-pagina';
import { liberarDuvidaComoNaoIdentificado, entryGateAttributes } from '../src/lib/catalog/gate';
import { avaliarItemMiudo } from '../src/lib/catalog/item-miudo';

let falhas = 0;
let total = 0;
function check(nome: string, ok: boolean) { total++; if (!ok) { falhas++; console.log('FALHA:', nome); } }

// R2-13: usado lido no box de compra
check('Usado - Como novo', usadoLidoNaPagina('Comprar agora Usado - Como novo Enviado por Amazon Vendido por Amazon Quase Novo').usado);
check('Amazon Quase Novo', usadoLidoNaPagina('Vendido por Amazon Quase Novo').usado);
check('Warehouse', usadoLidoNaPagina('Enviado por Amazon Warehouse').usado);
check('Reembalado', usadoLidoNaPagina('Produto reembalado, condição boa').usado);
check('Condição: Usado', usadoLidoNaPagina('Condição: Usado').usado);
check('box de novo não é usado', !usadoLidoNaPagina('Comprar agora R$ 159,90 Enviado por Amazon Vendido por Amazon').usado);
check('link "Novos e usados" não conta', !usadoLidoNaPagina('Novos e usados: 2 a partir de R$ 120,00 Comprar agora Vendido por Amazon').usado);
check('texto vazio/indefinido', !usadoLidoNaPagina('').usado && !usadoLidoNaPagina(undefined).usado && !usadoLidoNaPagina(null).usado);

// R2-6: dúvida de identidade vira grupo próprio aprovado, nunca rejeitado
const duvida = entryGateAttributes('Forza Horizon 4 - XBOX ONE/SERIES X - Original', 'game');
const dg = (duvida.catalogGate as { verdict?: string } | undefined)?.verdict;
check('cross-gen nasce em revisão no porteiro', dg === 'review');
const lib = liberarDuvidaComoNaoIdentificado(duvida, 'auto:teste', '2026-11-14T00:00:00.000Z') as { catalogGate: { verdict: string; reason: string; previousVerdict?: string; approvedBy?: string }; identidade?: { estado: string; motivo: string } };
check('liberado como aprovado', lib.catalogGate.verdict === 'approved');
check('motivo guarda a origem', lib.catalogGate.reason === 'nao_identificado:geracao_ambigua');
check('guarda veredito anterior e autor', lib.catalogGate.previousVerdict === 'review' && lib.catalogGate.approvedBy === 'auto:teste');
check('marca identidade nao_identificado (grupo próprio)', lib.identidade?.estado === 'nao_identificado' && lib.identidade?.motivo === 'geracao_ambigua');
const aprovado = entryGateAttributes('Mario Kart World - Nintendo Switch 2', 'game');
check('aprovado nao é alterado', liberarDuvidaComoNaoIdentificado(aprovado) === aprovado);
const usado = entryGateAttributes('Jogo Fifa 23 PS5 Usado Seminovo', 'game');
const ug = (usado.catalogGate as { verdict?: string } | undefined)?.verdict;
check('usado continua rejeitado e NÃO é liberado', ug === 'rejected' && (liberarDuvidaComoNaoIdentificado(usado).catalogGate as { verdict: string }).verdict === 'rejected');
const retro = entryGateAttributes('Jogo Super Mario World Super Nintendo SNES Original', 'game');
check('retrô continua rejeitado e NÃO é liberado', (retro.catalogGate as { verdict?: string } | undefined)?.verdict === 'rejected' && (liberarDuvidaComoNaoIdentificado(retro).catalogGate as { verdict: string }).verdict === 'rejected');

// R2-16: caneleira (esporte) não é miúdo; power bank segue como acessório menor
for (const [t, p] of [['Caneleira Futebol Penalty Matis Tamanho Juvenil', 2990], ['Caneleira Futebol F24 Infantil', 1590], ['Tornozeleira Peso 3 Kg - Academia - Preta', 4990], ['Caneleira De Peso 2kg Rosa Par Tornozeleira', 3990]] as const) {
  const r = avaliarItemMiudo(t, p, 'general', 'esporte');
  check(`${t} não é miúdo nem dúvida (esporte)`, r.veredito === 'nao');
}
const pb = avaliarItemMiudo('Power Bank Portátil 20000mAh Rápido Carregador USB', 4990, 'general', 'eletroeletronicos');
check('power bank continua fora (miúdo)', pb.veredito !== 'nao');

console.log(`test-r2-entrada: ${total - falhas}/${total} ok`);
process.exit(falhas ? 1 : 0);
