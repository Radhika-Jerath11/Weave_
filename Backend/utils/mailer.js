// Sends the invitation email. If SMTP isn't configured the app still works:
// the invite is created and the link is returned to the owner instead.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transporter; // undefined = not built yet, null = not configured
function getTransport() {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!(SMTP_HOST && SMTP_USER && SMTP_PASS)) return (transporter = null);
  const port = Number(SMTP_PORT) || 465;
  transporter = require('nodemailer').createTransport({
    host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

function buildInviteMessage({ to, inviterName, boardName, link }) {
  const from = process.env.MAIL_FROM || `Weave <${process.env.SMTP_USER}>`;
  const subject = `${inviterName} invited you to "${boardName}" on Weave`;
  const text =
`Hi,

${inviterName} invited you to collaborate on the board "${boardName}" on Weave, a Kanban board where tasks stay locked until the work they depend on is done.

Accept the invitation:
${link}

The link expires in 7 days and only works when you sign in as ${to}.
If you weren't expecting this, you can ignore this email.`;

  const html = `<!doctype html><html><body style="margin:0;background:#F4EFE1;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#2B2A20;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#FFFDF6;border:1px solid #E1D9C3;border-radius:14px;">
    <tr><td style="padding:32px;">
      <p style="margin:0 0 18px;font-size:18px;font-weight:bold;color:#33402A;">&#9679; Weave</p>
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#2B2A20;">You're invited to join &ldquo;${esc(boardName)}&rdquo;</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#5B5847;">
        <b>${esc(inviterName)}</b> invited you to collaborate on a Weave board, where tasks stay locked until what they depend on is done.
      </p>
      <p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;background:#4E5C36;color:#F6F1E4;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:9px;">Accept invitation</a></p>
      <p style="margin:0 0 6px;font-size:12.5px;line-height:1.6;color:#8B8670;">Or paste this link into your browser:<br><span style="word-break:break-all;">${esc(link)}</span></p>
      <p style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:#8B8670;">This link expires in 7 days and only works when you sign in as ${esc(to)}. If you weren't expecting this, you can ignore this email.</p>
    </td></tr>
  </table></body></html>`;
  return { from, to, subject, text, html };
}

async function sendInviteEmail(details) {
  const t = getTransport();
  if (!t) {
    console.log(`[mail] SMTP not configured. Invite link for ${details.to}: ${details.link}`);
    return { sent: false };
  }
  await t.sendMail(buildInviteMessage(details));
  return { sent: true };
}
module.exports = { sendInviteEmail, buildInviteMessage };
