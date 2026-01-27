import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';

export type UserRole = 'admin' | 'viewer';

export interface User {
  username: string;
  role: UserRole;
  name: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Usuarios hardcodeados para demostración
const USERS: Record<string, { password: string; role: UserRole; name: string }> = {
  'admin': { password: 'admin123', role: 'admin', name: 'Administrador' },
  'user': { password: 'user123', role: 'viewer', name: 'Visualizador' }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const storedAuth = localStorage.getItem('dashboard_auth');
    const storedUser = localStorage.getItem('dashboard_user');
    
    if (storedAuth === 'true' && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = (username: string, password: string) => {
    const userAccount = USERS[username];
    
    if (userAccount && userAccount.password === password) {
      const userData: User = {
        username,
        role: userAccount.role,
        name: userAccount.name
      };
      
      localStorage.setItem('dashboard_auth', 'true');
      localStorage.setItem('dashboard_user', JSON.stringify(userData));
      
      setIsAuthenticated(true);
      setUser(userData);
      setLocation('/');
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('dashboard_auth');
    localStorage.removeItem('dashboard_user');
    setIsAuthenticated(false);
    setUser(null);
    setLocation('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
