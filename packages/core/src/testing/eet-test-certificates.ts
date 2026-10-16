const rsaSha256: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
}

const oids = {
  commonName: "2.5.4.3",
  country: "2.5.4.6",
  organization: "2.5.4.10",
  description: "2.5.4.13",
  sha256WithRsaEncryption: "1.2.840.113549.1.1.11",
  sha1: "1.3.14.3.2.26",
  pkcs7Data: "1.2.840.113549.1.7.1",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  certBag: "1.2.840.113549.1.12.10.1.3",
  x509Certificate: "1.2.840.113549.1.9.22.1",
} as const

const concatBytes = (...parts: ReadonlyArray<Uint8Array>): Uint8Array => {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const encodeLength = (length: number): Uint8Array => {
  if (length < 0x80) return new Uint8Array([length])
  const bytes: number[] = []
  for (let remaining = length; remaining > 0; remaining >>= 8) {
    bytes.unshift(remaining & 0xff)
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes])
}

const tlv = (
  tag: number,
  ...content: ReadonlyArray<Uint8Array>
): Uint8Array => {
  const body = concatBytes(...content)
  return concatBytes(new Uint8Array([tag]), encodeLength(body.length), body)
}

const sequence = (...items: ReadonlyArray<Uint8Array>) => tlv(0x30, ...items)
const set = (...items: ReadonlyArray<Uint8Array>) => tlv(0x31, ...items)
const explicit = (tagNumber: number, content: Uint8Array) =>
  tlv(0xa0 | tagNumber, content)
const octetString = (bytes: Uint8Array) => tlv(0x04, bytes)
const utf8String = (text: string) => tlv(0x0c, new TextEncoder().encode(text))
const nullValue = new Uint8Array([0x05, 0x00])

const integer = (value: number): Uint8Array => {
  const bytes: number[] = []
  for (
    let remaining = value;
    remaining > 0;
    remaining = Math.floor(remaining / 256)
  ) {
    bytes.unshift(remaining % 256)
  }
  if (bytes.length === 0 || (bytes[0] ?? 0) >= 0x80) bytes.unshift(0)
  return tlv(0x02, new Uint8Array(bytes))
}

const objectIdentifier = (dotted: string): Uint8Array => {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number)
  const bytes = [first * 40 + second]
  for (const arc of rest) {
    const chunk = [arc & 0x7f]
    for (let remaining = arc >> 7; remaining > 0; remaining >>= 7) {
      chunk.unshift((remaining & 0x7f) | 0x80)
    }
    bytes.push(...chunk)
  }
  return tlv(0x06, new Uint8Array(bytes))
}

const utcTime = (date: Date): Uint8Array => {
  const pad = (value: number) => String(value).padStart(2, "0")
  const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  return tlv(0x17, new TextEncoder().encode(text))
}

const algorithm = (oid: string) => sequence(objectIdentifier(oid), nullValue)

export interface TestCertificateSubject {
  readonly commonName: string
  readonly organization?: string
  readonly description?: string
}

const name = (subject: TestCertificateSubject): Uint8Array => {
  const attributes: ReadonlyArray<readonly [string, string | undefined]> = [
    [oids.description, subject.description],
    [oids.commonName, subject.commonName],
    [oids.organization, subject.organization],
    [oids.country, "CZ"],
  ]
  return sequence(
    ...attributes.flatMap(([oid, value]) =>
      value === undefined
        ? []
        : [set(sequence(objectIdentifier(oid), utf8String(value)))]
    )
  )
}

export interface TestCertificate {
  readonly certificateDer: Uint8Array
  readonly privateKeyPkcs8: Uint8Array
  readonly privateKey: CryptoKey
  readonly publicKey: CryptoKey
}

export const createTestCertificate = async ({
  subject,
  validFrom,
  validTo,
}: {
  readonly subject: TestCertificateSubject
  readonly validFrom: Date
  readonly validTo: Date
}): Promise<TestCertificate> => {
  const keys = await crypto.subtle.generateKey(rsaSha256, true, [
    "sign",
    "verify",
  ])
  const subjectPublicKeyInfo = new Uint8Array(
    await crypto.subtle.exportKey("spki", keys.publicKey)
  )
  const subjectName = name(subject)
  const tbsCertificate = sequence(
    explicit(0, integer(2)),
    integer(Math.floor(Math.random() * 1_000_000) + 1),
    algorithm(oids.sha256WithRsaEncryption),
    subjectName,
    sequence(utcTime(validFrom), utcTime(validTo)),
    subjectName,
    subjectPublicKeyInfo
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      rsaSha256.name,
      keys.privateKey,
      tbsCertificate as BufferSource
    )
  )

  return {
    certificateDer: sequence(
      tbsCertificate,
      algorithm(oids.sha256WithRsaEncryption),
      tlv(0x03, new Uint8Array([0]), signature)
    ),
    privateKeyPkcs8: new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", keys.privateKey)
    ),
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
  }
}

const sha1 = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-1", data as BufferSource))

const repeatToBlocks = (source: Uint8Array, blockSize: number): Uint8Array => {
  const length = Math.ceil(source.length / blockSize) * blockSize
  return Uint8Array.from(
    { length },
    (_, index) => source[index % source.length] ?? 0
  )
}

const derivePkcs12MacKey = async ({
  password,
  salt,
  iterations,
}: {
  readonly password: string
  readonly salt: Uint8Array
  readonly iterations: number
}): Promise<Uint8Array> => {
  const blockSize = 64
  const passwordBmp = new Uint8Array(password.length * 2 + 2)
  for (let index = 0; index < password.length; index += 1) {
    const code = password.charCodeAt(index)
    passwordBmp[index * 2] = code >> 8
    passwordBmp[index * 2 + 1] = code & 0xff
  }
  let digest = concatBytes(
    new Uint8Array(blockSize).fill(3),
    repeatToBlocks(salt, blockSize),
    repeatToBlocks(passwordBmp, blockSize)
  )
  for (let round = 0; round < iterations; round += 1) {
    digest = await sha1(digest)
  }
  return digest
}

const dataContentInfo = (content: Uint8Array) =>
  sequence(objectIdentifier(oids.pkcs7Data), explicit(0, octetString(content)))

export const createTestPkcs12 = async ({
  certificateDer,
  privateKeyPkcs8,
  password,
}: {
  readonly certificateDer: Uint8Array
  readonly privateKeyPkcs8: Uint8Array | null
  readonly password: string
}): Promise<Uint8Array> => {
  const certBag = sequence(
    objectIdentifier(oids.certBag),
    explicit(
      0,
      sequence(
        objectIdentifier(oids.x509Certificate),
        explicit(0, octetString(certificateDer))
      )
    )
  )
  const keyBags =
    privateKeyPkcs8 === null
      ? []
      : [sequence(objectIdentifier(oids.keyBag), explicit(0, privateKeyPkcs8))]
  const authenticatedSafe = sequence(
    dataContentInfo(sequence(certBag, ...keyBags))
  )
  const salt = crypto.getRandomValues(new Uint8Array(8))
  const iterations = 2048
  const macKey = await crypto.subtle.importKey(
    "raw",
    (await derivePkcs12MacKey({ password, salt, iterations })) as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  )
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", macKey, authenticatedSafe as BufferSource)
  )

  return sequence(
    integer(3),
    dataContentInfo(authenticatedSafe),
    sequence(
      sequence(algorithm(oids.sha1), octetString(mac)),
      octetString(salt),
      integer(iterations)
    )
  )
}
