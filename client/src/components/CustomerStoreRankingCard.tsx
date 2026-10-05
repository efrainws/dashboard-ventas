import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type CustomerStoreRankingRow = {
  customer_id: string | null;
  customer_name: string;
  monto: number;
  transacciones: number;
  rn: number;
};

export type CustomerStoreRanking = {
  nombre: string;
  codigo: string;
  total: number;
  txn: number;
  customers: CustomerStoreRankingRow[];
};

const currency = (value: number) => new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const integer = (value: number) => new Intl.NumberFormat("es-PE").format(value);

export function CustomerStoreRankingCard({
  store,
  periodLabel,
  onCustomerClick,
}: {
  store: CustomerStoreRanking;
  periodLabel: string;
  onCustomerClick: (customerId: string | null, customerName: string) => void;
}) {
  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="ff-eyebrow">{periodLabel}</p>
            <CardTitle className="mt-1 truncate text-sm font-bold uppercase tracking-wide">{store.nombre}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Cód. {store.codigo} · {integer(store.txn)} txn · S/ {currency(store.total)}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">Top {store.customers.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Table>
          <TableHeader><TableRow className="border-border/40"><TableHead className="w-8 py-1.5 px-2 text-xs">#</TableHead><TableHead className="py-1.5 px-2 text-xs">Cliente</TableHead><TableHead className="py-1.5 px-2 text-right text-xs">Monto</TableHead><TableHead className="py-1.5 px-2 text-right text-xs">Txn</TableHead></TableRow></TableHeader>
          <TableBody>{store.customers.map(customer => (
            <TableRow key={customer.customer_id ?? customer.rn} className="cursor-pointer border-border/30 hover:bg-muted/40" onClick={() => onCustomerClick(customer.customer_id, customer.customer_name)}>
              <TableCell className="py-1.5 px-2 text-xs text-muted-foreground">{customer.rn}</TableCell>
              <TableCell className="max-w-[140px] py-1.5 px-2 text-xs font-medium"><span className="block truncate">{customer.customer_name}</span></TableCell>
              <TableCell className="py-1.5 px-2 text-right text-xs font-medium tabular-nums text-[var(--ff-esmeralda)]">S/ {currency(customer.monto)}</TableCell>
              <TableCell className="py-1.5 px-2 text-right text-xs tabular-nums text-muted-foreground">{integer(customer.transacciones)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
