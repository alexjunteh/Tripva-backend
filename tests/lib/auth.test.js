import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

function req(auth) {
  return { headers: auth ? { authorization: auth } : {} };
}

describe('auth helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockGetUser = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('keeps costly auth disabled by default', async () => {
    const { requireCostlyAuth, isCostlyAuthRequired } = await import('../../lib/auth.js');
    expect(isCostlyAuthRequired()).toBe(false);
    await expect(requireCostlyAuth(req())).resolves.toMatchObject({ ok: true, skipped: true });
  });

  it('requires a bearer token when enabled', async () => {
    vi.stubEnv('REQUIRE_AUTH_FOR_COSTLY_ENDPOINTS', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
    const { requireCostlyAuth } = await import('../../lib/auth.js');

    await expect(requireCostlyAuth(req())).resolves.toMatchObject({
      ok: false,
      status: 401,
      body: { error: 'Not authenticated' },
    });
  });

  it('rejects invalid Supabase tokens', async () => {
    vi.stubEnv('REQUIRE_AUTH_FOR_COSTLY_ENDPOINTS', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') });
    const { requireCostlyAuth } = await import('../../lib/auth.js');

    await expect(requireCostlyAuth(req('Bearer invalid'))).resolves.toMatchObject({
      ok: false,
      status: 401,
      body: { error: 'Invalid token' },
    });
  });

  it('accepts valid Supabase users', async () => {
    vi.stubEnv('REQUIRE_AUTH_FOR_COSTLY_ENDPOINTS', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@example.com' } }, error: null });
    const { requireCostlyAuth } = await import('../../lib/auth.js');

    await expect(requireCostlyAuth(req('Bearer valid'))).resolves.toMatchObject({
      ok: true,
      user: { id: 'user-1' },
    });
  });
});
