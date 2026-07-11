process.env.PJSKTOOLS_FAST_MASTER_REFRESH = "true";
process.env.PJSKTOOLS_FORCE_MEMORY_STORE = "true";
delete process.env.DATABASE_URL;

await import("./smoke-api.mjs");
