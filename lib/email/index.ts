export interface EmailAttachment {
  filename: string;
  /** Raw content (string for text/calendar, Buffer for binary). */
  content: string | Buffer;
  contentType?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Per-send override for the `Reply-To` header. Defaults to
   * unset by default; when unset the header is omitted entirely and a reply
   * bounces.
   */
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<void>;
}

export { sendEmail } from "./resend";
