import { getVitrine } from '@/server/vitrines';
import { VitrineOfertas } from '@/components/vitrines/vitrine-ofertas';
import { VITRINE_REGRAS } from '@/lib/vitrines/regras';

/** Quadro de destaques (checklist #10): 12 itens da vitrine `destaques`; some inteiro se a vitrine vier oculta. */
export async function SecaoDestaques() {
  const v = await getVitrine('destaques');
  if (!v.visivel) return null;
  return (
    <VitrineOfertas
      id="destaques"
      titulo="Melhores ofertas agora"
      subtitulo="Maiores quedas reais sobre a média das lojas, com preço lido nas últimas 6 horas."
      itens={v.itens}
      variante="grade"
      limite={VITRINE_REGRAS.DESTAQUES}
      hrefVerTudo="/ofertas"
      reducaoResponsiva
      prioridadePrimeiro
    />
  );
}
