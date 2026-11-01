import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose'

// One key set per Access team. jose caches the fetched keys and refetches on an unknown `kid`.
// This holds public keys only, never request data.
const keySets = new Map<string, JWTVerifyGetKey>()

export function remoteJwks(issuer: string): JWTVerifyGetKey {
  let keySet = keySets.get(issuer)
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer))
    keySets.set(issuer, keySet)
  }
  return keySet
}
