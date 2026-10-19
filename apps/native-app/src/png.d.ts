/** Metro resolves an image import to its asset id, an `Image` source. */
declare module "*.png" {
  const asset: number
  export default asset
}
