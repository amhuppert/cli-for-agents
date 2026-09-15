const { schema } = await import('./schema.mjs');
export const lazy = async () => schema;
