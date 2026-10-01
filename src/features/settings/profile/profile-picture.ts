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
 * A gallery picture as the `data:image/jpeg` URL a Nostr profile can carry:
 * scaled down to fit {@link PICTURE_MAX_SIDE_PX}, re-encoded as JPEG, so a
 * multi-megabyte photo becomes a few tens of kilobytes of profile metadata
 * (the form Linky reads and shows too). `null` when the browser cannot
 * decode the file as an image.
 */
export const readProfilePicture = async (
  file: File
): Promise<string | null> => {
  if (!file.type.startsWith("image/")) return null

  const image = await loadImage(file)
  if (image === null || image.naturalWidth === 0) return null

  const scale = Math.min(
    1,
    PICTURE_MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight)
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext("2d")
  if (context === null) return null

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", PICTURE_JPEG_QUALITY)
}
