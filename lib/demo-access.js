export const ACCESS_COOKIE = 'signal_demo_access';
export const ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function signPayload(payload, password) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createAccessToken(password) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    exp: Date.now() + ACCESS_MAX_AGE_SECONDS * 1000,
  })));
  const signature = await signPayload(payload, password);
  return `${payload}.${signature}`;
}

export async function isValidAccessToken(token, password) {
  if (!token || !password || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = await signPayload(payload, password);
  if (!timingSafeEqual(signature, expected)) return false;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
}
