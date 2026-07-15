function levenshteinDistance(s: string, t: string) {
  // Handle empty strings
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  // Create a 2D array to store distances
  const matrix = Array.from({ length: s.length + 1 }, () =>
    (Array(t.length + 1) as number[]).fill(0)
  );

  // Initialize first row and column
  for (let i = 0; i <= s.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= t.length; j++) matrix[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1; // No cost if characters match
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // Deletion
        matrix[i][j - 1] + 1, // Insertion
        matrix[i - 1][j - 1] + cost // Substitution
      );
    }
  }

  return matrix[s.length][t.length];
}

export function stringSimilaritySimple(s: string, t: string) {
  const distance = levenshteinDistance(s, t);
  const maxLength = Math.max(s.length, t.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

export function stringSimilarityUncapped(s: string, t: string): number {
  const distance = levenshteinDistance(s, t);
  const maxLength = Math.max(s.length, t.length);
  const minLength = Math.min(s.length, t.length);
  const similarity = maxLength === 0 ? 1 : 1 - distance / maxLength;
  const weight = Math.sqrt(minLength / maxLength);
  return Math.min(1, similarity * weight);
}

export function stringSimilarity(s: string, t: string): number {
  const similarity = stringSimilarityUncapped(s, t);
  return similarity > 0.3 ? similarity : 0;
}
