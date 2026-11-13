export function dbSchema(): string {
  return process.env.SUPABASE_DB_SCHEMA || "spotdonalds";
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
