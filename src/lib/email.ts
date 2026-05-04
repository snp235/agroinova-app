// Wrapper minimalista do Resend. Tudo que toca e-mail passa por aqui
// para isolar o SDK e os erros (e-mail nunca pode derrubar uma rota).
import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'AgroInova <onboarding@resend.dev>';

let resend: Resend | null = null;
if (apiKey) {
  resend = new Resend(apiKey);
} else {
  console.warn('[email] RESEND_API_KEY não configurada — chamadas de e-mail vão falhar.');
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs): Promise<void> {
  if (!resend) {
    throw new Error('E-mail não configurado no servidor (RESEND_API_KEY ausente).');
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    console.error('[email] envio falhou:', error);
    throw new Error('Falha ao enviar e-mail.');
  }
}

// Template básico mantendo identidade do app sem precisar de design system rico.
export function passwordResetEmail(name: string, link: string): string {
  return `
<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f7f6f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f1;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e6df;">
        <tr><td style="padding:32px 28px 24px 28px;">
          <h1 style="margin:0 0 8px 0;color:#1c4524;font-size:22px;font-weight:700;">Redefinir sua senha</h1>
          <p style="margin:0 0 20px 0;color:#3a3a3a;font-size:15px;line-height:1.5;">
            Olá, ${name}!<br>
            Recebemos uma solicitação para redefinir sua senha no AgroInova.
            Clique no botão abaixo para criar uma nova senha. O link expira em 30 minutos.
          </p>
          <p style="margin:0 0 28px 0;">
            <a href="${link}" style="display:inline-block;background:#2f7d3a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;font-size:15px;">
              Redefinir senha
            </a>
          </p>
          <p style="margin:0 0 8px 0;color:#7a7a7a;font-size:13px;line-height:1.5;">
            Se você não pediu isso, é só ignorar este e-mail — sua senha continua a mesma.
          </p>
          <p style="margin:0;color:#7a7a7a;font-size:12px;line-height:1.5;word-break:break-all;">
            Link direto: <span style="color:#2f7d3a;">${link}</span>
          </p>
        </td></tr>
        <tr><td style="background:#f1efe7;padding:14px 28px;text-align:center;color:#7a7a7a;font-size:12px;">
          AgroInova — conectando hortas, pessoas e saberes.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}
