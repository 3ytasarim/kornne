/** "{count} ürün" → "3 ürün". Separate module so client components never pull in the dictionaries. */
export const format = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
