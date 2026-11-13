import { getVitrines } from '@/server/vitrines';
import { FaixaPlataforma, type SubabaPlataforma } from '@/components/vitrines/faixa-plataforma';
import { FAIXAS_PLATAFORMA, chaveFaixa } from '@/lib/vitrines/tipos';
import { VITRINE_REGRAS } from '@/lib/vitrines/regras';

const HREF_VER_TUDO: Record<string, string> = {
  playstation: '/ofertas?geracao=ps5,ps4',
  nintendo: '/ofertas?geracao=switch_2,switch_1',
  xbox: '/ofertas?geracao=xbox_series',
  pc: '/ofertas',
};

/**
 * As 4 faixas de plataforma (checklist #11), uma leitura em paralelo das 12 vitrines. Cada linha (jogos 10 / consoles 6) só
 * existe com 4 itens ou mais (o servidor já devolve oculta abaixo disso); faixa sem nenhuma linha some. Nada é preenchido.
 */
export async function SecaoPlataformas() {
  const chaves = FAIXAS_PLATAFORMA.flatMap((f) => f.subabas.flatMap((s) => [chaveFaixa(s.plataforma, 'jogos'), chaveFaixa(s.plataforma, 'consoles')]));
  const lidas = await getVitrines(chaves);
  const itensDe = (chave: string, max: number) => {
    const r = lidas[chave];
    return r?.visivel ? r.itens.slice(0, max) : [];
  };
  return (
    <>
      {FAIXAS_PLATAFORMA.map((f) => {
        const subabas: SubabaPlataforma[] = f.subabas.map((s) => ({
          plataforma: s.plataforma,
          rotulo: s.rotulo,
          jogos: itensDe(chaveFaixa(s.plataforma, 'jogos'), VITRINE_REGRAS.JOGOS_POR_FAIXA),
          consoles: itensDe(chaveFaixa(s.plataforma, 'consoles'), VITRINE_REGRAS.CONSOLES_POR_FAIXA),
        }));
        return <FaixaPlataforma key={f.id} id={`faixa-${f.id}`} rotulo={f.rotulo} hrefVerTudo={HREF_VER_TUDO[f.id] ?? '/ofertas'} subabas={subabas} />;
      })}
    </>
  );
}
