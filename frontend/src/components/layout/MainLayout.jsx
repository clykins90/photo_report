import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import AuthContext from '../../context/AuthContext';

const MainLayout = ({ children }) => {
  // Get authentication state from AuthContext instead of managing it locally
  const { isAuthenticated, logout } = useContext(AuthContext);
  
  const [theme, setTheme] = useState(() => {
    // Check for saved theme preference in localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  
  const navigate = useNavigate();

  // Update theme class on document when theme changes
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  // Listen for system preference changes if no saved preference
  useEffect(() => {
    if (!localStorage.getItem('theme')) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e) => {
        setTheme(e.matches ? 'dark' : 'light');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const handleLogout = () => {
    // Use AuthContext's logout function instead
    logout();
    navigate('/login');
  };

  return (
    <div className={`${theme} min-h-screen flex flex-col bg-background text-foreground`}>
      <Header 
        isAuthenticated={isAuthenticated} 
        onLogout={handleLogout} 
        theme={theme} 
        setTheme={setTheme} 
      />
      <main className="flex-grow container py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout; 