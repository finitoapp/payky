import * as DocumentPicker from "expo-document-picker"
import { File } from "expo-file-system"
import { ImageManipulator, SaveFormat } from "expo-image-manipulator"

/** Longest side of a published picture; profile avatars render far smaller. */
const PICTURE_MAX_SIDE_PX = 256
const PICTURE_JPEG_QUALITY = 0.85

export type PickedPicture =
  | { readonly type: "picked"; readonly dataUrl: string }
  | { readonly type: "invalid" }
  | { readonly type: "cancelled" }

/**
 * Lets the user choose an image and returns it as the `data:image/jpeg` URL a
 * Nostr profile carries, as web's `readProfilePicture`: scaled to fit
 * {@link PICTURE_MAX_SIDE_PX} and re-encoded as JPEG. The picker's cache copy
 * and the encoded file are deleted before returning, so no file URI is kept.
 */
export const pickProfilePicture = async (): Promise<PickedPicture> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: "image/*",
    copyToCacheDirectory: true,
    multiple: false,
  })
  const asset = result.canceled ? undefined : result.assets[0]
  if (asset === undefined) return { type: "cancelled" }

  const source = new File(asset.uri)
  try {
    const context = ImageManipulator.manipulate(asset.uri)
    const image = await context.renderAsync()
    const longest = Math.max(image.width, image.height)
    if (longest === 0) return { type: "invalid" }
    if (longest > PICTURE_MAX_SIDE_PX) {
      context.resize(
        image.width >= image.height
          ? { width: PICTURE_MAX_SIDE_PX }
          : { height: PICTURE_MAX_SIDE_PX }
      )
    }
    const saved = await (await context.renderAsync()).saveAsync({
      format: SaveFormat.JPEG,
      compress: PICTURE_JPEG_QUALITY,
      base64: true,
    })
    new File(saved.uri).delete()
    return saved.base64 === undefined
      ? { type: "invalid" }
      : { type: "picked", dataUrl: `data:image/jpeg;base64,${saved.base64}` }
  } catch {
    // Not decodable as an image.
    return { type: "invalid" }
  } finally {
    source.delete()
  }
}
