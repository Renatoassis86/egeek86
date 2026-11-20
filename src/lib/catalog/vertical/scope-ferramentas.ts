// Sem 'server-only': dados puros do léxico (aparelho x acessório) e do recorte de nicho das ferramentas da Tecnologia (R-106, 2026-11-20; config-ferramentas.ts).
// Importado por scope.ts; não importa nada além do tipo (sem ciclo). Termos em minúsculas e sem acento (o título passa por fold() antes).
import type { SegmentLexiconData } from './scope-ampliacao';

const w = (words: string[]) => new RegExp(`\\b(${words.join('|')})\\b`);
const lex = (noun: string[], accessory: string[]): SegmentLexiconData => ({ noun: w(noun), accessory: w(accessory) });

/** Marcas reconhecidas (dicionário da loja, marcas-lojas.ts). Padrões já dobrados: "Black+Decker" vira "black decker", "De Walt" vira "de walt". */
export const MARCAS_FERRAMENTAS_RE = /\b(bosch|dewalt|de walt|makita|black decker|black e decker|stanley|tramontina pro|vonder|dremel|einhell|hikari|worx|milwaukee|irwin|gedore)\b/;

const ACESSORIO_MIUDO = ['broca', 'brocas', 'bit', 'bits', 'ponta', 'pontas', 'disco', 'discos', 'lixa', 'lixas', 'parafuso', 'parafusos', 'bateria', 'baterias', 'carregador', 'refil', 'refis', 'lamina', 'laminas', 'serra copo', 'mandril', 'escova de carvao', 'correia', 'rolamento', 'mola', 'capa', 'bolsa', 'maleta vazia', 'suporte', 'adaptador', 'peca', 'pecas', 'reposicao', 'acessorio', 'acessorios', 'cabo', 'fusivel', 'estojo', 'garra', 'kit de brocas', 'kit de discos', 'jogo de brocas'];

export const LEX_FERRAMENTAS: Record<string, SegmentLexiconData> = {
  'ferramenta-eletrica': lex(['furadeira', 'furadeiras', 'parafusadeira', 'parafusadeiras', 'aparafusadeira', 'serra', 'serras', 'esmerilhadeira', 'esmerilhadeiras', 'lixadeira', 'lixadeiras', 'plaina', 'micro retifica', 'retifica', 'martelete', 'soprador termico', 'pistola de calor', 'soldador', 'ferro de solda', 'ferro de soldar', 'tico tico', 'politriz', 'tupia'], ACESSORIO_MIUDO),
  'ferramenta-manual': lex(['jogo de chaves', 'jogo de soquetes', 'jogo de ferramentas', 'kit de ferramentas', 'kit ferramentas', 'maleta de ferramentas', 'caixa de ferramentas', 'chave inglesa', 'chave de fenda', 'chaves', 'soquetes', 'torquimetro', 'chave combinada', 'chave allen', 'ferramentas'], ACESSORIO_MIUDO),
};

const FORA_DO_NICHO = /\b(3d|impressora|impressao|filamento|faca|facas|canivete|machado|cozinha|churrasco|arma|armas|pistola de pressao|espingarda|tatica|brinquedo|infantil|unha|unhas|manicure|cabelo|barba|tatuagem|maquina de solda|inversora|mig|tig|eletrodo|soldagem industrial|usado|usada|recondicionado|recondicionada|seminovo|seminova|open box|replica|curso|apostila|capinha)\b/;

export const NICHO_FERRAMENTAS: Record<string, { require?: RegExp; forbid?: RegExp }> = {
  'ferramenta-eletrica': { require: MARCAS_FERRAMENTAS_RE, forbid: FORA_DO_NICHO },
  'ferramenta-manual': { require: MARCAS_FERRAMENTAS_RE, forbid: FORA_DO_NICHO },
};
