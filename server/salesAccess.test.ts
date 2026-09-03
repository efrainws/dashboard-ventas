import { describe, expect, it } from 'vitest';
import { applySalesStoreScope } from './_core/trpc';

const storeUser = {
  role: 'store_user',
  assignedStoreCode: 'FF11',
};

describe('applySalesStoreScope', () => {
  it('sobrescribe todos los filtros de tienda con la sucursal de sesión', () => {
    expect(applySalesStoreScope({
      branch_id: 'FF99',
      branch_sap_id: 'FF99',
      branchSapId: 'FF99',
      store_ids: ['FF99', 'FF20'],
    }, storeUser)).toEqual({
      branch_id: 'FF11',
      branch_sap_id: 'FF11',
      branchSapId: 'FF11',
      store_ids: ['FF11'],
    });
  });

  it('conserva los filtros solicitados para roles con acceso multi-tienda', () => {
    const requested = { branch_id: 'FF99', store_ids: ['FF99'] };
    expect(applySalesStoreScope(requested, {
      role: 'system_specialist',
      assignedStoreCode: null,
    })).toBe(requested);
  });

  it('bloquea a usuarios de tienda sin una sucursal asignada', () => {
    expect(() => applySalesStoreScope({}, {
      role: 'store_user',
      assignedStoreCode: null,
    })).toThrow('no tiene una sucursal asignada');
  });
});
