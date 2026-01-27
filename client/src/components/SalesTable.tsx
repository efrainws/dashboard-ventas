import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sale } from "@/hooks/useSalesData";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface SalesTableProps {
  sales: Sale[];
}

const ITEMS_PER_PAGE = 10;

export function SalesTable({ sales }: SalesTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(sales.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentSales = sales.slice(startIndex, endIndex);

  const handlePrevious = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNext = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>N° Orden</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Métodos de Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentSales.length > 0 ? (
              currentSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>{sale.date_str}</TableCell>
                  <TableCell>{sale.order_number}</TableCell>
                  <TableCell>{sale.branch_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {sale.payment_methods.map((method, idx) => (
                        <span 
                          key={idx}
                          className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        >
                          {method}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {sale.currency} {sale.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No se encontraron resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          Mostrando {startIndex + 1} a {Math.min(endIndex, sales.length)} de {sales.length} registros
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentPage === totalPages}
          >
            Siguiente
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
