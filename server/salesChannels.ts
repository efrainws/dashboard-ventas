export const SALES_CHANNELS = ["Presencial", "eCommerce", "Rappi"] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

/**
 * Clasificación canónica de canal usada en todos los análisis de ventas.
 * Rappi tiene prioridad sobre eCommerce, igual que en el Análisis General.
 */
export function salesChannelCase(headerAlias: "sh" = "sh"): string {
  return `CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.methods_payment mp
      WHERE mp.header_id = ${headerAlias}.id
        AND mp.payment_account_id = '7a8fefe8-ddaa-40d1-ace5-d0aebb1b3204'::uuid
    ) THEN 'Rappi'
    WHEN ${headerAlias}.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89'::uuid
      THEN 'eCommerce'
    ELSE 'Presencial'
  END`;
}
