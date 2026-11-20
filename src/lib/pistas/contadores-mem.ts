// Sem 'server-only': PURO. Contadores atomicos em memoria do processo (JS e single-thread: ler/incrementar sincronos = atomicos).
// A gravacao no banco e agregada em lote (server/pistas/contadores.ts); aqui so o estado e os deltas pendentes.
import type { EstadoContadores } from './admissao';

export interface ChaveContador { canal: string; hora: Date; tipo: string; marca: string }
export interface LinhaContador { canal: string; horaMs: number; tipo: string; marca: string; n: number }

const SEM_TIPO = 'sem-tipo';

export class ContadoresMem {
  private cheio = new Map<string, number>();
  private canalHora = new Map<string, number>();
  private tipoHora = new Map<string, number>();
  private marcaHora = new Map<string, number>();
  private delta = new Map<string, number>();

  private static k(c: string, h: number, t: string, m: string) { return `${c}|${h}|${t}|${m}`; }

  /** Estado ANTES de uma nova decisao (marca vazia = 0). */
  ler(canal: string, hora: Date, tipo: string | null, marca: string | null): EstadoContadores {
    const h = hora.getTime();
    const t = tipo ?? SEM_TIPO;
    return {
      canalHora: this.canalHora.get(`${canal}|${h}`) ?? 0,
      tipoHora: this.tipoHora.get(`${canal}|${h}|${t}`) ?? 0,
      marcaHora: marca ? (this.marcaHora.get(`${canal}|${h}|${marca}`) ?? 0) : 0,
    };
  }

  /** Soma 1 (ou n) ao canal/hora/tipo/marca e registra o delta para a gravacao em lote. */
  incrementar(canal: string, hora: Date, tipo: string | null, marca: string | null, n = 1, pendente = true): void {
    const h = hora.getTime();
    const t = tipo ?? SEM_TIPO;
    const m = marca ?? '';
    const key = ContadoresMem.k(canal, h, t, m);
    this.cheio.set(key, (this.cheio.get(key) ?? 0) + n);
    this.canalHora.set(`${canal}|${h}`, (this.canalHora.get(`${canal}|${h}`) ?? 0) + n);
    this.tipoHora.set(`${canal}|${h}|${t}`, (this.tipoHora.get(`${canal}|${h}|${t}`) ?? 0) + n);
    if (m) this.marcaHora.set(`${canal}|${h}|${m}`, (this.marcaHora.get(`${canal}|${h}|${m}`) ?? 0) + n);
    if (pendente) this.delta.set(key, (this.delta.get(key) ?? 0) + n);
  }

  /** Entrega e zera os deltas (uma chamada = um lote). `devolver` recoloca se a gravacao falhar. */
  coletarLote(): LinhaContador[] {
    const out: LinhaContador[] = [];
    for (const [key, n] of this.delta) {
      const [canal, h, tipo, marca] = key.split('|');
      out.push({ canal, horaMs: Number(h), tipo, marca, n });
    }
    this.delta.clear();
    return out;
  }
  devolver(linhas: LinhaContador[]): void {
    for (const l of linhas) {
      const key = ContadoresMem.k(l.canal, l.horaMs, l.tipo, l.marca);
      this.delta.set(key, (this.delta.get(key) ?? 0) + l.n);
    }
  }

  limpar(): void {
    this.cheio.clear(); this.canalHora.clear(); this.tipoHora.clear(); this.marcaHora.clear(); this.delta.clear();
  }
  get pendentes(): number { return this.delta.size; }
}
