export function matchesSearchFields(query: string, fields: Array<string | undefined | null>) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = fields.filter(Boolean).join('\n').toLocaleLowerCase();
  return words.every(word => text.includes(word));
}
