// Sem 'server-only': lista de exclusao PURA da vitrine Acessorios na landing (checklist #13). Aplicada no CONSUMO enquanto o filtro
// nao existe no backend (pedido registrado no CHECKLIST, "Suporte de dados"). Rodar a revisao do guardiao-catalogo antes de ligar a flag.
import type { VitrineItem } from '@/lib/vitrines/tipos';

/** Itens genericos que nao representam um acessorio de console (consumiveis, organizacao, cabos soltos, kits sem marca). */
const GENERICO_RE =
  /\b(pilhas?|baterias?|organiza\w*|suportes?|expositor\w*|display|prateleira|nicho|cabos?|adaptador\w*|extensor\w*|pel[ií]cula|capa|case|skin|grip|protetor\w*|kit\s*\d|kit\s+de|conjunto\s+de|limpeza|etiqueta|adesivo\w*)\b/i;

/** Marcas e linhas que o catalogo trata como acessorio de console de verdade. Sem uma delas no titulo, o item nao vai ao ar. */
const MARCA_RE =
  /\b(dualsense|dualshock|playstation|sony|pulse\s*3d|pro\s*controller|joy-?con|nintendo|xbox\s*wireless|elite\s*series|powera|8bitdo|hori|razer|logitech|steelseries|hyperx|turtle\s*beach|corsair|redragon|thrustmaster|meta\s*quest|steam\s*deck|rog\s*ally)\b/i;

export function acessorioDeVerdade(titulo: string): boolean {
  return !GENERICO_RE.test(titulo) && MARCA_RE.test(titulo);
}

export function filtrarAcessorios(itens: readonly VitrineItem[]): VitrineItem[] {
  return itens.filter((i) => acessorioDeVerdade(i.titulo));
}
