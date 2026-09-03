import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const supplierPortal = readFileSync(
  new URL('../client/src/pages/SupplierPortal.tsx', import.meta.url),
  'utf8',
);
const evolutionTable = readFileSync(
  new URL('../client/src/components/SalesEvolutionTable.tsx', import.meta.url),
  'utf8',
);

describe('Portal de Proveedores — formato de tiendas y stock', () => {
  it('muestra y exporta cada tienda junto con su código SAP', () => {
    expect(supplierPortal).toContain('function formatStoreLabel');
    expect(supplierPortal).toContain('"Tienda (SAP)"');
    expect(supplierPortal).toContain('formatStoreLabel(s.tienda, s.sap_id)');
    expect(supplierPortal).toContain('formatStoreLabel(r.tienda, r.sap_id)');
  });

  it('mantiene el patrón combinado en la tabla de evolución reutilizable', () => {
    expect(evolutionTable).toContain('Tienda (SAP)');
    expect(evolutionTable).toContain('`${row.tienda} (${row.sap_id})`');
  });
});
