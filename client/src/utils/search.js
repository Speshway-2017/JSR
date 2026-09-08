/**
 * Checks if a string or any word within the string STARTS WITH the given query.
 * Strictly checks prefix matching — does NOT match if query is in the middle of a word.
 *
 * Examples:
 * - matchesPrefix("Madhu", "m") -> true ("Madhu" starts with "m")
 * - matchesPrefix("PRADEEP", "ad") -> false ("ad" is in the middle of "PRADEEP")
 * - matchesPrefix("Anil Kumar", "ku") -> true ("Kumar" starts with "ku")
 * - matchesPrefix("9876543210", "987") -> true
 * - matchesPrefix("9876543210", "543") -> false ("543" is in the middle)
 */
export function matchesPrefix(text, query) {
  if (!query || !query.trim()) return true;
  if (text == null) return false;
  const q = query.trim().toLowerCase();
  const str = String(text).trim().toLowerCase();
  if (!str) return false;

  // Check if whole text starts with query
  if (str.startsWith(q)) return true;

  // Check if any word within the text starts with query
  const words = str.split(/\s+/);
  return words.some((w) => w.startsWith(q));
}

/**
 * Checks if any of the specified fields on an object match the search query strictly by prefix.
 */
export function matchesSearchFields(item, fields, query) {
  if (!query || !query.trim()) return true;
  if (!item) return false;
  return fields.some((field) => matchesPrefix(item[field], query));
}

/**
 * Strictly filters items by prefix (word starts with query) and ranks/sorts results:
 * 1. Full string starts with query (score 1)
 * 2. Multi-word prefix matches (score 2)
 * 3. Any word in the field starts with query (score 3)
 * 4. Alphabetical tie-breaking A-Z
 * NO substring matches in the middle of words are allowed.
 */
export function searchAndSortItems(items, fields, query) {
  if (!Array.isArray(items)) return [];
  if (!query || !query.trim()) return items;

  const q = query.trim().toLowerCase();
  const qWords = q.split(/\s+/).filter(Boolean);

  const matched = items.filter((item) => {
    if (!item) return false;
    return fields.some((f) => {
      const val = item[f];
      if (val == null) return false;
      const str = String(val).trim().toLowerCase();
      if (!str) return false;

      // Full string starts with query
      if (str.startsWith(q)) return true;

      // Every query word must match the start of a word in field value
      const valWords = str.split(/\s+/);
      return qWords.every((qW) => valWords.some((vW) => vW.startsWith(qW)));
    });
  });

  return matched.sort((a, b) => {
    const getScore = (item) => {
      let bestScore = 999;
      for (const f of fields) {
        const val = item[f];
        if (val == null) continue;
        const str = String(val).trim().toLowerCase();
        if (!str) continue;

        if (str === q) {
          bestScore = Math.min(bestScore, 1); // Exact match
        } else if (str.startsWith(q)) {
          bestScore = Math.min(bestScore, 2); // Full string starts with query
        } else {
          const valWords = str.split(/\s+/);
          const allWordStarts = qWords.every((qW) => valWords.some((vW) => vW.startsWith(qW)));
          if (allWordStarts) {
            const firstWordMatch = valWords[0] && valWords[0].startsWith(qWords[0]);
            bestScore = Math.min(bestScore, firstWordMatch ? 3 : 4);
          }
        }
      }
      return bestScore;
    };

    const scoreA = getScore(a);
    const scoreB = getScore(b);
    if (scoreA !== scoreB) return scoreA - scoreB;

    const nameA = String(a.name || a.title || '').toLowerCase();
    const nameB = String(b.name || b.title || '').toLowerCase();
    return nameA.localeCompare(nameB, 'en', { numeric: true });
  });
}
