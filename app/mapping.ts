export type MappableField = {
  name: string;
};

/** Keep in sync with CHECKBOX_ALWAYS in static-pdf.ts (Node tests cannot resolve extensionless .ts imports). */
const CHECKBOX_ALWAYS = "__formbatch_always_checked__";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function autoMapFields(fields: MappableField[], headers: string[]) {
  const next: Record<string, string> = {};
  const normalizedHeaders = headers.map((header) => ({
    header,
    normalized: normalize(header),
  }));

  for (const field of fields) {
    const target = normalize(field.name.replace(/\s+\(\d+\)$/, ""));
    const exact = normalizedHeaders.find((item) => item.normalized === target);
    next[field.name] = exact?.header || "";
  }
  return next;
}

/** Preserve Always-check / intentional blank mappings; remap only missing or stale columns. */
export function reconcileFieldMapping(
  fields: MappableField[],
  headers: string[],
  current: Record<string, string>,
) {
  const automatic = autoMapFields(fields, headers);
  return Object.fromEntries(
    fields.map((field) => {
      if (!Object.prototype.hasOwnProperty.call(current, field.name)) {
        return [field.name, automatic[field.name] || ""];
      }
      const existing = current[field.name];
      if (existing === CHECKBOX_ALWAYS || existing === "") {
        return [field.name, existing];
      }
      if (headers.includes(existing)) {
        return [field.name, existing];
      }
      return [field.name, automatic[field.name] || ""];
    }),
  );
}
