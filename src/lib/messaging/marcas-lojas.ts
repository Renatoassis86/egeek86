// Dono, 2026-11-18: "enumere as principais marcas" de cada loja. Servem a DUAS coisas, ambas so de ORDEM na fila de envio (nunca bloqueiam):
//  (1) variedade de marcas: quem tem marca que ja saiu nas ultimas COTA_MARCA_HORAS na loja vai atras de quem tem marca que ainda nao saiu;
//  (2) preferencia (MARCAS_PREFERIDAS em cota-item.ts): marcas escolhidas pelo dono abrem cada tipo.
// Padroes em minusculo, sem acento, sem pontuacao (o nome do produto e normalizado igual no SQL). `l ?oreal` = "loreal" ou "l oreal".
// Lista inicial minha (principais marcas do varejo brasileiro por loja); o dono confirma e ajusta.

export const COTA_MARCA_HORAS = 6;

export const MARCAS_POR_LOJA: Readonly<Record<string, readonly string[]>> = {
  tecnologia: ['samsung', 'apple', 'xiaomi', 'motorola', 'logitech', 'redragon', 'hyperx', 'lenovo', 'dell', 'acer', 'asus', 'hp', 'intel', 'amd', 'nvidia', 'gigabyte', 'msi', 'kingston', 'sandisk', 'jbl', 'anker', 'tp link', 'multilaser', 'positivo', 'philips', 'lg', 'epson', 'canon', 'western digital', 'seagate', 'corsair', 'razer', 'intelbras', 'tecno', 'realme', 'oppo', 'huawei', 'microsoft', 'google', 'amazon', 'bosch', 'dewalt', 'de walt', 'makita', 'black decker', 'stanley', 'tramontina pro', 'vonder', 'dremel', 'einhell', 'worx', 'milwaukee', 'irwin', 'gedore', 'hikari'],
  eletroeletronicos: ['samsung', 'lg', 'sony', 'philips', 'tcl', 'aoc', 'panasonic', 'jbl', 'bose', 'xiaomi', 'positivo', 'philco', 'multilaser', 'canon', 'nikon', 'gopro', 'dji', 'amazon', 'google', 'roku', 'intelbras', 'elgin', 'harman kardon', 'sennheiser', 'marshall', 'yamaha', 'pioneer', 'hisense', 'semp', 'britania', 'lenoxx', 'jvc', 'anker', 'edifier', 'bluetooth'],
  eletrodomesticos: ['mondial', 'philco', 'britania', 'electrolux', 'brastemp', 'consul', 'arno', 'oster', 'black decker', 'walita', 'philips', 'cadence', 'wap', 'midea', 'samsung', 'lg', 'fischer', 'suggar', 'panasonic', 'tramontina', 'eos', 'lenoxx', 'multilaser', 'agratto', 'atlas', 'esmaltec', 'continental', 'dako', 'karcher', 'bosch', 'whirlpool', 'gree', 'springer', 'komeco', 'ventisol', 'mueller', 'nardelli', 'practice', 'britania'],
  esporte: ['nike', 'adidas', 'puma', 'olympikus', 'mizuno', 'asics', 'penalty', 'topper', 'umbro', 'wilson', 'spalding', 'mikasa', 'kipsta', 'decathlon', 'oxer', 'acte', 'kikos', 'polimet', 'speedo', 'fila', 'under armour', 'reebok', 'vollo', 'gonew', 'athletic', 'caloi', 'dream fitness', 'wellness', 'new balance', 'havaianas', 'lupo', 'selene', 'kanxa', 'adidas', 'head', 'babolat', 'dunlop', 'yonex', 'netshoes', 'trek', 'oggi', 'absolute', 'gts', 'proaction', 'hammer', 'technogym'],
  livros: ['companhia das letras', 'intrinseca', 'rocco', 'record', 'harpercollins', 'aleph', 'panini', 'jbc', 'darkside', 'pearson', 'novatec', 'casa do codigo', 'alta books', 'sextante', 'planeta', 'arqueiro', 'principis', 'martins fontes', 'devir', 'galapagos', 'editora 34', 'vozes', 'mundo cristao', 'globo livros', 'melhoramentos', 'ftd', 'moderna', 'saraiva', 'leya', 'bertrand', 'nova fronteira', 'paulus', 'thomas nelson', 'ediouro', 'zahar', 'sebo', 'bookman', 'gen', 'atlas', 'elsevier', 'artmed', 'edipro', 'revista dos tribunais'],
  impressao3d: ['bambu lab', 'creality', 'anycubic', 'elegoo', 'prusa', 'flashforge', 'sunlu', 'esun', 'voolt3d', '3d lab', 'sethi3d', 'kobra', 'ender', 'artillery', 'phrozen', 'polymaker', 'overture', 'geeetech', 'sovol', 'snapmaker', 'raise3d', 'tronxy', 'nozzle', 'microlab'],
  beleza: ['mac', 'dior', 'chanel', 'yves saint laurent', 'lancome', 'estee lauder', 'maybelline', 'l ?oreal', 'nyx', 'vult', 'o boticario', 'natura', 'eudora', 'avon', 'risque', 'la roche posay', 'vichy', 'cerave', 'the ordinary', 'neutrogena', 'medicube', 'biore', 'tsubaki', 'schwarzkopf', 'kerastase', 'olaplex', 'wella', 'truss', 'taiff', 'babyliss', 'philips', 'carolina herrera', 'paco rabanne', 'revlon', 'max factor', 'quem disse berenice', 'boca rosa', 'bruna tavares', 'ruby rose', 'colorama', 'impala', 'dailus', 'sallve', 'principia', 'isdin', 'bioderma', 'eucerin', 'dove', 'seda', 'pantene', 'elseve', 'cadiveu', 'inoar', 'lola cosmetics', 'amend'],
  brinquedos: ['lego', 'hasbro', 'mattel', 'funko', 'bandai', 'estrela', 'grow', 'copag', 'playmobil', 'hot wheels', 'pop mart', 'good smile', 'banpresto', 'hot toys', 'marvel legends', 'barbie', 'matchbox', 'maisto', 'galapagos', 'devir', 'ravensburger', 'toyster', 'nendoroid', 'kotobukiya', 'neca', 'mcfarlane', 'monster high', 'polly pocket', 'baby alive', 'jellycat', 'candide', 'xalingo', 'multikids'],
  games: ['playstation', 'xbox', 'nintendo', 'capcom', 'ea sports', 'electronic arts', 'ubisoft', 'rockstar', 'konami', 'bandai namco', 'square enix', 'sega', 'activision', 'warner', 'sony', 'microsoft', 'cd projekt', 'fromsoftware', 'bethesda', 'take two', '2k', 'atlus', 'koei tecmo', 'dualsense', 'pulse'],
};

export function padraoMarcasLoja(vertical: string): string | null {
  const m = MARCAS_POR_LOJA[vertical];
  if (!m || !m.length) return null;
  // palavras mais longas primeiro: "yves saint laurent" casa antes de "laurent"; casa so como palavra inteira (nao "mac" dentro de "macbook").
  const ord = Array.from(new Set(m)).sort((a, b) => b.length - a.length);
  return `(?:^| )(${ord.join('|')})(?: |$)`;
}

/** Marca principal do nome (TS), mesma regra do SQL; null se nenhuma marca da loja aparece. */
export function marcaDoItem(vertical: string, nomeNormalizado: string): string | null {
  const p = padraoMarcasLoja(vertical);
  if (!p) return null;
  const m = new RegExp(p).exec(nomeNormalizado.replace(/\s+/g, ' ').trim());
  return m ? m[1] : null;
}
