import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { findDuplicates } from '@/lib/repo';

/** Quietly checked before anyone is added, so the same person never lands twice. */
export async function GET(request: NextRequest) {
  return withUser(() => {
    const params = request.nextUrl.searchParams;
    const name = params.get('name') ?? '';
    if (name.trim().length < 2) return { candidates: [] };

    return {
      candidates: findDuplicates({
        name,
        birthYear: params.get('birthYear') ? Number(params.get('birthYear')) : null,
        parentIds: (params.get('parents') || '').split(',').filter(Boolean),
        spouseIds: (params.get('spouses') || '').split(',').filter(Boolean),
      }),
    };
  });
}
