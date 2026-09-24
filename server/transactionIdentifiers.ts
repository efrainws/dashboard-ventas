/**
 * Expresión SQL canónica para el identificador visible de una transacción.
 * Mantiene la convención de negocio: serie-número; ante datos históricos sin
 * ambos componentes, conserva un identificador rastreable usando la cabecera.
 */
export function buildTransactionNumberSql(
  headerAlias = "sh",
  fallbackSql = `${headerAlias}.id::text`,
): string {
  return `
    COALESCE(
      NULLIF(
        CONCAT_WS(
          '-',
          NULLIF(${headerAlias}.order_serial::text, ''),
          NULLIF(${headerAlias}.order_number::text, '')
        ),
        ''
      ),
      ${fallbackSql}
    )
  `;
}
