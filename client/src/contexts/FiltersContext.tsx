import { createContext, useContext, useState, ReactNode } from 'react';
import { Filters } from '@/hooks/useSalesData';

interface FiltersContextType {
  filters: Filters;
  setFilters: (filters: Filters) => void;
}

const FiltersContext = createContext<FiltersContextType | undefined>(undefined);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>({
    branch: 'all',
    paymentMethod: 'all',
    year: 'all',
    monthYear: 'all',
    dateRange: { from: undefined, to: undefined }
  });

  return (
    <FiltersContext.Provider value={{ filters, setFilters }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FiltersContext);
  if (context === undefined) {
    throw new Error('useFilters must be used within a FiltersProvider');
  }
  return context;
}
