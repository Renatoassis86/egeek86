import { getVitrine } from '@/server/vitrines';
import { formatBRL } from '@/lib/format';
import { CartaoSimples, GRADE_SIMPLES, SessaoSimples } from './cartao-simples';

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** Sessão "Menor preço registrado" (checklist #13): preço agora no menor já registrado (régua de 3%), corroborado por 2 vendedores. Some com menos de 4. */
export async function MenorRegistrado() {
  const v = await getVitrine('menor-registrado');
  if (!v.visivel) return null;
  return (
    <SessaoSimples id="menor-registrado" titulo="No menor preço registrado" subtitulo="Preço de agora igual ao menor já visto, confirmado por pelo menos 2 vendedores.">
      <ul className={GRADE_SIMPLES}>
        {v.itens.map((item) => (
          <li key={item.masterProductId}>
            <CartaoSimples
              item={item}
              detalhe={item.menorRegistrado ? `Menor registrado: ${formatBRL(item.menorRegistrado.centavos)} (${DATA.format(new Date(item.menorRegistrado.em))})` : null}
            />
          </li>
        ))}
      </ul>
    </SessaoSimples>
  );
}
