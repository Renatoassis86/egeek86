/** R2-9: o ?key= legado so vale com a chave ligada; Bearer sempre vale; sem CRON_SECRET falha fechada. Uso: npx tsx --conditions=react-server scripts/test-cron-auth-key-legado.ts */
import { NextRequest } from 'next/server';
import { keyNaUrlAceita, rejectUnlessCronAuthorized } from '../src/lib/auth/cron-auth';

let total = 0, fails = 0;
function check(nome: string, ok: boolean) { total++; if (!ok) { fails++; console.log('FALHA:', nome); } else console.log('ok  ', nome); }
const req = (url: string, auth?: string) => new NextRequest(url, auth ? { headers: { authorization: auth } } : undefined);
const S = 'segredo-de-teste-0123456789abcdef';
const orig = { ...process.env };
process.env.CRON_SECRET = S;
delete process.env.CRON_ACEITA_KEY_NA_URL;
const warn = console.warn; let avisos = 0; console.warn = () => { avisos++; };

check('bearer correto autoriza', rejectUnlessCronAuthorized(req('https://x.test/api/cron/a', `Bearer ${S}`)) === null);
check('bearer errado nega', rejectUnlessCronAuthorized(req('https://x.test/api/cron/a', 'Bearer errado'))?.status === 401);
check('?key= correto autoriza por padrao (legado) e registra uso', rejectUnlessCronAuthorized(req(`https://x.test/api/cron/a?key=${S}`)) === null && avisos === 1);
check('?key= errado nega', rejectUnlessCronAuthorized(req('https://x.test/api/cron/a?key=errado'))?.status === 401);
process.env.CRON_ACEITA_KEY_NA_URL = 'off';
check('com a chave off, ?key= correto deixa de valer', rejectUnlessCronAuthorized(req(`https://x.test/api/cron/a?key=${S}`))?.status === 401);
check('com a chave off, bearer segue valendo', rejectUnlessCronAuthorized(req('https://x.test/api/cron/a', `Bearer ${S}`)) === null);
check('keyNaUrlAceita: vazio=true, off=false, OFF=false', keyNaUrlAceita({}) && !keyNaUrlAceita({ CRON_ACEITA_KEY_NA_URL: 'off' }) && !keyNaUrlAceita({ CRON_ACEITA_KEY_NA_URL: 'OFF' }));
delete process.env.CRON_SECRET;
check('sem CRON_SECRET falha fechada (500)', rejectUnlessCronAuthorized(req('https://x.test/api/cron/a', 'Bearer undefined'))?.status === 500);
console.warn = warn; Object.assign(process.env, orig);
console.log(`${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
