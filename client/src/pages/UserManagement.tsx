import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLocation } from 'wouter';
import {
  Loader2,
  UserPlus,
  Pencil,
  Trash2,
  Key,
  Shield,
  User as UserIcon,
  Mail,
  Store,
  Briefcase,
  Package,
  Search,
  Send,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast as showToast } from 'sonner';
import { NavigationMenu } from '@/components/NavigationMenu';
import { AlertBanner } from '@/components/AlertBanner';

// ─── Tipos de rol ─────────────────────────────────────────────────────────────
type UserRole = 'system_specialist' | 'operations_specialist' | 'cst_user' | 'commercial_specialist' | 'store_user' | 'supplier_user' | 'own_brand_user';

const ROLE_LABELS: Record<UserRole, string> = {
  system_specialist: 'Especialista de Sistemas',
  operations_specialist: 'Especialista de Operaciones',
  cst_user: 'Usuario CST',
  commercial_specialist: 'Especialista Comercial',
  store_user: 'Usuario Tienda',
  supplier_user: 'Usuario Proveedor',
  own_brand_user: 'Usuario Marca Propia',
};

/**
 * Roles que cada tipo de usuario puede crear:
 * - system_specialist → todos excepto supplier_user (se crea desde Administración de Proveedores)
 * - cst_user → solo store_user
 * - commercial_specialist → ninguno (usa Administración de Proveedores)
 */
const CREATABLE_ROLES: Record<UserRole, UserRole[]> = {
  system_specialist: ['system_specialist', 'operations_specialist', 'cst_user', 'commercial_specialist', 'store_user', 'own_brand_user'],
  operations_specialist: ['store_user'],
  cst_user: ['store_user'],
  commercial_specialist: [],
  store_user: [],
  supplier_user: [],
  own_brand_user: [],
};

