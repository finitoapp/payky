/** `jmeno@` plain and the domain emphasized: only TLS to that domain vouches for the recipient (withdraw/0005). */
export function LightningAddress({ address }: { readonly address: string }) {
  const at = address.lastIndexOf("@")
  return (
    <span className="break-all">
      {address.slice(0, at + 1)}
      <strong className="font-semibold text-foreground">
        {address.slice(at + 1)}
      </strong>
    </span>
  )
}
