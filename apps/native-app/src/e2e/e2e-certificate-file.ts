import { apiUrl } from "../core/native-env.ts"
import type { PickedCertificate } from "../platform/pick-certificate-file.ts"

/**
 * What the certificate picker returns in an e2e build: Maestro cannot drive
 * a document chooser, so the "chosen" file is the generated EIC certificate
 * the mock server serves (`e2e/scripts/mocks/eet.ts`; password
 * `generated-e2e-password`, as web's `createEetCertificateFile`).
 */
export const pickE2eCertificateFile = async (): Promise<PickedCertificate> => {
  const response = await fetch(apiUrl("/eet/test-certificate.p12"))
  const bytes = new Uint8Array(await response.arrayBuffer())
  return { name: "CZ1234567890.p12", read: async () => bytes }
}
