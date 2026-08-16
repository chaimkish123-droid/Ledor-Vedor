import { withoutUser } from '@/lib/api';
import { clearSessionCookie } from '@/lib/auth';

export async function POST() {
  return withoutUser(async () => {
    await clearSessionCookie();
    return { ok: true };
  });
}
