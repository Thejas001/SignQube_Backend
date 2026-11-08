'use strict';

/**
 * Plain-HTML email templates. Every one carries the order number, a status line
 * and a link to the order page.
 */

const env = require('../../../config/env');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Where the recipient should land. Staff go to their own panel. */
function orderLink({ orderId, role }) {
  if (!orderId) return env.APP_BASE_URL;
  switch (role) {
    case 'ADMIN':
      return `${env.APP_BASE_URL}/admin/orders/${orderId}`;
    case 'DESIGNER':
      return `${env.APP_BASE_URL}/designer/jobs/${orderId}`;
    case 'PRINTER':
      return `${env.APP_BASE_URL}/printer/jobs/${orderId}`;
    default:
      return `${env.APP_BASE_URL}/orders/${orderId}`;
  }
}

/**
 * @param {{ title: string, statusLine: string, orderNumber?: string,
 *           body: string, orderId?: number, role?: string }} args
 * @returns {{ subject: string, html: string, text: string }}
 */
function render({ title, statusLine, orderNumber, body, orderId, role }) {
  const link = orderLink({ orderId, role });
  const subject = orderNumber ? `${title} — ${orderNumber}` : title;

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4;">
      <tr>
        <td style="padding:24px 28px 8px;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;">SIGNQUE</div>
          <h1 style="margin:12px 0 4px;font-size:20px;line-height:1.3;">${escapeHtml(title)}</h1>
          ${orderNumber ? `<div style="font-size:14px;color:#57534e;">Order <strong>${escapeHtml(orderNumber)}</strong></div>` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 0;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#f5f5f4;border:1px solid #e7e5e4;font-size:13px;color:#44403c;">
            ${escapeHtml(statusLine)}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 4px;font-size:15px;line-height:1.6;color:#292524;">
          ${escapeHtml(body)}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 28px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#1c1917;color:#fafaf9;text-decoration:none;font-size:14px;font-weight:600;">
            View order
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;font-size:12px;color:#a8a29e;border-top:1px solid #f5f5f4;padding-top:16px;">
          You are receiving this because of activity on your SIGNQUE account.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [title, orderNumber ? `Order ${orderNumber}` : null, statusLine, '', body, '', link]
    .filter((l) => l !== null)
    .join('\n');

  return { subject, html, text };
}

module.exports = { render, orderLink, escapeHtml };
