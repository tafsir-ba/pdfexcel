export type MappableField = {
  name: string;
};

/** Keep in sync with CHECKBOX_ALWAYS in static-pdf.ts (Node tests cannot resolve extensionless .ts imports). */
const CHECKBOX_ALWAYS = "__formbatch_always_checked__";

const SYNONYMS: Record<string, string[]> = {
  nom: ["lastname", "last", "surname", "familyname", "hostlastname", "guestlastname", "nomfamille"],
  prenom: ["firstname", "first", "givenname", "hostfirstname", "guestfirstname", "prenoms"],
  neele: ["dob", "birthdate", "dateofbirth", "hostdob", "guestdob", "born"],
  nee: ["dob", "birthdate", "dateofbirth"],
  demeurant: ["address", "adresse", "street", "domicile", "residence", "livingat", "hostaddress"],
  adresse: ["address", "street", "demeurant", "domicile"],
  a: ["placeofbirth", "birthplace", "bornin", "villedenaissance"],
  email: ["mail", "courriel"],
  telephone: ["phone", "tel", "mobile", "portable"],
  tel: ["phone", "telephone", "mobile"],
  date: ["dated", "completiondate", "issuedate", "faitle"],
  faita: ["city", "place", "lieu", "location"],
  signature: ["sign", "signed"],
  course: ["class", "training", "program"],
  fullname: ["name", "recipient", "person", "fullnamee"],
};

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalize(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function synonymKeys(normalizedField: string) {
  const keys = new Set<string>([normalizedField]);
  for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
    const canon = normalize(canonical);
    const aliasHit = aliases.some((alias) => normalize(alias) === normalizedField);
    const fieldExtendsCanon =
      canon.length >= 3 &&
      (normalizedField === canon || normalizedField.startsWith(canon));
    if (canon === normalizedField || aliasHit || fieldExtendsCanon) {
      keys.add(canon);
      for (const alias of aliases) keys.add(normalize(alias));
    }
  }
  return keys;
}

function scoreHeaderMatch(fieldNormalized: string, headerNormalized: string) {
  if (!fieldNormalized || !headerNormalized) return 0;
  if (fieldNormalized === headerNormalized) return 100;

  const synonyms = synonymKeys(fieldNormalized);
  if (synonyms.has(headerNormalized)) return 90;

  // Prefer longer synonym keys so "name" does not steal "lastname" columns.
  const synonymHits = [...synonyms]
    .filter((key) => key.length >= 4)
    .sort((left, right) => right.length - left.length);

  for (const key of synonymHits) {
    if (headerNormalized.includes(key)) return 70;
    if (key.includes(headerNormalized) && headerNormalized.length >= 4) return 65;
  }

  if (headerNormalized.includes(fieldNormalized) && fieldNormalized.length >= 4) return 60;
  if (fieldNormalized.includes(headerNormalized) && headerNormalized.length >= 4) return 55;

  return 0;
}

export function autoMapFields(fields: MappableField[], headers: string[]) {
  const normalizedHeaders = headers.map((header) => ({
    header,
    normalized: normalize(header),
  }));
  const used = new Set<string>();
  const next: Record<string, string> = {};

  const pending = fields.map((field) => ({
    field,
    target: normalize(field.name.replace(/\s+\(\d+\)$/, "")),
  }));

  // Greedy highest-score assignment so overlapping synonyms do not collide.
  while (pending.length) {
    let bestIndex = -1;
    let bestHeader = "";
    let bestScore = 0;

    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      for (const header of normalizedHeaders) {
        if (used.has(header.header)) continue;
        const score = scoreHeaderMatch(item.target, header.normalized);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
          bestHeader = header.header;
        }
      }
    }

    if (bestIndex < 0 || bestScore < 55) break;

    const chosen = pending.splice(bestIndex, 1)[0];
    next[chosen.field.name] = bestHeader;
    used.add(bestHeader);
  }

  return Object.fromEntries(fields.map((field) => [field.name, next[field.name] || ""]));
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
