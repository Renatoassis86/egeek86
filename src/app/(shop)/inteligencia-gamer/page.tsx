import { permanentRedirect } from 'next/navigation';

// Decisao D5 (ata 2026-11-13, checklist #15): a pagina servia 8 materias escritas a mao no codigo, com autor, data
// e afirmacoes de mercado sem fonte. Foi retirada; o endereco antigo responde 308 para as noticias reais.
export default function InteligenciaGamerRedirect(): never {
  permanentRedirect('/noticias');
}
