import { formatBRL } from '@/lib/format';
import type { QualifyingDrop } from './detect-price-drops';

const REASON_LABEL: Record<QualifyingDrop['reason'], string> = {
  new_low: 'Menor preço já visto',
  below_average: 'Bem abaixo da média',
};

function offerUrl(offerSlug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base}/ofertas/${offerSlug}`;
}

export function buildDigestTelegramText(name: string, items: QualifyingDrop[]): string {
  const lines = [`🔥 <b>${items.length === 1 ? 'Achamos um preço bom pra você' : `${items.length} jogos com preço bom agora`}</b>`, ''];

  for (const item of items) {
    lines.push(
      `🎮 <b>${item.title}</b>`,
      `${formatBRL(item.currentPriceCents)} na ${item.networkName}, ${REASON_LABEL[item.reason]}`,
      offerUrl(item.offerSlug),
      ''
    );
  }

  lines.push('Gerenciar alertas: ' + `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/conta/notificacoes`);
  return lines.join('\n');
}

export function buildDigestEmailHtml(name: string, items: QualifyingDrop[]): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #e5e5e5;">
          <div style="font-size:15px;font-weight:600;color:#111;">${item.title}</div>
          <div style="font-size:13px;color:#777;margin-top:4px;">
            <span style="background:#fef2f2;color:#b91c1c;padding:2px 8px;border-radius:999px;font-weight:600;">${REASON_LABEL[item.reason]}</span>
          </div>
          <div style="font-size:20px;font-weight:700;color:#111;margin-top:8px;">${formatBRL(item.currentPriceCents)}</div>
          <div style="font-size:13px;color:#777;">na ${item.networkName}</div>
          <a href="${offerUrl(item.offerSlug)}" style="display:inline-block;margin-top:10px;background:#111;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:14px;">Ver oferta</a>
        </td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#f43f5e;font-weight:700;">Geek Deals</div>
      <h1 style="font-size:20px;margin:8px 0 4px;">Oi, ${name}</h1>
      <p style="font-size:14px;color:#555;margin:0 0 16px;">
        ${items.length === 1 ? 'Um jogo que você acompanha' : `${items.length} jogos que você acompanha`}
        ${items.length === 1 ? 'está' : 'estão'} com preço bom agora:
      </p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="font-size:12px;color:#999;margin-top:24px;">
        Você está recebendo isso porque acompanha esses jogos no Espaço Geek 86.
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/conta/notificacoes" style="color:#999;">Gerenciar alertas</a>.
      </p>
    </div>`;
}
