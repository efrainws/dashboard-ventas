import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  type SalesTemporalPageId,
  type TemporalState,
  parseTemporalState,
  serializeTemporalState,
} from "@shared/temporalFilterState";

function readSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

/**
 * Mantiene un borrador local y un estado aplicado reconstruible desde URL.
 * Las páginas agregan sus filtros específicos a apply() antes de navegar.
 */
export function useTemporalUrlState(pageId: SalesTemporalPageId) {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState(readSearch);
  const parsed = useMemo(() => parseTemporalState(pageId, search), [pageId, search]);
  const [applied, setApplied] = useState<TemporalState>(parsed.state);
  const [draft, setDraft] = useState<TemporalState>(parsed.state);
  const [issue, setIssue] = useState<string | undefined>(parsed.issue);

  useEffect(() => {
    const sync = () => setSearch(readSearch());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    const next = parseTemporalState(pageId, search);
    setApplied(next.state);
    setDraft(next.state);
    setIssue(next.issue);
  }, [pageId, search]);

  const applyState = useCallback(
    (nextState: TemporalState, params?: URLSearchParams): string => {
      const source = params ?? new URLSearchParams(readSearch());
      const query = serializeTemporalState(source.toString(), nextState);
      const href = query ? `${location}?${query}` : location;
      setIssue(undefined);
      setApplied(nextState);
      setDraft(nextState);
      setLocation(href);
      return href;
    },
    [location, setLocation],
  );

  const apply = useCallback(
    (params?: URLSearchParams) => applyState(draft, params),
    [applyState, draft],
  );

  const reset = useCallback(() => {
    const next = parseTemporalState(pageId, "").state;
    setDraft(next);
    return next;
  }, [pageId]);

  return {
    applied,
    draft,
    setDraft,
    issue,
    setIssue,
    hasPendingChanges: JSON.stringify(applied) !== JSON.stringify(draft),
    apply,
    applyState,
    reset,
  };
}
