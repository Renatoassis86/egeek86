import { discoverNewProducts } from '@/server/collector/discover-products';
(async () => {
  const r = await discoverNewProducts({ dryRun: true, termsLimit: 2 } as never);
  const s = JSON.stringify(r, null, 1);
  console.log(s.length > 4000 ? s.slice(0, 4000) + '…' : s);
  process.exit(0);
})().catch((e) => { console.error('ERR', e?.message ?? e); process.exit(1); });
