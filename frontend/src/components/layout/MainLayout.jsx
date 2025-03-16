import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import AuthContext from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const MainLayout = ({ children }) => {
  // Get authentication state from AuthContext
  const { isAuthenticated, logout } = useContext(AuthContext);
  
  // Get theme state from ThemeContext
  const { theme } = useTheme();
  
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className={`min-h-screen flex flex-col bg-background text-foreground`}>
      <Header 
        isAuthenticated={isAuthenticated} 
        onLogout={handleLogout}
      />
      <main className="flex-grow container py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout; 