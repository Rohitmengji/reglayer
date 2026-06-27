/**
 * RegLayer — readability analyzer (WCAG 3.1.5 Reading Level)
 *
 * Computes Flesch Reading Ease + Flesch–Kincaid grade level for body copy, so
 * teams can check content against the "lower secondary education level" bar WCAG
 * AAA asks for. Syllable counting is the standard vowel-group heuristic. Pure.
 */
export interface ReadabilityReport {
  words: number;
  sentences: number;
  syllables: number;
  fleschReadingEase: number; // 0–100ish (higher = easier)
  fleschKincaidGrade: number; // US grade level
  level: string; // human label
  meetsWcagAaa: boolean; // FK grade <= 9 (≈ lower secondary)
}

/** Count syllables in a single word via the vowel-group heuristic. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);
  let count = groups ? groups.length : 0;
  // Common silent-e / trailing patterns can drive it to 0 — clamp to 1.
  if (count === 0) count = 1;
  return count;
}

const FRE_LEVELS: [number, string][] = [
  [90, "Very easy (5th grade)"],
  [80, "Easy (6th grade)"],
  [70, "Fairly easy (7th grade)"],
  [60, "Plain English (8th–9th grade)"],
  [50, "Fairly difficult (10th–12th grade)"],
  [30, "Difficult (college)"],
  [-Infinity, "Very difficult (graduate)"],
];

export function analyzeReadability(text: string): ReadabilityReport {
  const clean = (text ?? "").trim();
  const sentenceCount = Math.max(1, (clean.match(/[.!?]+(?:\s|$)/g) || []).length);
  const wordTokens = clean.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || [];
  const words = wordTokens.length;

  if (words === 0) {
    return { words: 0, sentences: 0, syllables: 0, fleschReadingEase: 0, fleschKincaidGrade: 0, level: "No text", meetsWcagAaa: false };
  }

  const syllables = wordTokens.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = words / sentenceCount;
  const syllablesPerWord = syllables / words;

  const fre = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const fk = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const level = FRE_LEVELS.find(([min]) => fre >= min)![1];

  return {
    words,
    sentences: sentenceCount,
    syllables,
    fleschReadingEase: round1(fre),
    fleschKincaidGrade: round1(fk),
    level,
    meetsWcagAaa: fk <= 9,
  };
}
