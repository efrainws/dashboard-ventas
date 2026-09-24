import { salesChannelCase, type SalesChannel } from "./salesChannels";

const GENERIC_CUSTOMER_ID = "8572af00-5600-46ff-958c-9f4ff701a4a2";

export interface CustomerDniSearchInput {
  dni: string;
  fechaMin: string;
  fechaMax: string;
  branchSapId?: string;
  salesChannel?: SalesChannel;
}

/**
 * Busca de forma exacta por `customers.ruc_dni`, que está indexado. El EXISTS
 * exige una venta dentro de los filtros activos, por lo que no expone clientes
 * fuera del alcance comercial del usuario ni abre detalles vacíos.
 */
export function buildCustomerByDniQuery(input: CustomerDniSearchInput) {
  const params: string[] = [input.dni, input.fechaMin, input.fechaMax];
  const filters: string[] = [
    "sh.doc_date IS NOT NULL",
    "sh.doc_date >= $2::date",
    "sh.doc_date < ($3::date + INTERVAL '1 day')",
  ];

  if (input.branchSapId && input.branchSapId !== "all") {
    params.push(input.branchSapId);
    filters.push(`b.sap_id = $${params.length}`);
  }

  if (input.salesChannel) {
    params.push(input.salesChannel);
    filters.push(`(${salesChannelCase("sh")}) = $${params.length}`);
  }

  return {
    query: `
      SELECT
        c.id::text AS customer_id,
        COALESCE(NULLIF(c.commercial_name, ''), 'Sin nombre') AS customer_name,
        c.ruc_dni AS dni
      FROM public.customers c
      WHERE c.ruc_dni = $1
        AND c.id <> '${GENERIC_CUSTOMER_ID}'::uuid
        AND EXISTS (
          SELECT 1
          FROM public.sales_header sh
          INNER JOIN public.branches b ON b.id = sh.branch_id
          WHERE sh.customer_id = c.id
            AND ${filters.join("\n            AND ")}
        )
      ORDER BY c.updated_at DESC NULLS LAST, c.id
      LIMIT 2;
    `,
    params,
  };
}
