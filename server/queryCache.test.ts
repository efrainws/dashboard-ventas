import { afterEach, describe, expect, it } from 'vitest';
import {
  cached,
  getCacheSnapshot,
  MAX_CACHE_ENTRIES,
  resetCacheForTests,
} from './queryCache';

afterEach(() => resetCacheForTests());

describe('queryCache', () => {
  it('reutiliza una consulta en vuelo para evitar thundering herd', async () => {
    let calls = 0;
    const factory = async () => {
      calls++;
      return 'resultado';
    };

    const [first, second] = await Promise.all([
      cached('same-key', 1_000, factory),
      cached('same-key', 1_000, factory),
    ]);

    expect(first).toBe('resultado');
    expect(second).toBe('resultado');
    expect(calls).toBe(1);
  });

  it('mantiene el número de entradas dentro de la capacidad definida', async () => {
    for (let index = 0; index < MAX_CACHE_ENTRIES + 1; index++) {
      await cached(`key-${index}`, 1_000, async () => index);
    }

    const snapshot = getCacheSnapshot();
    expect(snapshot.size).toBe(MAX_CACHE_ENTRIES);
    expect(snapshot.evictions).toBeGreaterThan(0);
  });
});
