/**
 * queryCache.ts
 * Módulo de caché en memoria para queries de PostgreSQL frecuentes.
 *
 * Características:
 * - TTL configurable por clave
 * - Thundering herd protection: si múltiples requests llegan mientras la query
 *   está en vuelo, todos esperan la misma Promise en lugar de lanzar N queries.
 * - Invalidación explícita por prefijo (útil al modificar datos)
 * - Métricas básicas (hits, misses, evictions) para diagnóstico
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  inflight: number;
  evictions: number;
}

const _store = new Map<string, CacheEntry<unknown>>();
const _inflight = new Map<string, Promise<unknown>>();

export const cacheMetrics: CacheMetrics = { hits: 0, misses: 0, inflight: 0, evictions: 0 };

/**
 * Obtiene un valor del caché o ejecuta el factory si no existe / expiró.
 *
 * @param key     Clave única del caché (incluir parámetros relevantes)
 * @param ttlMs   Tiempo de vida en milisegundos
 * @param factory Función async que produce el valor cuando hay miss
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>
): Promise<T> {
  const now = Date.now();

  // Cache hit
  const entry = _store.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > now) {
    cacheMetrics.hits++;
    return entry.value;
  }

  // Thundering herd: si ya hay una query en vuelo para esta clave, reutilizarla
  const existing = _inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    cacheMetrics.inflight++;
    return existing;
  }

  cacheMetrics.misses++;

  // Lanzar la query y registrarla como en vuelo
  const promise = (async () => {
    try {
      const value = await factory();
      _store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      _inflight.delete(key);
    }
  })();

  _inflight.set(key, promise);
  return promise;
}

/**
 * Invalida todas las entradas cuya clave empiece con el prefijo dado.
 * Útil para invalidar todo el caché de un proveedor o marca específica.
 */
export function invalidateByPrefix(prefix: string): void {
  const keysToDelete: string[] = [];
  _store.forEach((_, key) => {
    if (key.startsWith(prefix)) keysToDelete.push(key);
  });
  keysToDelete.forEach((k) => _store.delete(k));
}

/**
 * Invalida una clave exacta del caché.
 */
export function invalidateKey(key: string): void {
  _store.delete(key);
}

/**
 * Limpia todas las entradas expiradas (llamar periódicamente si el caché crece mucho).
 */
export function evictExpired(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  _store.forEach((entry, key) => {
    if (entry.expiresAt <= now) keysToDelete.push(key);
  });
  keysToDelete.forEach((k) => _store.delete(k));
  cacheMetrics.evictions += keysToDelete.length;
}

// Limpiar entradas expiradas cada 5 minutos
setInterval(evictExpired, 5 * 60 * 1000).unref();

// TTLs predefinidos para distintos tipos de datos
export const TTL = {
  /** Datos casi estáticos: catálogo de productos, lista de sucursales (5 min) */
  STATIC: 5 * 60 * 1000,
  /** Datos semi-estáticos: ventas mensuales, KPIs del mes (2 min) */
  SEMI_STATIC: 2 * 60 * 1000,
  /** Datos dinámicos: ventas con filtros de fecha (60 s) */
  DYNAMIC: 60 * 1000,
  /** Datos de configuración MySQL: brand_ids, category_brand_ids (30 s) */
  CONFIG: 30 * 1000,
} as const;
