export type PasswordManagerSaveResult = "saved" | "unsupported" | "failed"

/**
 * The Credential Management API, which the DOM lib types only partly; `PasswordCredential`
 * exists in Chromium browsers over HTTPS and nowhere else.
 */
interface PasswordCredentialInit {
  readonly id: string
  readonly name: string
  readonly password: string
}
interface CredentialsEnv {
  readonly credentials?: {
    readonly store: (credential: Credential) => Promise<unknown>
  }
  readonly PasswordCredential?: new (init: PasswordCredentialInit) => Credential
}

/**
 * Offers the recovery phrase to the browser's password manager as the
 * password of `payky.seed:<accountId>`. The phrase passes through here and
 * nowhere else: it is neither logged nor reported, and a failure carries no
 * detail.
 */
export async function triggerPasswordManagerSeedSave(
  input: {
    readonly accountId: string
    readonly accountName: string
    readonly mnemonic: string
  },
  env: CredentialsEnv = {
    credentials: globalThis.navigator?.credentials,
    PasswordCredential: (globalThis as CredentialsEnv).PasswordCredential,
  }
): Promise<PasswordManagerSaveResult> {
  const { credentials, PasswordCredential } = env
  if (credentials === undefined || PasswordCredential === undefined) {
    return "unsupported"
  }
  try {
    await credentials.store(
      new PasswordCredential({
        id: `payky.seed:${input.accountId}`,
        name: input.accountName,
        password: input.mnemonic,
      })
    )
    return "saved"
  } catch {
    return "failed"
  }
}
