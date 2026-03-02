import { useState } from 'react';
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
import { Loader2, UserPlus, Pencil, Trash2, Key, Shield, User as UserIcon, Mail } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast as showToast } from 'sonner';
import { NavigationMenu } from '@/components/NavigationMenu';

type User = {
  id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  role: 'user' | 'admin';
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

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'user' as 'user' | 'admin',
    sendWelcomeEmail: true,
    notifyUser: true,
  });

  // Queries
  const { data: usersData, isLoading: usersLoading } = trpc.users.listUsers.useQuery();

  // Mutations
  const createMutation = trpc.users.createUser.useMutation({
    onSuccess: (data) => {
      if (data.emailSent) {
        showToast.success('Usuario creado y correo de bienvenida enviado', {
          description: 'El usuario recibirá sus credenciales por email.',
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
          description: 'El usuario recibió sus nuevas credenciales por email.',
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

  // Verificar permisos
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F4F1]">
        <Loader2 className="h-8 w-8 animate-spin text-[#232523]" />
      </div>
    );
  }

  if (!currentUser || currentUser.role !== 'admin') {
    setLocation('/');
    return null;
  }

  const openCreateDialog = () => {
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      role: 'user',
      sendWelcomeEmail: true,
      notifyUser: true,
    });
    setDialogMode('create');
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      username: user.username || '',
      password: '',
      name: user.name || '',
      email: user.email || '',
      role: user.role,
      sendWelcomeEmail: false,
      notifyUser: false,
    });
    setDialogMode('edit');
  };

  const openPasswordDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      ...formData,
      password: '',
      notifyUser: !!user.email, // auto-enable if user has email
    });
    setDialogMode('password');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setSelectedUser(null);
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      role: 'user',
      sendWelcomeEmail: true,
      notifyUser: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (dialogMode === 'create') {
      createMutation.mutate({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        email: formData.email || undefined,
        role: formData.role,
        sendWelcomeEmail: formData.sendWelcomeEmail,
      });
    } else if (dialogMode === 'edit' && selectedUser) {
      updateMutation.mutate({
        id: selectedUser.id,
        username: formData.username || undefined,
        name: formData.name || undefined,
        email: formData.email || undefined,
        role: formData.role,
      });
    } else if (dialogMode === 'password' && selectedUser) {
      updatePasswordMutation.mutate({
        id: selectedUser.id,
        newPassword: formData.password,
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
            </p>
          </div>
          <Button
            onClick={openCreateDialog}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Nuevo Usuario
          </Button>
        </div>

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
                  <TableHead className="text-foreground font-semibold">Usuario</TableHead>
                  <TableHead className="text-foreground font-semibold">Nombre</TableHead>
                  <TableHead className="text-foreground font-semibold">Email</TableHead>
                  <TableHead className="text-foreground font-semibold">Rol</TableHead>
                  <TableHead className="text-foreground font-semibold">Método</TableHead>
                  <TableHead className="text-foreground font-semibold">Último Acceso</TableHead>
                  <TableHead className="text-foreground font-semibold text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersData?.users.map((user) => (
                  <TableRow key={user.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.role === 'admin' ? (
                          <Shield className="h-4 w-4 text-foreground" />
                        ) : (
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="capitalize">{user.role}</span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{user.loginMethod || '-'}</TableCell>
                    <TableCell>{formatDate(user.lastSignedIn)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                          className="hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4 text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openPasswordDialog(user)}
                          className="hover:bg-muted"
                        >
                          <Key className="h-4 w-4 text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteUserId(user.id)}
                          disabled={user.id === currentUser.id}
                          className="hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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
        <DialogContent className="sm:max-w-[425px]">
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
              <div className="grid gap-2">
                <Label htmlFor="username">Nombre de Usuario</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              {dialogMode === 'create' && (
                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Rol</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: 'user' | 'admin') => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Welcome email option — only shown when creating and email is provided */}
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
                      Enviar correo de bienvenida
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {formData.email
                        ? 'Se enviará la URL, usuario y contraseña al email indicado.'
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
                disabled={createMutation.isPending || updateMutation.isPending}
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
              <DialogTitle className="text-foreground">
                Cambiar Contraseña
              </DialogTitle>
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
                  minLength={6}
                />
              </div>
              {/* Notify user option */}
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
                      ? `Se enviará la nueva contraseña a ${selectedUser.email}`
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
