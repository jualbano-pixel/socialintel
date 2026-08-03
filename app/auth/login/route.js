import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, ACCESS_MAX_AGE_SECONDS, createAccessToken } from '../../../lib/demo-access';

export async function POST(request) {
  const configuredPassword = process.env.DEMO_ACCESS_PASSWORD;
  const form = await request.formData();
  const submittedPassword = String(form.get('password') || '');
  const nextPath = String(form.get('next') || '/');
  const safeNextPath = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';

  if (!configuredPassword || submittedPassword !== configuredPassword) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNextPath)}`, request.url), 303);
  }

  const response = NextResponse.redirect(new URL(safeNextPath, request.url), 303);
  response.cookies.set(ACCESS_COOKIE, await createAccessToken(configuredPassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ACCESS_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
