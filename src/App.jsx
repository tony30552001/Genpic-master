import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import CreatePage from './pages/CreatePage';
import StylesPage from './pages/StylesPage';
import HistoryPage from './pages/HistoryPage';
import LoginPage from './pages/LoginPage';
import useAuth from './hooks/useAuth';

// 保護路由組件
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-muted border-t-primary motion-reduce:animate-none"
          aria-label="載入中"
          role="status"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/" element={
            <ProtectedRoute>
              <CreatePage />
            </ProtectedRoute>
          } />

          <Route path="/styles" element={
            <ProtectedRoute>
              <StylesPage />
            </ProtectedRoute>
          } />

          <Route path="/history" element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
