// Enriched app types — mapped from DB rows with relationships and computed
// fields. UI and Server Actions work with these; map `db → domain` at the
// data-access layer so raw rows never leak into components.

import type { AdminRole } from "./db";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
}
