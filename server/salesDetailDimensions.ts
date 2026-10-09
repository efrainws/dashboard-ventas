export const SALES_DETAIL_CHANNELS = [
  "Presencial",
  "eCommerce",
  "Rappi",
  "Sin clasificar",
] as const;

export type SalesDetailChannel = (typeof SALES_DETAIL_CHANNELS)[number];

/**
 * Dimensiones canónicas de los módulos de ventas migrados a sales_detail.
 *
 * `costing_code` se cruza por SAP con branches y `costing_code3` define el
 * canal. Los valores fuera de CF/ECM/UMI se conservan explícitamente para no
 * mezclarlos con ventas presenciales.
 */
export function salesDetailChannelCase(detailAlias = "sd"): string {
  return `CASE COALESCE(${detailAlias}.costing_code3, '')
    WHEN 'CF' THEN 'Presencial'
    WHEN 'ECM' THEN 'eCommerce'
    WHEN 'UMI' THEN 'Rappi'
    ELSE 'Sin clasificar'
  END`;
}

/** Preserves unmatched sales lines so data-quality gaps remain visible. */
export function salesDetailBranchJoin(detailAlias = "sd", branchAlias = "b"): string {
  return `LEFT JOIN public.branches ${branchAlias}
    ON ${branchAlias}.sap_id = ${detailAlias}.costing_code`;
}

/** Normalized display values for lines whose costing code lacks an equivalence. */
export function salesDetailBranchName(branchAlias = "b"): string {
  return `INITCAP(LOWER(COALESCE(NULLIF(${branchAlias}.name, ''), 'Tienda sin equivalencia')))`;
}
