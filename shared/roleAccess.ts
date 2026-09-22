export const MANAGEMENT_ROLE = "management_user" as const;

/**
 * Roles que comparten el alcance funcional comercial. Mantenerlos juntos evita
 * que el rol Gerencia se desvíe de Especialista Comercial en controles de acceso.
 */
export const COMMERCIAL_SCOPE_ROLES = [
  "commercial_specialist",
  MANAGEMENT_ROLE,
] as const;

export function hasCommercialScope(role: string | null | undefined): boolean {
  return COMMERCIAL_SCOPE_ROLES.includes(role as typeof COMMERCIAL_SCOPE_ROLES[number]);
}

export function hasCommercialOrSystemScope(role: string | null | undefined): boolean {
  return role === "system_specialist" || hasCommercialScope(role);
}
