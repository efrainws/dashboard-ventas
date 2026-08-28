/**
 * Construye el detalle de líneas de una nota de crédito para un cajero.
 * Los cuatro parámetros enlazados son, en orden: fecha de inicio, fecha de fin,
 * código SAP de tienda e identificador de cajero (que puede ser nulo).
 */
export function buildCreditNoteTransactionsByCashierQuery(includeIgv: boolean) {
  const productAmountColumn = includeIgv ? "sd.total" : "sd.subtotal";
  const transactionAmountColumn = includeIgv ? "sh.total" : "sh.subtotal";

  return `
    SELECT
      sh.id::text AS header_id,
      COALESCE(sh.order_serial::text, sh.id::text) AS numero_transaccion,
      sh.doc_date::text AS fecha_transaccion,
      sh.cashier_id::text AS cashier_id,
      COALESCE(cashier.name, 'Sin cajero registrado') AS cashier_name,
      sh.customer_id::text AS customer_id,
      CASE
        WHEN sh.customer_id IS NULL
          OR sh.customer_id = '8572af00-5600-46ff-958c-9f4ff701a4a2'::uuid
          THEN 'Cliente no identificado'
        ELSE COALESCE(customer.commercial_name, 'Cliente no identificado')
      END AS cliente_vinculado,
      COALESCE(product.name, sd.descripcion, 'Producto desconocido') AS producto_nombre,
      product.int_sku::text AS sku,
      COALESCE(sd.quantity, 0)::numeric AS cantidad,
      COALESCE(${productAmountColumn}, 0)::numeric AS monto_producto,
      COALESCE(${transactionAmountColumn}, 0)::numeric AS monto_transaccion,
      COALESCE(SUM(sd.quantity) OVER (PARTITION BY sh.id), 0)::numeric
        AS cantidad_total_transaccion
    FROM public.sales_header sh
    INNER JOIN public.pos_by_branch pbb
      ON pbb.serie = sh.order_serial
      AND pbb.is_nc = TRUE
    LEFT JOIN public.branches branch ON branch.id = sh.branch_id
    LEFT JOIN public.cashier cashier ON cashier.id = sh.cashier_id
    LEFT JOIN public.customers customer ON customer.id = sh.customer_id
    LEFT JOIN public.sales_detail sd ON sd.header_id = sh.id
    LEFT JOIN public.products product ON product.id = sd.product_id
    WHERE sh.doc_date IS NOT NULL
      AND sh.doc_date >= $1::date
      AND sh.doc_date < ($2::date + INTERVAL '1 day')
      AND branch.sap_id = $3
      AND sh.cashier_id IS NOT DISTINCT FROM $4::uuid
    ORDER BY sh.doc_date DESC, sh.id, monto_producto DESC NULLS LAST;
  `;
}
