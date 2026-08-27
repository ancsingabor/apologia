import { Resend } from "resend";
import type { EmailPayload } from "./index";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(payload: EmailPayload): Promise<void> {
  // Omitted rather than defaulted to the sender: a reply to `noreply@` that
  // bounces is honest, one that is accepted and never read is not.
  const replyTo = payload.replyTo;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    ...(replyTo && { replyTo }),
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}
