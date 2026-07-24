'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  GAME_FORMAT_LABELS,
  GAME_PLATFORM_GEN_LABELS,
  GAME_EDITION_TYPE_LABELS,
} from '@/lib/affiliate/labels';
import type { AffiliateNetwork } from '@/db/schema';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  expired: 'Expirada',
  archived: 'Arquivada',
};

const SORT_LABELS: Record<string, string> = {
  recent: 'Mais recentes',
  price_asc: 'Menor preço',
  price_desc: 'Maior preço',
};

/** Radix Select não aceita value="" em Item — usa esse sentinel só localmente pra representar "sem filtro". */
const ALL = '__all__';

interface AdminOfferFiltersProps {
  networks: Pick<AffiliateNetwork, 'id' | 'name'>[];
}

/**
 * Barra de filtros da lista de ofertas do admin — lê/escreve querystring
 * (status, formato, geracao, edicao, rede, ordenar) pra
 * admin/ofertas/page.tsx refazer a query com listOffersForAdminFiltered.
 * Usa o componente Select novo (Radix) em vez de <select> cru.
 */
export function AdminOfferFilters({ networks }: AdminOfferFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get('status') ?? ALL;
  const format = searchParams.get('formato') ?? ALL;
  const gen = searchParams.get('geracao') ?? ALL;
  const edition = searchParams.get('edicao') ?? ALL;
  const rede = searchParams.get('rede') ?? ALL;
  const sort = searchParams.get('ordenar') ?? 'recent';
  const busca = searchParams.get('busca') ?? '';

  const [searchInput, setSearchInput] = React.useState(busca);

  // Mantém o campo em sincronia se a URL mudar por outra via (voltar/avançar,
  // "Limpar filtros") sem sobrescrever o que a pessoa está digitando agora.
  React.useEffect(() => {
    setSearchInput(busca);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a URL muda, não a cada tecla
  }, [busca]);

  const hasFilters = [status, format, gen, edition, rede].some((v) => v !== ALL) || sort !== 'recent' || busca !== '';

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL || value === 'recent') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Muda o filtro sempre volta pra página 1 — sem isso, filtrar enquanto
    // navegado numa página 3+ podia cair numa página que não existe mais no
    // resultado filtrado (lista vazia, parecendo que o filtro "não funcionou").
    params.delete('pagina');
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  function clearAll() {
    setSearchInput('');
    router.push(pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        size="sm"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && setParam('busca', searchInput)}
        onBlur={() => setParam('busca', searchInput)}
        leftAddon={<Search className="size-3.5" />}
        placeholder="Buscar por nome do jogo..."
        className="w-full sm:w-56"
      />

      <Select value={status} onValueChange={(v) => setParam('status', v)}>
        <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={format} onValueChange={(v) => setParam('formato', v)}>
        <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
          <SelectValue placeholder="Formato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todo formato</SelectItem>
          {Object.entries(GAME_FORMAT_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={gen} onValueChange={(v) => setParam('geracao', v)}>
        <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
          <SelectValue placeholder="Geração" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toda geração</SelectItem>
          {Object.entries(GAME_PLATFORM_GEN_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={edition} onValueChange={(v) => setParam('edicao', v)}>
        <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
          <SelectValue placeholder="Tipo de edição" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todo tipo</SelectItem>
          {Object.entries(GAME_EDITION_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {networks.length > 0 && (
        <Select value={rede} onValueChange={(v) => setParam('rede', v)}>
          <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
            <SelectValue placeholder="Rede" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toda rede</SelectItem>
            {networks.map((network) => (
              <SelectItem key={network.id} value={network.id}>
                {network.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={sort} onValueChange={(v) => setParam('ordenar', v)}>
        <SelectTrigger size="sm" className="w-full sm:w-[9.5rem]">
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="w-full text-[var(--color-text-tertiary)] sm:w-fit"
        >
          <RotateCcw className="size-3.5" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
