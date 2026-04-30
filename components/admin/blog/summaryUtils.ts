export const processBlogSummary = (
  text: string,
  maxLength: number = 300
): string => {
  if (!text) return "";

  const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  if (clean.length <= maxLength) return clean;

  const sentences = clean
    .split(/(?<=[।!?])/)
    .map((s) => s.trim())
    .filter(Boolean);

  let final = "";
  for (const sentence of sentences) {
    if ((final + " " + sentence).trim().length <= maxLength) {
      final += (final ? " " : "") + sentence;
    } else {
      break;
    }
  }

  if (!final) {
    const cut = clean.substring(0, maxLength);
    return cut.substring(0, cut.lastIndexOf(" ")) + "...";
  }

  return final.trim();
};
