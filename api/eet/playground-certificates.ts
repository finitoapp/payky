import { unzipSync } from "fflate"

export const PLAYGROUND_CERTIFICATES_ARCHIVE_URL =
  "https://eet.gov.cz/assets/cs/cmsmedia/pro-vyvojare/CAEET_Playground_2026_v1.zip"

const UPSTREAM_TIMEOUT_MS = 10_000

export interface PlaygroundCertificate {
  readonly fileName: string
  readonly p12Base64: string
}

export interface PlaygroundCertificatesResponse {
  readonly password: string
  readonly certificates: ReadonlyArray<PlaygroundCertificate>
}

interface PlaygroundCertificatesError {
  readonly status: "ERROR"
  readonly reason: string
}

const jsonHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600",
  "content-type": "application/json; charset=utf-8",
} as const

const jsonResponse = (
  body: PlaygroundCertificatesResponse | PlaygroundCertificatesError,
  init?: ResponseInit
): Response =>
  Response.json(body, {
    ...init,
    headers: { ...jsonHeaders, ...init?.headers },
  })

const upstreamFailure = (): Response =>
  jsonResponse(
    {
      status: "ERROR",
      reason: "The official EET test certificates are unavailable.",
    },
    { status: 502, headers: { "cache-control": "no-store" } }
  )

const baseName = (path: string): string => path.split("/").at(-1) ?? path

const readPlaygroundCertificatesArchive = (
  archive: Uint8Array
): PlaygroundCertificatesResponse | null => {
  const entries = Object.entries(unzipSync(archive)).map(
    ([path, bytes]) => [baseName(path), bytes] as const
  )
  const certificates = entries
    .filter(([fileName]) => fileName.toLowerCase().endsWith(".p12"))
    .map(([fileName, bytes]) => ({
      fileName,
      p12Base64: Buffer.from(bytes).toString("base64"),
    }))
  const passwordFile = entries.find(([fileName]) =>
    /^password.*\.txt$/iu.test(fileName)
  )
  const password =
    passwordFile === undefined
      ? ""
      : new TextDecoder().decode(passwordFile[1]).trim()

  if (certificates.length === 0 || password === "") return null
  return { password, certificates }
}

export const handlePlaygroundCertificatesRequest = async (
  request: Request,
  fetchArchive: typeof fetch = fetch
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...jsonHeaders,
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    })
  }

  if (request.method !== "GET") {
    return jsonResponse(
      { status: "ERROR", reason: "Method not allowed." },
      { status: 405 }
    )
  }

  try {
    const upstream = await fetchArchive(PLAYGROUND_CERTIFICATES_ARCHIVE_URL, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!upstream.ok) return upstreamFailure()

    const archive = readPlaygroundCertificatesArchive(
      new Uint8Array(await upstream.arrayBuffer())
    )
    return archive === null ? upstreamFailure() : jsonResponse(archive)
  } catch {
    return upstreamFailure()
  }
}

const handleRequest = (request: Request): Promise<Response> =>
  handlePlaygroundCertificatesRequest(request)

export const GET = handleRequest
export const OPTIONS = handleRequest

export default {
  fetch: handleRequest,
}
