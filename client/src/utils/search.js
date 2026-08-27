/**
 * Checks if a string or any word within the string starts with the given query.
 * Examples:
 * - matchesPrefix("Madhu", "m") -> true
 * - matchesPrefix("Manoj", "man") -> true
 * - matchesPrefix("Anil Kumar", "ku") -> true ("Kumar" starts with "ku")
 * - matchesPrefix("ANM", "m") -> false
 * - matchesPrefix("Komuraiah", "m") -> false
 */
export function matchesPrefix(text, query) {
  if (!query || !query.trim()) return true;
  if (text == null) return false;
  const q = query.trim().toLowerCase();
  const str = String(text).trim().toLowerCase();
  if (!str) return false;

  if (str.startsWith(q)) return true;

  const words = str.split(/\s+/);
  return words.some((w) => w.startsWith(q));
}

/**
 * Checks if any of the specified fields on an object match the search query using matchesPrefix.
 */
export function matchesSearchFields(item, fields, query) {
  if (!query || !query.trim()) return true;
  if (!item) return false;
  return fields.some((field) => matchesPrefix(item[field], query));
}
