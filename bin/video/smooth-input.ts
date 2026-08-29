import type { Locator, Page } from "@playwright/test"
import type { CaptionCue } from "./captions.ts"

declare global {
  interface Window {
    __paykyMoveCursor?: (x: number, y: number) => void
    __paykyClickCursor?: (x: number, y: number) => void
  }
}

export interface CaptionTimeline {
  readonly cues: CaptionCue[]
  elapsedMs(): number
}

export function createCaptionTimeline(startedAt: number): CaptionTimeline {
  return {
    cues: [],
    elapsedMs: () => Date.now() - startedAt,
  }
}

/**
 * Wraps a recorded interaction with a caption cue timed to when it actually
 * ran, not a hand-guessed offset — so captions stay in sync regardless of
 * how long each step took to animate.
 */
export async function withCaption<Result>(
  timeline: CaptionTimeline,
  text: string,
  action: () => Promise<Result>
): Promise<Result> {
  const startMs = timeline.elapsedMs()
  const result = await action()
  timeline.cues.push({ text, startMs, endMs: timeline.elapsedMs() })
  return result
}

/**
 * Injects a fake on-page cursor so mouse movement and clicks are visible in
 * the recording. Playwright's synthetic input events never move the real OS
 * pointer, so without this the video would show no cursor at all.
 */
export async function installFakeCursor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const CURSOR_ID = "__payky_video_cursor"
    const RIPPLE_ID = "__payky_video_cursor_ripple"

    const install = () => {
      if (document.getElementById(CURSOR_ID)) return

      const style = document.createElement("style")
      style.textContent = `
        #${CURSOR_ID} {
          position: fixed;
          top: 0;
          left: 0;
          width: 26px;
          height: 26px;
          margin: -13px 0 0 -13px;
          border-radius: 9999px;
          background: rgba(37, 99, 235, 0.92);
          border: 2px solid white;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
          pointer-events: none;
          z-index: 2147483647;
          transition: transform 450ms cubic-bezier(0.22, 0.61, 0.36, 1);
          transform: translate(50vw, 50vh);
        }
        #${RIPPLE_ID} {
          position: fixed;
          top: 0;
          left: 0;
          width: 26px;
          height: 26px;
          margin: -13px 0 0 -13px;
          border-radius: 9999px;
          border: 2px solid rgba(37, 99, 235, 0.85);
          pointer-events: none;
          z-index: 2147483646;
          opacity: 0;
          transform: translate(-9999px, -9999px) scale(0.6);
        }
        #${RIPPLE_ID}.is-active {
          animation: __payky_cursor_ripple 420ms ease-out;
        }
        @keyframes __payky_cursor_ripple {
          from {
            opacity: 0.6;
            transform: translate(var(--payky-x), var(--payky-y)) scale(0.6);
          }
          to {
            opacity: 0;
            transform: translate(var(--payky-x), var(--payky-y)) scale(2.4);
          }
        }
      `
      document.head.append(style)

      const cursor = document.createElement("div")
      cursor.id = CURSOR_ID
      const ripple = document.createElement("div")
      ripple.id = RIPPLE_ID
      document.body.append(cursor, ripple)

      window.__paykyMoveCursor = (x, y) => {
        cursor.style.transform = `translate(${x}px, ${y}px)`
      }
      window.__paykyClickCursor = (x, y) => {
        ripple.style.setProperty("--payky-x", `${x}px`)
        ripple.style.setProperty("--payky-y", `${y}px`)
        ripple.classList.remove("is-active")
        // Force a reflow so the animation restarts on back-to-back clicks.
        void ripple.offsetWidth
        ripple.classList.add("is-active")
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true })
    } else {
      install()
    }
  })
}

/**
 * Moves the real (invisible) Playwright pointer and the fake on-page cursor
 * to the same point, letting CSS drive the visible easing while Playwright's
 * own step interpolation drives the real hover/hit-testing behavior.
 */
export async function smoothMoveTo(
  page: Page,
  x: number,
  y: number,
  options?: { readonly durationMs?: number }
): Promise<void> {
  const durationMs = options?.durationMs ?? 450

  await page.evaluate(
    ([targetX, targetY]) => window.__paykyMoveCursor?.(targetX, targetY),
    [x, y] as const
  )
  await page.mouse.move(x, y, { steps: 12 })
  await page.waitForTimeout(durationMs)
}

export async function smoothClick(
  page: Page,
  locator: Locator,
  options?: { readonly durationMs?: number }
): Promise<void> {
  const box = await locator.boundingBox()
  if (box === null) {
    throw new Error("smoothClick target has no bounding box (not visible?).")
  }

  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await smoothMoveTo(page, x, y, options)
  await page.evaluate(
    ([targetX, targetY]) => window.__paykyClickCursor?.(targetX, targetY),
    [x, y] as const
  )
  await page.mouse.down()
  await page.waitForTimeout(90)
  await page.mouse.up()
  await page.waitForTimeout(250)
}
