import { getVitrine } from '@/server/vitrines';
import { departamentoPorSlug } from '@/lib/catalog/departamentos';
import { CartaoSimples, GRADE_SIMPLES, SessaoSimples } from './cartao-simples';

/**
 * Faixa Geek Plus da nova landing (checklist #12). Um produto por departamento LIBERADO ao público; SEM selo e SEM média (R-36).
 * Decisão de comportamento: com menos de 4 departamentos liberados (hoje nenhum) a faixa SOME inteira. Não há convite
 * improvisado nem produto inventado: o acesso ao Plus continua no menu e em /plus. O cartão leva ao departamento (/mercado/<dept>).
 */
export async function FaixaPlus() {
  const v = await getVitrine('plus');
  if (!v.visivel) return null;
  return (
    <SessaoSimples id="faixa-plus" titulo="Espaço Geek Plus" subtitulo="Um achado de cada departamento além de games, com o menor preço do momento.">
      <ul className={GRADE_SIMPLES}>
        {v.itens.map((item) => {
          const dept = item.departamento;
          if (!dept) return null;
          const rotulo = departamentoPorSlug(dept)?.rotulo ?? dept;
          return (
            <li key={item.masterProductId}>
              <CartaoSimples item={item} href={`/mercado/${dept}`} rotulo={rotulo} />
            </li>
          );
        })}
      </ul>
    </SessaoSimples>
  );
}
