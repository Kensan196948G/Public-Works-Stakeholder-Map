/**
 * テスト用 JWT 生成ヘルパー（Access 検証テスト専用）。
 * 実運用の秘密鍵は使いません。WebCrypto でテスト用 RSA 鍵を都度生成します。
 */

export interface TestKeyPair {
  publicKeyPem: string;
  privateKey: CryptoKey;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** テスト用 RSA 鍵ペアを生成し、公開鍵を SPKI PEM 形式で返す */
export async function generateTestKeyPair(): Promise<TestKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  let binary = '';
  for (const byte of spki) binary += String.fromCharCode(byte);
  const body = btoa(binary).match(/.{1,64}/g)?.join('\n') ?? '';
  return {
    publicKeyPem: `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`,
    privateKey: keyPair.privateKey,
  };
}

export interface TestJwtPayload {
  sub: string;
  email?: string;
  name?: string;
  aud: string | string[];
  exp: number;
  iat: number;
}

/** テスト用 RS256 JWT を生成する */
export async function signTestJwt(
  privateKey: CryptoKey,
  payload: TestJwtPayload,
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerPart = b64url(JSON.stringify(header));
  const payloadPart = b64url(JSON.stringify(payload));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    ),
  );
  return `${headerPart}.${payloadPart}.${b64url(signature)}`;
}
