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

describe('Portal de Proveedores — P10 filtros aplicados en URL', () => {
  it('usa el estado temporal P10 y serializa los filtros específicos solo al aplicarlos', () => {
    expect(supplierPortal).toContain('useTemporalUrlState("P10")');
    expect(supplierPortal).toContain('"ventas_productos"');
    expect(supplierPortal).toContain('"stock_producto"');
    expect(supplierPortal).toContain('"catalogo_producto"');
    expect(supplierPortal).toContain('writeSupplierUrlFilters(params, "ventas", salesDraft)');
    expect(supplierPortal).toContain('writeSupplierUrlFilters(params, "stock", stockDraft)');
    expect(supplierPortal).toContain('writeSupplierUrlFilters(params, "productos", catalogDraft)');
    expect(supplierPortal).toContain('productIds: appliedSalesFilters.productIds.length > 0');
    expect(supplierPortal).toContain('productId: appliedStockFilters.productId');
  });

  it('ofrece aplicar y restablecer sin introducir una dimensión comparativa', () => {
    expect(supplierPortal).toContain('Aplicar filtros');
    expect(supplierPortal).toContain('Restablecer filtros');
    expect(supplierPortal).not.toMatch(/comparison|comparaci[oó]n|comparativo/i);
  });
});
