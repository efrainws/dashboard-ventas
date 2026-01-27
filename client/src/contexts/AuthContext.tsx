import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const storedAuth = localStorage.getItem('dashboard_auth');
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const login = (password: string) => {
    // Contraseña simple hardcodeada para demostración
    // En producción, esto debería validarse contra un backend o variable de entorno
    if (password === 'admin') {
      localStorage.setItem('dashboard_auth', 'true');
      setIsAuthenticated(true);
      setLocation('/');
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('dashboard_auth');
    setIsAuthenticated(false);
    setLocation('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
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
