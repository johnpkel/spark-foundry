import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function GET(req: NextRequest) {
  const docName = req.nextUrl.searchParams.get('docName');
  if (!docName) {
    return NextResponse.json({ error: 'docName query param required' }, { status: 400 });
  }

  const secret = process.env.DOCUMENT_SERVER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      sub: 'current-user',
      allowedDocumentNames: [docName],
      iat: now,
      exp: now + 3600, // 1 hour
    },
    secret,
  );

  return NextResponse.json({ token });
}
