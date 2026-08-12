/**
 * Cloudflare Access JWT 検証とアプリ内 RBAC（詳細設計 §11・Issue #34）。
 * - Access が注入する `CF-Access-JWT-Assertion` を RS256 で検証する
 * - 検証キーは AUTH_CERT_PEM（SPKI PEM）または AUTH_JWKS_URL（JWKS）から取得
 * - ロールはメールアドレスから決定的に割り当てる（viewer < reviewer < editor < admin）
 * - ロールは「正しさの保証」ではなく操作権限の境界を表す
 */

export const ADMIN_ROLES = ['viewer', 'reviewer', 'editor', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_ORDER: Record<AdminRole, number> = {
  viewer: 0,
  reviewer: 1,
  editor: 2,
  admin: 3,
};

export interface AccessClaims {
  sub: string;
  email: string | null;
  name: string | null;
  aud: string | string[];
  exp: number;
  iat: number;
  role: AdminRole;
}

export interface AuthConfig {
  enabled: boolean;
  /** Access アプリの audience（例: https://<team>.cloudflareaccess.com） */
  audience: string;
  jwksUrl: string | null;
  certPem: string | null;
  adminEmails: readonly string[];
  reviewerEmails: readonly string[];
  editorEmails: readonly string[];
}

export const AUTH_HEADER = 'cf-access-jwt-assertion';

/** JWT パーツ（base64url 非パディング）の厳格な形式。%4=1 は不正なエンコード */
const JWT_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map<string, { keys: JwkWithKid[]; fetchedAt: number }>();

/** TS の Uint8Array<ArrayBufferLike> を WebCrypto が受ける ArrayBuffer へ変換する */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseJson<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JwkWithKid extends JsonWebKey {
  kid?: string;
}

function pemToSpki(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function roleForEmail(email: string | null, config: AuthConfig): AdminRole {
  if (email === null) return 'viewer';
  const normalized = email.toLowerCase();
  if (config.adminEmails.includes(normalized)) return 'admin';
  if (config.reviewerEmails.includes(normalized)) return 'reviewer';
  if (config.editorEmails.includes(normalized)) return 'editor';
  return 'viewer';
}

function audienceMatches(claimsAud: string | string[] | undefined, audience: string): boolean {
  if (claimsAud === undefined) return false;
  if (typeof claimsAud === 'string') return claimsAud === audience;
  return claimsAud.includes(audience);
}

async function importVerificationKey(
  header: JwtHeader,
  config: AuthConfig,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<CryptoKey | null> {
  if (config.certPem !== null) {
    return crypto.subtle.importKey(
      'spki',
      toArrayBuffer(pemToSpki(config.certPem)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  }
  if (config.jwksUrl === null) return null;

  const now = Date.now();
  const cached = jwksCache.get(config.jwksUrl);
  let keys: JwkWithKid[];
  if (cached !== undefined && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    keys = cached.keys;
  } else {
    let response: Response;
    try {
      response = await fetchImpl(config.jwksUrl, { signal: AbortSignal.timeout(5000) });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    let payload: { keys?: unknown };
    try {
      payload = (await response.json()) as { keys?: unknown };
    } catch {
      return null;
    }
    if (!Array.isArray(payload.keys)) return null;
    keys = payload.keys.filter(
      (k): k is JwkWithKid => typeof k === 'object' && k !== null,
    );
    jwksCache.set(config.jwksUrl, { keys, fetchedAt: now });
  }

  const jwk = header.kid !== undefined ? keys.find((k) => k.kid === header.kid) : keys[0];
  if (jwk === undefined || jwk.n === undefined || jwk.e === undefined) return null;
  return crypto.subtle.importKey(
    'jwk',
    jwk as JwkWithKid,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Access JWT を検証し、検証済みクレームを返す。検証失敗・期限切れ・audience不一致は null。
 * alg は RS256 のみ許容（設計 §11: ヘッダーを無条件に信頼しない）。
 */
export async function verifyAccessJwt(
  token: string,
  config: AuthConfig,
  now: Date = new Date(),
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<AccessClaims | null> {
  if (!config.enabled || config.audience === '') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (headerPart === undefined || payloadPart === undefined || signaturePart === undefined) {
    return null;
  }
  // 形式不正（不正文字・長さ %4=1 の欠損パディング）は即時拒否する。
  // 曖昧な atob のデコード挙動に依存しない（2026-08-12 防御強化）
  if (
    !JWT_PART_PATTERN.test(headerPart) ||
    !JWT_PART_PATTERN.test(payloadPart) ||
    !JWT_PART_PATTERN.test(signaturePart) ||
    headerPart.length % 4 === 1 ||
    payloadPart.length % 4 === 1 ||
    signaturePart.length % 4 === 1
  ) {
    return null;
  }

  const header = parseJson<JwtHeader>(base64UrlDecode(headerPart));
  const payload = parseJson<{
    sub?: unknown;
    email?: unknown;
    name?: unknown;
    aud?: string | string[];
    exp?: unknown;
    iat?: unknown;
  }>(base64UrlDecode(payloadPart));
  if (header === null || payload === null || header.alg !== 'RS256') return null;
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    !audienceMatches(payload.aud, config.audience)
  ) {
    return null;
  }
  if (payload.exp <= Math.floor(now.getTime() / 1000)) return null;

  const key = await importVerificationKey(header, config, fetchImpl);
  if (key === null) return null;

  const data = toArrayBuffer(new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  const signature = toArrayBuffer(base64UrlDecode(signaturePart));
  let valid = false;
  try {
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
  } catch {
    // 検証失敗は false のまま（エラー詳細は返さない）
  }
  if (!valid) return null;

  const email =
    typeof payload.email === 'string' && payload.email !== '' ? payload.email : null;
  const name = typeof payload.name === 'string' && payload.name !== '' ? payload.name : null;
  return {
    sub: payload.sub,
    email,
    name,
    aud: payload.aud as string | string[],
    exp: payload.exp,
    iat: payload.iat,
    role: roleForEmail(email, config),
  };
}

function splitEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== '');
}

/** 環境変数から認証設定を組み立てる（未設定時は無効＝現行の 403 ガードを維持） */
export function authConfigFromEnv(env: {
  AUTH_ENABLED?: string;
  AUTH_AUDIENCE?: string;
  AUTH_JWKS_URL?: string;
  AUTH_CERT_PEM?: string;
  AUTH_ADMIN_EMAILS?: string;
  AUTH_REVIEWER_EMAILS?: string;
  AUTH_EDITOR_EMAILS?: string;
} | undefined): AuthConfig {
  const e = env ?? {};
  const enabled = e.AUTH_ENABLED === 'true';
  return {
    enabled,
    audience: e.AUTH_AUDIENCE ?? '',
    jwksUrl: e.AUTH_JWKS_URL ?? null,
    certPem: e.AUTH_CERT_PEM ?? null,
    adminEmails: splitEmails(e.AUTH_ADMIN_EMAILS),
    reviewerEmails: splitEmails(e.AUTH_REVIEWER_EMAILS),
    editorEmails: splitEmails(e.AUTH_EDITOR_EMAILS),
  };
}

export function hasRole(claims: AccessClaims | null, minimum: AdminRole): boolean {
  return claims !== null && ROLE_ORDER[claims.role] >= ROLE_ORDER[minimum];
}
