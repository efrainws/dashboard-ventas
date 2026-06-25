import { describe, it, expect } from 'vitest';
import { ENV } from './_core/env';

describe('Flora & Fauna API credentials', () => {
  it('should have FF_API_USERNAME set', () => {
    expect(ENV.ffApiUsername).toBeTruthy();
  });

  it('should have FF_API_PASSWORD set', () => {
    expect(ENV.ffApiPassword).toBeTruthy();
  });

  it('should have FF_API_SITE set', () => {
    expect(ENV.ffApiSite).toBeTruthy();
  });

  it('should authenticate successfully with server.florayfauna.pe', async () => {
    const res = await fetch('https://server.florayfauna.pe/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: ENV.ffApiUsername,
        password: ENV.ffApiPassword,
        site:     ENV.ffApiSite,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { token?: string; message?: string };
    expect(data.message).toBe('Usuario autenticado correctamente');
    expect(typeof data.token).toBe('string');
    expect(data.token!.length).toBeGreaterThan(10);
  }, 15000);
});
