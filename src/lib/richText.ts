export const normalizeRichTextLink = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed || /^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return "";
  return `https://${trimmed}`;
};
