import { getVitrine } from '@/server/vitrines';
import { VITRINE_REGRAS } from '@/lib/vitrines/regras';
import { filtrarAcessorios } from './filtro-acessorios';
import { CartaoSimples, GRADE_SIMPLES, SessaoSimples } from './cartao-simples';

/**
 * Sessões "Acessórios" e "Colecionáveis" (checklist #13). Acessórios: aplica a lista de exclusão do consumo (pilhas, organizadores,
 * cabos e kits sem marca NÃO vão ao ar; ver filtro-acessorios.ts) e some com menos de 4 itens. Colecionáveis: o backend ainda não tem fonte
 * (não é tipo público do catálogo), então a vitrine vem oculta e a sessão não renderiza.
 */
export async function AcessoriosColecionaveis() {
  const [ac, co] = await Promise.all([getVitrine('acessorios'), getVitrine('colecionaveis')]);
  const acessorios = ac.visivel ? filtrarAcessorios(ac.itens) : [];
  const mostraAcessorios = acessorios.length >= VITRINE_REGRAS.MIN_ITENS;
  const mostraColecionaveis = co.visivel && co.itens.length >= VITRINE_REGRAS.MIN_ITENS;
  if (!mostraAcessorios && !mostraColecionaveis) return null;
  return (
    <>
      {mostraAcessorios ? (
        <SessaoSimples id="acessorios" titulo="Acessórios" subtitulo="Controles, headsets e carregadores de marca, abaixo da média das lojas.">
          <ul className={GRADE_SIMPLES}>
            {acessorios.slice(0, VITRINE_REGRAS.ACESSORIOS).map((item) => (
              <li key={item.masterProductId}><CartaoSimples item={item} /></li>
            ))}
          </ul>
        </SessaoSimples>
      ) : null}
      {mostraColecionaveis ? (
        <SessaoSimples id="colecionaveis" titulo="Colecionáveis">
          <ul className={GRADE_SIMPLES}>
            {co.itens.slice(0, VITRINE_REGRAS.COLECIONAVEIS).map((item) => (
              <li key={item.masterProductId}><CartaoSimples item={item} /></li>
            ))}
          </ul>
        </SessaoSimples>
      ) : null}
    </>
  );
}
