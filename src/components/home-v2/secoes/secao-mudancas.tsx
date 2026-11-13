import { getVitrine } from '@/server/vitrines';
import { ListaMudancas } from '@/components/vitrines/lista-mudancas';

/** Mudanças do menor preço (checklist #10): 8 eventos da vitrine `mudancas`; some se oculta. */
export async function SecaoMudancas() {
  const v = await getVitrine('mudancas');
  if (!v.visivel) return null;
  return <ListaMudancas itens={v.itens} />;
}
