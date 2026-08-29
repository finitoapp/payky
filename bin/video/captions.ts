/**
 * Shared between the Playwright capture script (which produces these) and
 * the Remotion composition (which reads them back to render captions and to
 * size the composition's duration to the actual recording length).
 */
export interface CaptionCue {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}

export interface CaptionTimelineFile {
  readonly durationMs: number
  readonly cues: ReadonlyArray<CaptionCue>
}
