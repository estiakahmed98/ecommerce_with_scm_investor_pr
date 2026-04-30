import { ParsedDocumentData } from "@/components/delivery-men/types";

function normalizeSpaces(input: string) {
  return input.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function toIsoDateLoose(input?: string): string | undefined {
  if (!input) return undefined;
  const cleaned = input.replace(/\./g, "/").replace(/-/g, "/").trim();
  const parts = cleaned.split("/");
  if (parts.length !== 3) return undefined;
  const [a, b, c] = parts;
  if (c.length !== 4) return undefined;
  return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
}

function extractNameByLabel(text: string): string | undefined {
  const patterns = [
    /(?:Name|Given Name|Surname|Full Name)\s*[:\-]?\s*([A-Z][A-Z .,'-]{2,})/i,
    /(?:নাম)\s*[:\-]?\s*([^\n]{3,50})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s{2,}/g, " ").trim();
  }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (
      /^[A-Z][A-Z .,'-]{4,}$/.test(line) &&
      !/passport|republic|people|national|identity|card|birth|date|sex|issued/i.test(line)
    ) {
      return line.trim();
    }
  }
  return undefined;
}

function extractNidNumber(text: string): string | undefined {
  const matches = text.match(/\b\d{10}\b|\b\d{13}\b|\b\d{17}\b/g);
  return matches?.[0];
}

function extractPassportNumber(text: string): string | undefined {
  const mrzMatch = text.match(/\b[A-Z]\d{7}\b/);
  if (mrzMatch) return mrzMatch[0];
  const generic = text.match(/\b[A-Z0-9]{7,9}\b/g);
  if (!generic) return undefined;
  return generic.find((v) => /[A-Z]/.test(v) && /\d/.test(v));
}

function extractBirthDate(text: string): string | undefined {
  const labeled = text.match(/(?:Date of Birth|Birth Date|DOB|জন্ম তারিখ)\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
  if (labeled?.[1]) return toIsoDateLoose(labeled[1]);
  const anyDate = text.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\b/g);
  return toIsoDateLoose(anyDate?.[0]);
}

function extractExpiryDate(text: string): string | undefined {
  const labeled = text.match(/(?:Date of Expiry|Expiry Date|Expiration Date|Valid Until)\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
  if (labeled?.[1]) return toIsoDateLoose(labeled[1]);
  const dates = text.match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\b/g) ?? [];
  return dates.length > 1 ? toIsoDateLoose(dates[dates.length - 1]) : undefined;
}

export function parseDocumentText(rawText: string): ParsedDocumentData {
  const text = normalizeSpaces(rawText);
  const lower = text.toLowerCase();

  const looksLikePassport =
    lower.includes("passport") ||
    lower.includes("p<") ||
    /[A-Z]\d{7}/.test(text);

  const looksLikeNid =
    lower.includes("national id") ||
    lower.includes("nid") ||
    lower.includes("smart card") ||
    lower.includes("জাতীয় পরিচয়পত্র") ||
    Boolean(extractNidNumber(text));

  if (looksLikePassport) {
    return {
      documentType: "PASSPORT",
      fullName: extractNameByLabel(text),
      identityNumber: extractPassportNumber(text),
      dateOfBirth: extractBirthDate(text),
      passportExpiryDate: extractExpiryDate(text),
      rawText: text,
    };
  }

  if (looksLikeNid) {
    return {
      documentType: "NID",
      fullName: extractNameByLabel(text),
      identityNumber: extractNidNumber(text),
      dateOfBirth: extractBirthDate(text),
      rawText: text,
    };
  }

  return {
    documentType: "UNKNOWN",
    fullName: extractNameByLabel(text),
    identityNumber: extractNidNumber(text) || extractPassportNumber(text),
    dateOfBirth: extractBirthDate(text),
    passportExpiryDate: extractExpiryDate(text),
    rawText: text,
  };
}
