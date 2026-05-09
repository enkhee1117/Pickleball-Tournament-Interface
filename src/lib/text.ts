// Title-case a person's name: "john o'brien" → "John O'Brien",
// "MARY-JANE" → "Mary-Jane". Lowercases everything first so all-caps input
// from a user with caps lock on doesn't survive into the roster. Splits on
// whitespace, hyphens, and apostrophes so compound names render right.
//
// Caveat: surnames with intentional inner caps (McDonald, MacLeod, O'Connor's
// quirks) get folded to title case — most users will live with that, and the
// edit panel still lets a manager hand-fix it.
export function titleCaseName(raw: string): string {
  if (!raw) return raw;
  return raw
    .toLowerCase()
    .replace(/(^|[\s'\-])([a-zÀ-ɏ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
