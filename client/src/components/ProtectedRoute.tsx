import { useAuth } from '@/contexts/AuthContext';
import { Redirect, Route, RouteProps } from 'wouter';

export function ProtectedRoute(props: RouteProps) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Route {...props} />;
}
