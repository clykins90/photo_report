import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PhotoProvider } from './context/PhotoContext';
import { ReportProvider } from './context/ReportContext';

// Import main pages
import Dashboard from './pages/Dashboard';
import ReportBuilder from './pages/ReportBuilder';
import ReportViewer from './pages/ReportViewer';
import Login from './pages/Login';
import { useAuth } from './context/AuthContext';

// Import layout
import MainLayout from './components/layout/MainLayout';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return children;
};

function App() {
  return (
    <PhotoProvider>
      <ReportProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          
          {/* Protected routes with MainLayout */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout>
                <Dashboard />
              </MainLayout>
            </ProtectedRoute>
          } />
          
          <Route path="/reports/new" element={
            <ProtectedRoute>
              <MainLayout>
                <ReportBuilder />
              </MainLayout>
            </ProtectedRoute>
          } />
          
          <Route path="/reports/edit/:reportId" element={
            <ProtectedRoute>
              <MainLayout>
                <ReportBuilder isEditing={true} />
              </MainLayout>
            </ProtectedRoute>
          } />
          
          <Route path="/reports/:reportId" element={
            <ProtectedRoute>
              <MainLayout>
                <ReportViewer />
              </MainLayout>
            </ProtectedRoute>
          } />
          
          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ReportProvider>
    </PhotoProvider>
  );
}

export default App; 