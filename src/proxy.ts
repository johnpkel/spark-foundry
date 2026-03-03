import { NextRequest, NextResponse } from 'next/server';
// import { decryptSessionFromValue } from '@/lib/contentstack/oauth';

// Auth enforcement disabled — uncomment to require Contentstack login
export async function proxy(_request: NextRequest) {
  return NextResponse.next();

  /* --- Re-enable when OAuth flow is ready ---
  const cookie = _request.cookies.get('spark_cs_session');

  const loginUrl = new URL('/login', _request.url);
  loginUrl.searchParams.set('redirect', _request.nextUrl.pathname);

  if (!cookie?.value) {
    return NextResponse.redirect(loginUrl);
  }

  const session = await decryptSessionFromValue(cookie.value);
  if (!session) {
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('spark_cs_session');
    return response;
  }

  return NextResponse.next();
  */
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
};
