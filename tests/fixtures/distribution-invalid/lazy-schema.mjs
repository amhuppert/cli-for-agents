export const lazy = async () => (await import('./schema.mjs')).schema;
