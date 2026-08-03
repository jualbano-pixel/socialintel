import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from '../../lib/demo-access';

export function GET(request) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
