import * as DocumentPicker from "expo-document-picker"
import type { PickedPicture } from "./pick-profile-picture.ts"

/** Longest side of a published picture; profile avatars render far smaller. */
const PICTURE_MAX_SIDE_PX = 256
const PICTURE_JPEG_QUALITY = 0.85

const loadImage = (file: File): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })

/**
 * Web's `pick-profile-picture.ts`, on a canvas as web-app's
 * `readProfilePicture`: the chosen image scaled to fit
 * {@link PICTURE_MAX_SIDE_PX} and re-encoded as a `data:image/jpeg` URL.
 */
export const pickProfilePicture = async (): Promise<PickedPicture> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: "image/*",
    multiple: false,
  })
  const file = result.canceled ? undefined : result.assets[0]?.file
  if (file === undefined) return { type: "cancelled" }
  if (!file.type.startsWith("image/")) return { type: "invalid" }

  const image = await loadImage(file)
  if (image === null || image.naturalWidth === 0) return { type: "invalid" }

  const scale = Math.min(
    1,
    PICTURE_MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight)
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext("2d")
  if (context === null) return { type: "invalid" }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return {
    type: "picked",
    dataUrl: canvas.toDataURL("image/jpeg", PICTURE_JPEG_QUALITY),
  }
}
