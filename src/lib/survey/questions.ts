/**
 * Pesquisa de satisfação/mercado — v1 é um questionário FIXO (não um
 * construtor de formulário dinâmico), inspirado no que a Pesquisa Game
 * Brasil realmente pergunta (plataforma, hábito de compra, gasto). Usado
 * tanto pelo formulário público (/pesquisa) quanto pela agregação no
 * admin (/admin/pesquisa) — única fonte de verdade das perguntas.
 */
export type SurveyQuestionType = 'single_choice' | 'rating' | 'text';

export interface SurveyQuestionOption {
  value: string;
  label: string;
}

export interface SurveyQuestion {
  key: string;
  label: string;
  type: SurveyQuestionType;
  required: boolean;
  options?: SurveyQuestionOption[];
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    key: 'platform',
    label: 'Qual plataforma você mais usa pra jogar?',
    type: 'single_choice',
    required: true,
    options: [
      { value: 'switch', label: 'Nintendo Switch' },
      { value: 'playstation', label: 'PlayStation' },
      { value: 'xbox', label: 'Xbox' },
      { value: 'pc', label: 'PC' },
      { value: 'mobile', label: 'Celular' },
    ],
  },
  {
    key: 'purchase_frequency',
    label: 'Com que frequência você compra jogo, console ou acessório?',
    type: 'single_choice',
    required: true,
    options: [
      { value: 'mensal', label: 'Todo mês' },
      { value: 'trimestral', label: 'A cada 2-3 meses' },
      { value: 'semestral', label: 'A cada 6 meses' },
      { value: 'anual', label: '1x por ano ou menos' },
    ],
  },
  {
    key: 'monthly_spend',
    label: 'Quanto você costuma gastar por mês com cultura geek/games?',
    type: 'single_choice',
    required: true,
    options: [
      { value: 'ate_100', label: 'Até R$ 100' },
      { value: '100_300', label: 'R$ 100 a R$ 300' },
      { value: '300_600', label: 'R$ 300 a R$ 600' },
      { value: 'mais_600', label: 'Mais de R$ 600' },
    ],
  },
  {
    key: 'monitoring_satisfaction',
    label: 'De 1 a 5, o quanto o monitoramento de preço do Espaço Geek 86 te ajuda a decidir a hora de comprar?',
    type: 'rating',
    required: true,
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
    ],
  },
  {
    key: 'seller_priority',
    label: 'O que mais pesa na hora de escolher onde comprar?',
    type: 'single_choice',
    required: true,
    options: [
      { value: 'preco', label: 'Menor preço' },
      { value: 'reputacao', label: 'Reputação do vendedor' },
      { value: 'prazo', label: 'Prazo de entrega' },
      { value: 'frete', label: 'Frete grátis' },
      { value: 'cupom', label: 'Cupom/desconto disponível' },
    ],
  },
  {
    key: 'comment',
    label: 'Quer contar mais alguma coisa? (opcional)',
    type: 'text',
    required: false,
  },
];