type User = {
  id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  role: UserRole;
  assignedStoreCode: string | null;
  assignedSupplierId: string | null;
  supplierName: string | null;
  loginMethod: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

type DialogMode = 'create' | 'edit' | 'password' | null;

export default function UserManagement() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierSearchInput, setSupplierSearchInput] = useState('');
  const [showDomainNoticePreview, setShowDomainNoticePreview] = useState(false);
  const [confirmDomainNotice, setConfirmDomainNotice] = useState(false);
  const [domainNoticeTested, setDomainNoticeTested] = useState(false);
  const [domainNoticeViewport, setDomainNoticeViewport] = useState<'desktop' | 'mobile'>('desktop');

  const currentRole = currentUser?.role as UserRole | undefined;

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '',
    role: 'store_user' as UserRole,
    assignedStoreCode: '',
    assignedSupplierId: '',
    sendWelcomeEmail: true,
    notifyUser: true,
  });

  // Queries
  const { data: usersData, isLoading: usersLoading } = trpc.users.listUsers.useQuery();
  const { data: branchesData } = trpc.users.getBranches.useQuery();
  const { data: suppliersData, isLoading: suppliersLoading } = trpc.users.getSuppliers.useQuery(
    { search: supplierSearch },
    { enabled: formData.role === 'supplier_user' }
  );
  const domainNoticePreview = trpc.users.previewDomainChangeNotice.useQuery(undefined, {
    enabled: showDomainNoticePreview && currentRole === 'system_specialist',
    retry: false,
  });

  // Debounce supplier search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSupplierSearch(supplierSearchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [supplierSearchInput]);

  // Mutations
  const createMutation = trpc.users.createUser.useMutation({
    onSuccess: (data) => {
      if (data.emailSent) {
        showToast.success('Usuario creado y correo de activación enviado', {
          description: 'El usuario recibirá el enlace de activación por email.',
          icon: '✉️',
        });
      } else {
        showToast.success('Usuario creado exitosamente');
      }
      utils.users.listUsers.invalidate();
      closeDialog();
    },
    onError: (error) => {
      showToast.error(error.message);
    },
  });

  const updateMutation = trpc.users.updateUser.useMutation({
    onSuccess: () => {
      showToast.success('Usuario actualizado exitosamente');
      utils.users.listUsers.invalidate();
      closeDialog();
    },
    onError: (error) => {
      showToast.error(error.message);
    },
  });

  const updatePasswordMutation = trpc.users.updatePassword.useMutation({
    onSuccess: (data) => {
      if (data.emailSent) {
        showToast.success('Contraseña actualizada y notificación enviada', {
          description: 'El usuario recibió un aviso de seguridad sin credenciales.',
          icon: '✉️',
        });
      } else {
        showToast.success('Contraseña actualizada exitosamente');
      }
      closeDialog();
    },
    onError: (error) => {
      showToast.error(error.message);
    },
  });

  const deleteMutation = trpc.users.deleteUser.useMutation({
    onSuccess: () => {
      showToast.success('Usuario eliminado exitosamente');
      utils.users.listUsers.invalidate();
      setDeleteUserId(null);
    },
    onError: (error) => {
      showToast.error(error.message);
    },
  });

  const [resendingUserId, setResendingUserId] = useState<number | null>(null);

  const resendActivationMutation = trpc.users.resendActivationEmail.useMutation({
    onSuccess: () => {
      showToast.success('Correo de activación reenviado', {
        description: 'El usuario recibirá el nuevo enlace de activación en su correo.',
        icon: '✉️',
      });
      setResendingUserId(null);
    },
    onError: (error) => {
      showToast.error(error.message);
      setResendingUserId(null);
    },
  });

  const sendDomainNoticeMutation = trpc.users.sendDomainChangeNotice.useMutation({
    onSuccess: (data) => {
      if (data.failedCount === 0) {
        showToast.success('Aviso de cambio de dominio enviado', {
          description: `Se enviaron ${data.sentCount} correos a usuarios con email válido.`,
        });
      } else {
        showToast.warning('El aviso se completó con incidencias', {
          description: `${data.sentCount} enviados y ${data.failedCount} sin entregar.`,
        });
      }
      setConfirmDomainNotice(false);
      setShowDomainNoticePreview(false);
    },
    onError: (error) => {
      showToast.error(error.message);
      setConfirmDomainNotice(false);
    },
  });

  const testDomainNoticeMutation = trpc.users.testDomainChangeNotice.useMutation({
    onSuccess: (data) => {
      setDomainNoticeTested(true);
      showToast.success('Correo de prueba enviado', {
        description: `La prueba se envió a ${data.testRecipientEmail}. Revisa el contenido antes de continuar.`,
      });
    },
    onError: (error) => showToast.error(error.message),
  });

  /**
   * Determina si el usuario actual puede reenviar activación al usuario objetivo.
   * Misma lógica que createUser:
   * - system_specialist → todos
   * - cst_user → solo store_user
   * - commercial_specialist → solo supplier_user
   */
  const canResendActivation = (targetRole: UserRole): boolean => {
    if (!currentRole) return false;
    if (currentRole === 'system_specialist') return true;
    if (currentRole === 'operations_specialist') return targetRole === 'store_user';
    if (currentRole === 'cst_user') return targetRole === 'store_user';
    if (currentRole === 'commercial_specialist') return targetRole === 'supplier_user';
    return false;
  };

  // Verificar permisos — solo gestores pueden acceder
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (!currentUser || currentRole === 'store_user' || currentRole === 'supplier_user' || currentRole === 'commercial_specialist' || currentRole === 'own_brand_user') {
    setLocation('/');
    return null;
  }

  const availableRoles: UserRole[] = CREATABLE_ROLES[currentRole ?? 'store_user'];

  const getDefaultRole = (): UserRole => {
    if (currentRole === 'cst_user') return 'store_user';
    return 'store_user';
  };

  // commercial_specialist no puede crear usuarios desde esta página
  const canCreateUsers = availableRoles.length > 0;

  const openCreateDialog = () => {
    const defaultRole = getDefaultRole();
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
      name: '',
      email: '',
      role: defaultRole,
      assignedStoreCode: '',
      assignedSupplierId: '',
      sendWelcomeEmail: true,
      notifyUser: true,
    });
    setSupplierSearchInput('');
    setSupplierSearch('');
    setDialogMode('create');
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      username: user.username || '',
      password: '',
      confirmPassword: '',
      name: user.name || '',
      email: user.email || '',
      role: user.role,
      assignedStoreCode: user.assignedStoreCode || '',
      assignedSupplierId: user.assignedSupplierId || '',
      sendWelcomeEmail: false,
      notifyUser: false,
    });
    setSupplierSearchInput('');
    setSupplierSearch('');
    setDialogMode('edit');
  };

  const openPasswordDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      ...formData,
      password: '',
      confirmPassword: '',
      notifyUser: false,
    });
    setDialogMode('password');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setSelectedUser(null);
    setSupplierSearchInput('');
    setSupplierSearch('');
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
      name: '',
      email: '',
      role: getDefaultRole(),
      assignedStoreCode: '',
      assignedSupplierId: '',
      sendWelcomeEmail: true,
      notifyUser: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validación frontend: proveedor obligatorio para supplier_user
    if (formData.role === 'supplier_user' && !formData.assignedSupplierId) {
      showToast.error('Debes seleccionar un proveedor para este tipo de usuario');
      return;
    }

    if (dialogMode === 'create') {
      createMutation.mutate({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        assignedStoreCode: formData.role === 'store_user' ? formData.assignedStoreCode : undefined,
        assignedSupplierId: formData.role === 'supplier_user' ? formData.assignedSupplierId : undefined,
        sendWelcomeEmail: formData.sendWelcomeEmail,
      });
    } else if (dialogMode === 'edit' && selectedUser) {
      updateMutation.mutate({
        id: selectedUser.id,
        username: formData.username || undefined,
        name: formData.name || undefined,
        email: formData.email || undefined,
        role: formData.role,
        assignedStoreCode: formData.role === 'store_user' ? (formData.assignedStoreCode || null) : null,
        assignedSupplierId: formData.role === 'supplier_user' ? (formData.assignedSupplierId || null) : null,
      });
    } else if (dialogMode === 'password' && selectedUser) {
      if (formData.password !== formData.confirmPassword) {
        showToast.error('Las contraseñas no coinciden');
        return;
      }
      updatePasswordMutation.mutate({
        id: selectedUser.id,
        newPassword: formData.password,
        confirmPassword: formData.confirmPassword,
        notifyUser: formData.notifyUser,
      });
    }
  };

  const handleDelete = (userId: number) => {
    deleteMutation.mutate({ id: userId });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStoreName = (sapId: string | null) => {
    if (!sapId) return '-';
    const branch = branchesData?.branches.find(b => b.sap_id === sapId);
    return branch ? `${branch.name} (${sapId})` : sapId;
  };

  /**
   * Devuelve el nombre del proveedor enriquecido desde el backend (supplierName).
   * Si no está disponible, cae al buscador local como fallback.
   */
  const getSupplierName = (user: User) => {
    if (user.supplierName) return user.supplierName;
    if (!user.assignedSupplierId) return '-';
    const supplier = suppliersData?.suppliers.find(s => s.id === user.assignedSupplierId);
    return supplier ? `${supplier.ruc} — ${supplier.name}` : user.assignedSupplierId;
  };

  const getRoleIcon = (role: UserRole) => {
    if (role === 'system_specialist') return <Shield className="h-4 w-4 text-foreground" />;
    if (role === 'cst_user') return <UserIcon className="h-4 w-4 text-muted-foreground" />;
    if (role === 'commercial_specialist') return <Briefcase className="h-4 w-4 text-muted-foreground" />;
    if (role === 'supplier_user') return <Package className="h-4 w-4 text-muted-foreground" />;
    return <Store className="h-4 w-4 text-muted-foreground" />;
  };

  const isSubmitDisabled =
    createMutation.isPending ||
    updateMutation.isPending ||
    (formData.role === 'store_user' && !formData.assignedStoreCode) ||
    (formData.role === 'supplier_user' && !formData.assignedSupplierId);

  // Etiqueta de restricción según rol
  const managerHint =
    currentRole === 'cst_user'
      ? 'Solo puedes gestionar Usuarios Tienda'
      : null;

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Administración de Usuarios
            </h1>
            <p className="text-muted-foreground">
              Gestiona los usuarios del sistema y sus permisos
              {managerHint && (
                <span className="ml-2 text-xs bg-muted px-2 py-1 rounded-full">{managerHint}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {currentRole === 'system_specialist' && (
              <Button variant="outline" onClick={() => {
                setDomainNoticeTested(false);
                setDomainNoticeViewport('desktop');
                setShowDomainNoticePreview(true);
              }}>
                <Mail className="mr-2 h-4 w-4" />
                Avisar cambio de dominio
              </Button>
            )}
            {canCreateUsers && (
              <Button
                onClick={openCreateDialog}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Nuevo Usuario
              </Button>
            )}
          </div>
        </div>

        <Dialog
          open={showDomainNoticePreview}
          onOpenChange={(open) => {
            if (!sendDomainNoticeMutation.isPending) {
              setShowDomainNoticePreview(open);
              if (!open) {
                setConfirmDomainNotice(false);
                setDomainNoticeTested(false);
              }
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Previsualizar aviso de cambio de dominio</DialogTitle>
              <DialogDescription>
                Revisa el dominio, contenido y cantidad de destinatarios antes de confirmar el envío.
              </DialogDescription>
            </DialogHeader>

            {domainNoticePreview.isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}

            {domainNoticePreview.error && (
              <AlertBanner variant="error" title="No pudimos generar la previsualización">
                {domainNoticePreview.error.message}
              </AlertBanner>
            )}

            {domainNoticePreview.data && (
              <div className="space-y-4">
                <AlertBanner variant="info" title="Envío manual y protegido">
                  Los destinatarios y la URL se resuelven desde el backend. Primero envía una prueba a tu correo autorizado; después podrás confirmar el aviso masivo una sola vez para este dominio.
                </AlertBanner>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Dominio público</p>
                    <p className="mt-1 break-all text-sm font-medium">{domainNoticePreview.data.publicUrl}</p>
                  </div>
                  <div className="border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Destinatarios válidos</p>
                    <p className="mt-1 text-sm font-medium">{domainNoticePreview.data.recipientCount} usuarios</p>
                    {domainNoticePreview.data.excludedCount > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">{domainNoticePreview.data.excludedCount} registro(s) sin correo válido no recibirán el aviso.</p>
                    )}
                  </div>
                  <div className="border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Remitente</p>
                    <p className="mt-1 text-sm font-medium">{domainNoticePreview.data.sender.name}</p>
                    <p className="text-xs text-muted-foreground">{domainNoticePreview.data.sender.email}</p>
                  </div>
                  <div className="border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Asunto</p>
                    <p className="mt-1 text-sm font-medium">{domainNoticePreview.data.subject}</p>
                  </div>
                </div>

                <div className="border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Vista aislada del correo</p>
                    <div className="flex gap-1" role="group" aria-label="Tamaño de previsualización">
                      <Button size="sm" variant={domainNoticeViewport === 'desktop' ? 'default' : 'outline'} onClick={() => setDomainNoticeViewport('desktop')}>Escritorio</Button>
                      <Button size="sm" variant={domainNoticeViewport === 'mobile' ? 'default' : 'outline'} onClick={() => setDomainNoticeViewport('mobile')}>Móvil</Button>
                    </div>
                  </div>
                  <div className="mt-3 overflow-auto border border-border bg-muted/20 p-3">
                    <iframe
                      title="Previsualización del aviso de cambio de dominio"
                      sandbox=""
                      srcDoc={domainNoticePreview.data.htmlContent}
                      className={`mx-auto block min-h-[470px] border border-border bg-white ${domainNoticeViewport === 'mobile' ? 'w-[360px]' : 'w-[600px] max-w-full'}`}
                    />
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ver versión de texto</summary>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{domainNoticePreview.data.textContent}</pre>
                  </details>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDomainNoticePreview(false)} disabled={sendDomainNoticeMutation.isPending}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={() => testDomainNoticeMutation.mutate()}
                disabled={!domainNoticePreview.data?.canSend || domainNoticeTested || testDomainNoticeMutation.isPending || sendDomainNoticeMutation.isPending}
              >
                {testDomainNoticeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                {domainNoticeTested ? 'Prueba enviada' : 'Enviar prueba'}
              </Button>
              <Button
                onClick={() => setConfirmDomainNotice(true)}
                disabled={!domainNoticePreview.data?.canSend || !domainNoticeTested || testDomainNoticeMutation.isPending || sendDomainNoticeMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                Continuar a confirmación
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmDomainNotice} onOpenChange={setConfirmDomainNotice}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Enviar aviso a todos los usuarios con correo válido?</AlertDialogTitle>
              <AlertDialogDescription>
                Ya se envió una prueba a tu correo autorizado. Al confirmar, el aviso se enviará a {domainNoticePreview.data?.recipientCount ?? 0} usuario(s) desde {domainNoticePreview.data?.sender.email ?? 'notificaciones@florayfauna.pe'} con la URL {domainNoticePreview.data?.publicUrl ?? 'publicada'}. La acción queda registrada y no se podrá repetir para el mismo dominio.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sendDomainNoticeMutation.isPending}>Volver</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  sendDomainNoticeMutation.mutate();
                }}
                disabled={sendDomainNoticeMutation.isPending}
              >
                {sendDomainNoticeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Confirmar envío
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Tabla de Usuarios */}
        <div className="bg-card rounded-lg shadow-sm border border-border">
          {usersLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border">
                  <TableHead className="text-foreground font-semibold">Email</TableHead>
                  <TableHead className="text-foreground font-semibold">Nombre</TableHead>
                  <TableHead className="text-foreground font-semibold">Rol</TableHead>
                  <TableHead className="text-foreground font-semibold">Asignación</TableHead>
                  <TableHead className="text-foreground font-semibold">Último Acceso</TableHead>
                  <TableHead className="text-foreground font-semibold text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersData?.users.map((user) => (
                  <TableRow key={user.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                    <TableCell className="font-medium">{user.email || '-'}</TableCell>
                    <TableCell>{user.name || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(user.role as UserRole)}
                        <span>{ROLE_LABELS[user.role as UserRole] ?? user.role}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.role === 'store_user'
                        ? getStoreName(user.assignedStoreCode)
                        : user.role === 'supplier_user'
                        ? getSupplierName(user)
                        : '-'}
                    </TableCell>
                    <TableCell>{formatDate(user.lastSignedIn)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user as User)}
                          className="hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4 text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openPasswordDialog(user as User)}
                          className="hover:bg-muted"
                        >
                          <Key className="h-4 w-4 text-foreground" />
                        </Button>
                        {canResendActivation(user.role as UserRole) && user.email && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reenviar correo de activación"
                            onClick={() => {
                              setResendingUserId(user.id);
                              resendActivationMutation.mutate({ id: user.id });
                            }}
                            disabled={resendingUserId === user.id}
                            className="hover:bg-[#1A6894]/10"
                          >
                            {resendingUserId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#1A6894]" />
                            ) : (
                              <Send className="h-4 w-4 text-[#1A6894]" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteUserId(user.id)}
                          disabled={user.id === currentUser.id}
                          className="hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4 text-[#BC2C46]" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Dialog para Crear/Editar Usuario */}
      <Dialog open={dialogMode === 'create' || dialogMode === 'edit'} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {dialogMode === 'create' ? 'Crear Nuevo Usuario' : 'Editar Usuario'}
              </DialogTitle>
              <DialogDescription>
                {dialogMode === 'create'
                  ? 'Completa la información para crear un nuevo usuario'
                  : 'Actualiza la información del usuario'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">


              {dialogMode === 'create' && (
                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña temporal</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                  <AlertBanner variant="warning">
                    <strong>Esta contraseña no se enviará por correo.</strong>{' '}Debes compartirla con el nuevo usuario por otro medio (mensaje directo, llamada, etc.). El usuario deberá cambiarla al activar su cuenta.
                  </AlertBanner>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="name">Nombre Completo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Correo electrónico <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="correo@empresa.com"
                />
              </div>

              {/* Selector de Rol */}
              <div className="grid gap-2">
                <Label htmlFor="role">Tipo de Usuario</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: UserRole) => {
                    setFormData({
                      ...formData,
                      role: value,
                      assignedStoreCode: value !== 'store_user' ? '' : formData.assignedStoreCode,
                      assignedSupplierId: value !== 'supplier_user' ? '' : formData.assignedSupplierId,
                    });
                    setSupplierSearchInput('');
                    setSupplierSearch('');
                  }}
                  disabled={currentRole === 'cst_user'}
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}><span>
                        {ROLE_LABELS[role]}
                      </span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selector de Tienda — solo para store_user */}
              {formData.role === 'store_user' && (
                <div className="grid gap-2">
                  <Label htmlFor="assignedStore">
                    Tienda Asignada <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.assignedStoreCode}
                    onValueChange={(value) => setFormData({ ...formData, assignedStoreCode: value })}
                    required
                  >
                    <SelectTrigger id="assignedStore">
                      <SelectValue placeholder="Seleccionar tienda..." />
                    </SelectTrigger>
                    <SelectContent>
                      {branchesData?.branches.map((branch) => (
                        <SelectItem key={branch.sap_id} value={branch.sap_id}><span>
                          {branch.name} — {branch.sap_id}
                        </span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    El usuario solo podrá ver información de esta tienda.
                  </p>
                </div>
              )}

              {/* Selector de Proveedor — solo para supplier_user */}
              {formData.role === 'supplier_user' && (
                <div className="grid gap-2">
                  <Label htmlFor="supplierSearch">
                    Proveedor Asignado <span className="text-destructive">*</span>
                  </Label>
                  {/* Búsqueda por RUC */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="supplierSearch"
                      placeholder="Buscar por RUC..."
                      value={supplierSearchInput}
                      onChange={(e) => setSupplierSearchInput(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  {/* Lista de resultados */}
                  <Select
                    value={formData.assignedSupplierId}
                    onValueChange={(value) => setFormData({ ...formData, assignedSupplierId: value })}
                  >
                    <SelectTrigger id="assignedSupplier">
                      <SelectValue placeholder={suppliersLoading ? 'Cargando...' : 'Seleccionar proveedor...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliersLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : suppliersData?.suppliers.length === 0 ? (
                        <div className="py-4 text-center text-sm text-muted-foreground">
                          No se encontraron proveedores
                        </div>
                      ) : (
                        suppliersData?.suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}><span>
                            {supplier.ruc} — {supplier.name}
                          </span></SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    El usuario solo tendrá acceso al portal de proveedores con este proveedor asignado.
                  </p>
                </div>
              )}

              {/* Opción de enviar email de activación */}
              {dialogMode === 'create' && (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3">
                  <Checkbox
                    id="sendWelcomeEmail"
                    checked={formData.sendWelcomeEmail}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, sendWelcomeEmail: !!checked })
                    }
                    disabled={!formData.email}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5">
                    <label
                      htmlFor="sendWelcomeEmail"
                      className="flex items-center gap-1.5 text-sm font-medium text-foreground cursor-pointer"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Enviar correo de activación
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {formData.email
                        ? 'Se enviará el enlace de activación al email indicado.'
                        : 'Ingresa un email para habilitar esta opción.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={isSubmitDisabled}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {dialogMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para Cambiar Contraseña */}
      <Dialog open={dialogMode === 'password'} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-foreground">Cambiar Contraseña</DialogTitle>
              <DialogDescription>
                Ingresa la nueva contraseña para {selectedUser?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="newPassword">Nueva Contraseña</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={12}
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 12 caracteres, con mayúscula, minúscula y número.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  minLength={12}
                />
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3">
                <Checkbox
                  id="notifyUser"
                  checked={formData.notifyUser}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, notifyUser: !!checked })
                  }
                  disabled={!selectedUser?.email}
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <label
                    htmlFor="notifyUser"
                    className="flex items-center gap-1.5 text-sm font-medium text-foreground cursor-pointer"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Notificar al usuario por email
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {selectedUser?.email
                      ? `Se enviará un aviso de seguridad a ${selectedUser.email}; la contraseña no se incluirá.`
                      : 'El usuario no tiene email registrado.'}
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={updatePasswordMutation.isPending}
              >
                {updatePasswordMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Actualizar Contraseña
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmación para Eliminar */}
      <AlertDialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El usuario será eliminado permanentemente del sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserId && handleDelete(deleteUserId)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar Usuario
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
