/**
 * IgvContext — Preferencia global IGV / sin IGV
 *
 * - includeIgv = true  → usar columna `total`    (precio con IGV, comportamiento por defecto)
 * - includeIgv = false → usar columna `subtotal` (precio sin IGV)
 *
 * La preferencia se persiste en sessionStorage para que sobreviva
 * navegación entre páginas dentro de la misma sesión del navegador.
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

const SESSION_KEY = 'ff_include_igv';

function readFromSession(): boolean {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored === null) return true; // default: con IGV
    return stored === 'true';
  } catch {
    return true;
  }
}

interface IgvContextType {
  includeIgv: boolean;
  setIncludeIgv: (value: boolean) => void;
  toggleIgv: () => void;
  /** Etiqueta corta para mostrar en UI: "Con IGV" | "Sin IGV" */
  igvLabel: string;
}

const IgvContext = createContext<IgvContextType | undefined>(undefined);

export function IgvProvider({ children }: { children: ReactNode }) {
  const [includeIgv, setIncludeIgvState] = useState<boolean>(readFromSession);

  const setIncludeIgv = useCallback((value: boolean) => {
    setIncludeIgvState(value);
    try {
      sessionStorage.setItem(SESSION_KEY, String(value));
    } catch {
      // sessionStorage no disponible (modo privado muy restrictivo)
    }
  }, []);

  const toggleIgv = useCallback(() => {
    setIncludeIgv(!includeIgv);
  }, [includeIgv, setIncludeIgv]);

  const igvLabel = includeIgv ? 'Con IGV' : 'Sin IGV';

  return (
    <IgvContext.Provider value={{ includeIgv, setIncludeIgv, toggleIgv, igvLabel }}>
      {children}
    </IgvContext.Provider>
  );
}

export function useIgv(): IgvContextType {
  const context = useContext(IgvContext);
  if (context === undefined) {
    throw new Error('useIgv must be used within an IgvProvider');
  }
  return context;
}
