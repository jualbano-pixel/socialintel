import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, isValidAccessToken } from './lib/demo-access';

export async function middleware(request) {
  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (await isValidAccessToken(token, password)) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!api/|auth/login|_next/static|_next/image|favicon.ico|login|logout).*)',
  ],
};
