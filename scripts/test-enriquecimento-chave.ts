/** Testes puros do enriquecimento de GTIN/MPN (C13). npx tsx scripts/test-enriquecimento-chave.ts */
import { avaliarEnriquecimento, marcaCompativel, podeJuntarPorChave, type MasterParaEnriquecer } from '../src/lib/catalog/enriquecimento-chave';
import type { MlCatalogPayload } from '../src/lib/catalog/vertical/identity';

let falhas = 0;
const ok = (c: boolean, msg: string) => { if (!c) { falhas++; console.log('FALHOU:', msg); } };
const attr = (id: string, v: string) => ({ id, value_name: v });
const payload = (attrs: Array<{ id: string; value_name: string }>): MlCatalogPayload => ({ id: 'MLB1', attributes: attrs });
const master = (o: Partial<MasterParaEnriquecer> = {}): MasterParaEnriquecer => ({ id: 'm1', nome: 'Headset Gamer Logitech G435', fabricante: null, gtin: null, mpn: null, ...o });
const semDono = () => null;

// GTIN válido (EAN-13) + marca compatível => grava
{
  const r = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('GTIN', '5901234123457')]), semDono);
  ok(r.acao === 'gravar' && r.gtin === '5901234123457', 'grava GTIN válido com marca compatível');
}
// GTIN com dígito verificador errado => ignora
{
  const r = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('GTIN', '5901234123458')]), semDono);
  ok(r.acao === 'ignorar', 'GTIN inválido não grava');
}
// marca incompatível => ignora
{
  const r = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Razer'), attr('GTIN', '5901234123457')]), semDono);
  ok(r.acao === 'ignorar' && r.motivo === 'marca_incompativel', 'marca incompatível barra');
}
// marca genérica => ignora
{
  ok(!marcaCompativel('Genérica', master()), 'marca genérica nunca autoriza');
  ok(!marcaCompativel(null, master()), 'sem marca nunca autoriza');
}
// dois GTINs => ambíguo
{
  const r = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('GTIN', '5901234123457, 4006381333931')]), semDono);
  ok(r.acao === 'ignorar' && r.motivo === 'gtins_ambiguos', 'dois GTINs = ambíguo');
}
// GTIN já em outro master => duplicata (nunca sobrescreve)
{
  const r = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('GTIN', '5901234123457')]), () => 'outro');
  ok(r.acao === 'duplicata' && r.outroMasterId === 'outro', 'GTIN em outro master vira duplicata');
}
// MPN que é UPC válido vira GTIN, não MPN
{
  const r = avaliarEnriquecimento(master({ nome: 'Logitech G435' }), payload([attr('BRAND', 'Logitech'), attr('MPN', '5901234123457')]), semDono);
  ok(r.acao === 'gravar' && r.gtin === '5901234123457' && r.mpn === null, 'MPN numérico válido é tratado como GTIN');
}
// MPN textual => grava MPN
{
  const r = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('MPN', '981-000XYZ')]), semDono);
  ok(r.acao === 'gravar' && r.mpn === '981-000XYZ' && r.gtin === null, 'MPN textual grava com marca compatível');
}
// MPN com lista ou frase não grava
{
  const lista = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('MPN', 'QAU-00055, QAU-00054')]), semDono);
  ok(lista.acao === 'ignorar', 'MPN em lista não grava');
  const frase = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('MPN', 'Headset logitech fon-8679')]), semDono);
  ok(frase.acao === 'ignorar', 'MPN em frase não grava');
}
// MPN lixo
{
  const r = avaliarEnriquecimento(master(), payload([attr('BRAND', 'Logitech'), attr('MPN', 'N/A')]), semDono);
  ok(r.acao === 'ignorar', 'MPN lixo ignora');
}
// já tem os dois
{
  const r = avaliarEnriquecimento(master({ gtin: '1', mpn: '2' }), payload([attr('BRAND', 'Logitech')]), semDono);
  ok(r.acao === 'ignorar' && r.motivo === 'ja_tem_gtin_e_mpn', 'já tem GTIN e MPN');
}
// juntar por chave forte: só com modelo idêntico
{
  const base = { vertical: 'games', tipo: 'game', plataforma: 'ps5' };
  ok(podeJuntarPorChave({ id: 'a', nome: 'God of War Ragnarok PS5', ...base }, { id: 'b', nome: 'God Of War Ragnarök Ps5 Mídia Física', ...base }).ok, 'mesmo jogo, mesmos tokens de modelo');
  ok(!podeJuntarPorChave({ id: 'a', nome: 'Headset Logitech G435', vertical: 'tecnologia', tipo: 'general', plataforma: null }, { id: 'b', nome: 'Headset Logitech G435s', vertical: 'tecnologia', tipo: 'general', plataforma: null }).ok, 'sufixo de modelo parecido fica separado');
  ok(!podeJuntarPorChave({ id: 'a', nome: 'FIFA 24 PS5', ...base }, { id: 'b', nome: 'FIFA 24 PS4', ...base, plataforma: 'ps4' }).ok, 'plataforma diferente fica separada');
  ok(!podeJuntarPorChave({ id: 'a', nome: 'SSD 1TB', vertical: 'tecnologia', tipo: 'general', plataforma: null }, { id: 'b', nome: 'SSD 2TB', vertical: 'tecnologia', tipo: 'general', plataforma: null }).ok, 'capacidade diferente fica separada');
  ok(!podeJuntarPorChave({ id: 'a', nome: 'X', ...base }, { id: 'a', nome: 'X', ...base }).ok, 'mesmo master não junta');
}
console.log(falhas === 0 ? 'test-enriquecimento-chave: todos ok' : `test-enriquecimento-chave: ${falhas} falhas`);
process.exit(falhas === 0 ? 0 : 1);
