import { Slip39WordList } from "@payky/core/modules/shared/slip39-word-list"
import { wordlist as bip39WordList } from "@scure/bip39/wordlists/english.js"

export const RESTORE_WORD_COUNT = 20

const SUGGESTION_LIMIT = 6
const slip39WordSet = new Set(Slip39WordList)
const bip39WordSet = new Set(bip39WordList)
const foreignSeedWordCounts = new Set([12, 15, 18, 21, 24])

export interface RestoreWordsFill {
  /** The slot to focus next: after the last word written, or the same slot while its word is still being typed. */
  readonly nextIndex: number
  /** How many of the typed words found no slot. */
  readonly overflow: number
  readonly words: ReadonlyArray<string>
}

export interface RestoreWordsAnalysis {
  readonly filledCount: number
  readonly invalidIndexes: ReadonlyArray<number>
  /** Every slot holds a word from the list. */
  readonly isComplete: boolean
  /** Completions for the slot being typed in. */
  readonly suggestions: ReadonlyArray<string>
}

export function emptyRestoreWords(): ReadonlyArray<string> {
  return Array.from({ length: RESTORE_WORD_COUNT }, () => "")
}

/** Lowercases and splits on whitespace, commas and semicolons. */
export function splitPhraseInput(value: string): ReadonlyArray<string> {
  return value
    .toLowerCase()
    .split(/[\s,;]+/u)
    .filter((word) => word.length > 0)
}

/** Writes typed or pasted text into the grid from `index`; several words fan out over the following slots. */
export function fillRestoreWords(
  words: ReadonlyArray<string>,
  index: number,
  value: string
): RestoreWordsFill {
  const tokens = splitPhraseInput(value)
  const next = [...words]
  if (tokens.length === 0) {
    next[index] = ""
    return { nextIndex: index, overflow: 0, words: next }
  }

  let written = 0
  for (const token of tokens) {
    const slot = index + written
    if (slot >= RESTORE_WORD_COUNT) break
    next[slot] = token
    written += 1
  }

  const wordIsDone = tokens.length > 1 || /[\s,;]$/u.test(value)
  return {
    nextIndex: wordIsDone
      ? Math.min(index + written, RESTORE_WORD_COUNT - 1)
      : index,
    overflow: tokens.length - written,
    words: next,
  }
}

export function analyzeRestoreWords(
  words: ReadonlyArray<string>,
  activeIndex: number | null
): RestoreWordsAnalysis {
  const activeWord = activeIndex === null ? "" : (words[activeIndex] ?? "")
  const suggestions =
    activeWord.length > 0 && !slip39WordSet.has(activeWord)
      ? Slip39WordList.filter((word) => word.startsWith(activeWord)).slice(
          0,
          SUGGESTION_LIMIT
        )
      : []

  const invalidIndexes = words.flatMap((word, index) => {
    if (word === "" || slip39WordSet.has(word)) return []
    // The slot being typed in stays neutral while the fragment can still become a word.
    if (index === activeIndex && suggestions.length > 0) return []
    return [index]
  })

  return {
    filledCount: words.filter((word) => word.length > 0).length,
    invalidIndexes,
    isComplete:
      words.length === RESTORE_WORD_COUNT &&
      words.every((word) => slip39WordSet.has(word)),
    suggestions,
  }
}

export function restoreWordsToPhrase(words: ReadonlyArray<string>): string {
  return words.filter((word) => word.length > 0).join(" ")
}

/**
 * Whether the words look like a seed from another wallet: a BIP-39 length
 * (12/15/18/21/24) or words that are all BIP-39 but not all SLIP-39.
 */
export function detectForeignSeed(words: ReadonlyArray<string>): boolean {
  const filled = words.filter((word) => word.length > 0)
  if (filled.length === 0) return false
  if (foreignSeedWordCounts.has(filled.length)) return true
  return (
    filled.every((word) => bip39WordSet.has(word)) &&
    filled.some((word) => !slip39WordSet.has(word))
  )
}
