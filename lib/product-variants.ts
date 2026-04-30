export type VariantOptionInput = {
  name: string;
  values: string[];
};

export type VariantMediaMeta = {
  image?: string;
  gallery?: string[];
};

export function normalizeVariantOptions(input: unknown): VariantOptionInput[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((option: any) => {
      const name = String(option?.name || "").trim();
      const values = Array.isArray(option?.values)
        ? option.values
            .map((value: unknown) => String(value || "").trim())
            .filter(Boolean)
        : [];

      return {
        name,
        values: Array.from(new Set(values)) as string[],
      };
    })
    .filter((option) => option.name && option.values.length > 0);
}

export function normalizeVariantMediaMeta(input: unknown) {
  if (!input || typeof input !== "object") return undefined;

  const source = input as Record<string, unknown>;
  const image =
    typeof source.image === "string" && source.image.trim()
      ? source.image.trim()
      : undefined;
  const gallery = Array.isArray(source.gallery)
    ? Array.from(
        new Set(
          source.gallery
            .map((value) =>
              typeof value === "string" && value.trim() ? value.trim() : "",
            )
            .filter(Boolean),
        ),
      )
    : [];

  if (!image && gallery.length === 0) return undefined;

  return {
    ...(image ? { image } : {}),
    ...(gallery.length > 0 ? { gallery } : {}),
  } satisfies VariantMediaMeta;
}

export function getVariantMediaMeta(options: unknown) {
  if (!options || typeof options !== "object") return undefined;

  return normalizeVariantMediaMeta(
    (options as Record<string, unknown>).__meta,
  );
}

export function sortOptionObject(
  options: Record<string, unknown>,
  orderedNames: string[],
) {
  const sortedEntries = orderedNames
    .map((name) => [name, options[name]])
    .filter(([, value]) => value !== undefined);

  const mediaMeta = normalizeVariantMediaMeta(options.__meta);
  if (mediaMeta) {
    sortedEntries.push(["__meta", mediaMeta]);
  }

  return Object.fromEntries(sortedEntries);
}
