import { NextResponse } from 'next/server';

export function getSessionHeader(request) {
  return request.headers.get('x-session-id');
}

export function dbErr(error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}
