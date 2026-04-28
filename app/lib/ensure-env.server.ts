const REQUIRED_RUNTIME_ENV = [
  "DATABASE_URL",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
] as const;

function isBuildOrTest(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.SHOPIFY_SKIP_ENV_VALIDATION === "1" ||
    process.env.npm_lifecycle_event === "build"
  );
}

export function ensureServerEnv(): void {
  if (isBuildOrTest()) return;

  const missing: string[] = REQUIRED_RUNTIME_ENV.filter((key) => !process.env[key]);

  if (process.env.NODE_ENV === "production" && !process.env.APP_ENCRYPTION_SECRET) {
    missing.push("APP_ENCRYPTION_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required Shopify app environment variable(s): ${missing.join(", ")}`);
  }
}
