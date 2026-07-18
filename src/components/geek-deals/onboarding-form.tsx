'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Award, ShieldCheck, Heart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { saveCollectorOnboarding } from '@/server/actions/collector';

export function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [bio, setBio] = useState('');
  const [experienceYears, setExperienceYears] = useState(1);
  const [selectedFranchises, setSelectedFranchises] = useState<string[]>([]);
  const [guaranteesAuthentic, setGuaranteesAuthentic] = useState(false);

  const franchises = [
    'Naruto & Animes',
    'One Piece',
    'Pokémon & Nintendo',
    'Dragon Ball',
    'Star Wars & Sci-Fi',
    'Marvel & DC Comics',
    'Retro Gaming & Consoles',
    'Edições de Colecionador (Games)',
    'Estátuas & Action Figures',
    'Acessórios Custom (Mods/Setups)',
    'Itens In-Game & Skins Raras',
    'Card Games / Magic / Yu-Gi-Oh'
  ];

  const handleToggleFranchise = (item: string) => {
    setSelectedFranchises((prev) =>
      prev.includes(item) ? prev.filter((f) => f !== item) : [...prev, item]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!bio.trim()) {
      toast.error('Preencha sua biografia de colecionador.');
      return;
    }

    if (bio.length < 20) {
      toast.error('Por favor, escreva uma biografia um pouco mais detalhada (mínimo 20 caracteres).');
      return;
    }

    if (!guaranteesAuthentic) {
      toast.error('Você deve concordar com a garantia de autenticidade.');
      return;
    }

    startTransition(async () => {
      const res = await saveCollectorOnboarding({
        bio,
        experienceYears,
        focusFranchises: selectedFranchises,
        guaranteesAuthentic,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
        router.push('/conta/vendedor/novo-drop');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-xl mx-auto w-full">
      <Card className="border-[var(--color-border-default)] bg-[var(--color-bg-inset)]/30">
        <CardContent className="p-6 md:p-8 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
              <Award className="size-5" />
            </div>
            <div>
              <Text variant="heading-md">Perfil de Colecionador Vendedor</Text>
              <Text variant="caption" color="tertiary">
                Responda estas perguntas para se qualificar e liberar a criação de Drops.
              </Text>
            </div>
          </div>

          <div className="border-t border-[var(--color-border-subtle)] pt-4 flex flex-col gap-4">
            
            {/* Anos de Experiência */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Há quantos anos você coleciona?
              </label>
              <div className="flex gap-2">
                {[1, 3, 5, 10].map((years) => (
                  <button
                    key={years}
                    type="button"
                    onClick={() => setExperienceYears(years)}
                    className={cn(
                      'flex-1 py-2 px-3 border rounded-[var(--radius-sm)] text-xs font-mono font-semibold transition-all focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary)]',
                      experienceYears === years
                        ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5 text-[var(--color-accent-primary)]'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    )}
                  >
                    {years === 10 ? '10+ anos' : `${years} ano${years > 1 ? 's' : ''}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Foco da Coleção */}
            <div className="flex flex-col gap-1.5">
              <label className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Quais seus principais focos de interesse?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {franchises.map((item) => {
                  const isSelected = selectedFranchises.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleToggleFranchise(item)}
                      className={cn(
                        'py-2 px-3 text-left border rounded-[var(--radius-sm)] text-xs font-medium transition-all focus:outline-none flex items-center justify-between',
                        isSelected
                          ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5 text-[var(--color-accent-primary)]'
                          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      )}
                    >
                      <span>{item}</span>
                      {isSelected && <Heart className="size-3 fill-current" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bio / Storytelling de quem é */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bio" className="text-body-sm font-semibold text-[var(--color-text-primary)]">
                Fale um pouco sobre sua história como colecionador
              </label>
              <textarea
                id="bio"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ex: Coleciono consoles clássicos desde 2012 e sou especialista em consoles portáteis restaurados. Já fiz trocas em feiras internacionais..."
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-2 text-body-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)] focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* Acordo de Autenticidade e Rede de Consenso (Blockchain-style Trust) */}
            <div className="flex flex-col gap-3 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] p-4 mt-2">
              <div className="flex items-start gap-3">
                <input
                  id="authentic-agreement"
                  type="checkbox"
                  checked={guaranteesAuthentic}
                  onChange={(e) => setGuaranteesAuthentic(e.target.checked)}
                  className="mt-1 size-4 rounded border-[var(--color-border-subtle)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary)]"
                />
                <label htmlFor="authentic-agreement" className="text-xs text-[var(--color-text-secondary)] leading-relaxed cursor-pointer select-none">
                  <span className="font-bold text-[var(--color-text-primary)] block mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-[var(--color-accent-success)]" />
                    Consenso e Rede de Confiança C2C (Trust Chain)
                  </span>
                  Aceito fazer parte da rede descentralizada de curadores. Entendo que:
                  <ul className="list-disc pl-4 mt-1.5 flex flex-col gap-1 text-[11px]">
                    <li>Meus drops de produtos serão <strong className="text-[var(--color-text-primary)] font-bold">auditados e votados por outros colecionadores</strong> antes e durante o lançamento para garantir a originalidade e o storytelling exato.</li>
                    <li>As avaliações e notas que eu receber de compradores <strong className="text-[var(--color-text-primary)] font-bold">passarão por uma auditoria do conselho de colecionadores</strong> antes de irem a público. Isso comprovará se a reclamação é real (com fotos de prova) ou se é erro/má-fé do comprador, me blindando contra avaliações injustas.</li>
                    <li>Garanto que meus itens são 100% autênticos e correspondem exatamente às descrições e às fotos cadastradas.</li>
                  </ul>
                </label>
              </div>
            </div>

          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full mt-2 font-bold"
            rightIcon={<ArrowRight className="size-4" />}
          >
            {isPending ? 'Validando Cadastro...' : 'Salvar e Ir para Novo Drop'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
