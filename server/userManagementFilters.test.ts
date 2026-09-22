import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("filtros de Administración de Usuarios", () => {
  it("envía los filtros seleccionados al contrato de usuarios", () => {
    const page = source("client/src/pages/UserManagement.tsx");

    expect(page).toContain("const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');");
    expect(page).toContain("const [storeFilter, setStoreFilter] = useState('all');");
    expect(page).toContain("const userListInput = useMemo(() => ({");
    expect(page).toContain("assignedStoreCode: storeFilter");
    expect(page).toContain("trpc.users.listUsers.useQuery(userListInput)");
  });

  it("muestra los controles, limpieza y estado vacío accesibles", () => {
    const page = source("client/src/pages/UserManagement.tsx");

    expect(page).toContain('htmlFor="user-role-filter"');
    expect(page).toContain('htmlFor="user-store-filter"');
    expect(page).toContain("Tipo de usuario");
    expect(page).toContain("Tienda asignada");
    expect(page).toContain("Limpiar filtros");
    expect(page).toContain("No encontramos usuarios con los filtros seleccionados.");
  });

  it("conserva los filtros como condiciones SQL en backend", () => {
    const router = source("server/userRouter.ts");

    expect(router).toContain("assignedStoreCode: z.string().trim().min(1).max(64).optional()");
    expect(router).toContain("const scopedRole");
    expect(router).toContain("eq(users.assignedStoreCode, input.assignedStoreCode)");
    expect(router).toContain("where(and(roleConstraint, storeConstraint))");
  });
});
