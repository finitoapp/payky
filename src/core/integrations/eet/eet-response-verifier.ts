import type { ResponseSignatureVerifier } from "@finitoapp/eet-client"

import type { DateDep } from "@/core/deps.ts"
import { RSA_SHA256, readX509Certificate } from "./eet-certificate.ts"

export const EET_RESPONSE_SIGNER_ORGANIZATION = "Generální finanční ředitelství"

export const createEetResponseVerifier = (
  deps: DateDep
): ResponseSignatureVerifier => ({
  verify: async ({ signature }) => {
    const [leafDer] = signature.certificates
    if (leafDer === undefined) return false

    const leaf = readX509Certificate(leafDer)
    if (!leaf.ok) return false

    const now = deps.date.now()
    const { organization, validFrom, validTo, subjectPublicKeyInfo } =
      leaf.value
    if (organization !== EET_RESPONSE_SIGNER_ORGANIZATION) return false
    if (now < validFrom || now > validTo) return false

    try {
      const publicKey = await crypto.subtle.importKey(
        "spki",
        subjectPublicKeyInfo as BufferSource,
        RSA_SHA256,
        false,
        ["verify"]
      )
      return await crypto.subtle.verify(
        RSA_SHA256.name,
        publicKey,
        signature.signatureValue as BufferSource,
        signature.signedInfoCanonical as BufferSource
      )
    } catch {
      return false
    }
  },
})
