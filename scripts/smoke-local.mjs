process.env.PJSKTOOLS_FAST_MASTER_REFRESH = "true";
process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.SMTP_FROM = "";
delete process.env.DATABASE_URL;

await import("./smoke-api.mjs");
