import { config } from 'dotenv';
config({ path: '.env.local' });
import { writeFileSync } from 'fs';
import postgres from 'postgres';
import type { ProductType } from '@/db/schema';
import { trainNaiveBayes, classify } from '@/lib/affiliate/product-type-classifier';

// Conexão direta (não @/lib/db) — esse módulo importa 'server-only', que
// derruba fora do contexto de build do Next. Mesmo padrão dos scripts de
// diagnóstico desta sessão: max:1, pooler de sessão (porta 5432 local).
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 15 });

/**
 * Treina o classificador Naive Bayes de jogo/console/acessório a partir do
 * catálogo real já cadastrado (`master_products.product_type` como rótulo).
 * Não existe um dataset rotulado à parte — usamos o catálogo pós-limpeza
 * (órfãos e itens de merchandising removidos em 2026-07-31) como verdade de
 * treino, prática padrão quando não há rótulo humano dedicado. Mede
 * acurácia real em holdout (20% nunca visto no treino) antes de salvar o
 * modelo final treinado com 100% dos dados — nunca reporta métrica
 * inventada.
 *
 * Rodar: npm run train:classifier
 */

const LABELS: ProductType[] = ['game', 'console', 'accessory'];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  console.log('Buscando catálogo rotulado...');
  const rows = await sql<{ name: string; product_type: ProductType }[]>`
    SELECT name, product_type FROM master_products
  `;

  const docs = shuffle(rows.map((r) => ({ text: r.name, label: r.product_type })));
  const byLabel = LABELS.map((l) => `${l}: ${docs.filter((d) => d.label === l).length}`).join(', ');
  console.log(`Total: ${docs.length} produtos (${byLabel})`);

  const holdoutSize = Math.round(docs.length * 0.2);
  const holdout = docs.slice(0, holdoutSize);
  const trainSet = docs.slice(holdoutSize);

  console.log(`Treino: ${trainSet.length} | Holdout (nunca visto): ${holdout.length}`);
  const evalModel = trainNaiveBayes(trainSet, LABELS);

  let correct = 0;
  const confusion: Record<string, Record<string, number>> = {};
  for (const l of LABELS) confusion[l] = Object.fromEntries(LABELS.map((l2) => [l2, 0]));

  for (const doc of holdout) {
    const [top] = classify(doc.text, evalModel);
    confusion[doc.label][top.label]++;
    if (top.label === doc.label) correct++;
  }
  const accuracy = holdout.length ? correct / holdout.length : 0;

  console.log(`\nAcurácia em holdout: ${(accuracy * 100).toFixed(1)}% (${correct}/${holdout.length})`);
  console.log('Matriz de confusão (linha = real, coluna = previsto):');
  console.log('           ', LABELS.map((l) => l.padEnd(10)).join(''));
  for (const real of LABELS) {
    console.log(real.padEnd(11), LABELS.map((pred) => String(confusion[real][pred]).padEnd(10)).join(''));
  }
  for (const l of LABELS) {
    const tp = confusion[l][l];
    const totalReal = LABELS.reduce((sum, l2) => sum + confusion[l][l2], 0);
    const totalPred = LABELS.reduce((sum, l2) => sum + confusion[l2][l], 0);
    const precision = totalPred ? tp / totalPred : 0;
    const recall = totalReal ? tp / totalReal : 0;
    console.log(`  ${l}: precisão=${(precision * 100).toFixed(1)}% recall=${(recall * 100).toFixed(1)}%`);
  }

  console.log('\nTreinando modelo final com 100% dos dados...');
  const finalModel = trainNaiveBayes(docs, LABELS);
  finalModel.holdoutAccuracy = accuracy;
  finalModel.holdoutSize = holdout.length;

  const outPath = new URL('../lib/affiliate/product-type-classifier-model.json', import.meta.url);
  writeFileSync(outPath, JSON.stringify(finalModel, null, 2));
  console.log(`Modelo salvo em ${outPath.pathname.replace(/^\/([A-Z]:)/, '$1')}`);

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
