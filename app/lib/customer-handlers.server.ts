import type { TemplateVars } from "./template.server";

export function buildCustomerTemplateVars(payload: Record<string, unknown>): TemplateVars {
  const first = (payload.first_name as string) || "";
  const last = (payload.last_name as string) || "";
  return {
    customer_name: [first, last].filter(Boolean).join(" ") || (payload.email as string) || "",
    customer_email: String(payload.email || ""),
    customer_id: String(payload.id || ""),
  };
}
