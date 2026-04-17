export type TemplateVars = Record<string, string | number | undefined | null>;

export function applyTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    const v = vars[key.trim()];
    return v === undefined || v === null ? "" : String(v);
  });
}
