import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Opacity for placeholder number `index` of `count`, fading a stack out
 * from fully opaque to 0.2 so it reads as a decaying stream of
 * unknown-length content rather than a fixed block. A lone placeholder
 * stays opaque.
 */
export function placeholderFadeOpacity(index: number, count: number): number {
  return count > 1 ? 1 - (index * 0.8) / (count - 1) : 1
}
