import nacl from 'tweetnacl'

function hexToUint8Array(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g)
  return new Uint8Array((matches ?? []).map((byte) => Number.parseInt(byte, 16)))
}

export function verifyDiscordRequest(signature: string | null | undefined, timestamp: string | null | undefined, body: string, publicKey: string): boolean {
  if (!signature || !timestamp || !publicKey) {
    return false
  }

  const message = new TextEncoder().encode(timestamp + body)
  const signatureBytes = hexToUint8Array(signature)
  const publicKeyBytes = hexToUint8Array(publicKey)
  return nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes)
}
