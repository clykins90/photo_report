import { Routes, Route, Navigate } from 'react-router-dom';
import { useContext, useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ReportDetailPage from './pages/ReportDetailPage';
import CreateReportPage from './pages/CreateReportPage';
import EditReportPage from './pages/EditReportPage';
import ProfilePage from './pages/ProfilePage';
import AuthContext from './context/AuthContext';
import SharedReportPage from './pages/SharedReportPage';
import BackupRecoveryPage from './pages/BackupRecoveryPage';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useContext(AuthContext);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  return children;
};

// 404 page component
const NotFound = () => (
  <div className="container mx-auto px-4 py-12 text-center">
    <h1 className="text-4xl font-bold text-foreground mb-4">404 - Page Not Found</h1>
    <p className="text-xl text-muted-foreground mb-8">The page you are looking for does not exist.</p>
    <a 
      href="/login" 
      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-4 rounded-lg shadow transition duration-300"
    >
      Return to Login
    </a>
  </div>
);

function App() {
  return (
    <>
      <MainLayout>
        <Routes>
          {/* Redirect root to login page */}
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
          {/* Protected routes */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/reports/new" 
            element={
              <ProtectedRoute>
                <CreateReportPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/reports/:id" 
            element={
              <ProtectedRoute>
                <ReportDetailPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/reports/:id/edit" 
            element={
              <ProtectedRoute>
                <EditReportPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/reports/backup-recovery" 
            element={
              <ProtectedRoute>
                <BackupRecoveryPage />
              </ProtectedRoute>
            } 
          />
          <Route path="/shared-report/:token" element={<SharedReportPage />} />
          
          {/* 404 route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MainLayout>
    </>
  );
}

export default App; 