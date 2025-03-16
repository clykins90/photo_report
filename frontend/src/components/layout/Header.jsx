import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { ThemeToggle } from '../ui/theme-toggle';
import { useAuth } from '../../context/AuthContext';

const Header = ({ onLogout }) => {
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Check if user is authenticated
  const isAuthenticated = !!user;
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };
  
  return (
    <header className="bg-muted/50 text-foreground border-b border-border sticky top-0 z-40">
      <div className="container py-3 flex justify-between items-center">
        <Link to={isAuthenticated ? "/dashboard" : "/login"} className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M15 8h.01"></path>
            <rect width="16" height="20" x="4" y="2" rx="2" ry="2"></rect>
            <path d="M4 22h16"></path>
            <path d="M4 16h16"></path>
            <path d="M9 22v-6"></path>
            <path d="M15 22v-6"></path>
          </svg>
          <span>HeroReport</span>
        </Link>
        
        {/* Mobile menu button and theme toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button 
            className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMobileMenuOpen ? (
                <path d="M18 6 6 18M6 6l12 12"/>
              ) : (
                <path d="M4 12h16M4 6h16M4 18h16"/>
              )}
            </svg>
          </button>
        </div>
        
        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/profile">Profile</Link>
              </Button>
              <Button variant="ghost" onClick={onLogout}>Logout</Button>
            </>
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link to="/login">Login</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/register">Register</Link>
              </Button>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
      
      {/* Mobile navigation */}
      <div className={cn(
        "md:hidden overflow-hidden transition-all duration-300 ease-in-out border-t border-border bg-muted/50",
        isMobileMenuOpen ? "max-h-96" : "max-h-0"
      )}>
        <nav className="container py-3">
          <ul className="flex flex-col space-y-2">
            {isAuthenticated ? (
              <>
                <li>
                  <Button variant="ghost" className="w-full justify-start" asChild>
                    <Link to="/dashboard">Dashboard</Link>
                  </Button>
                </li>
                <li>
                  <Button variant="ghost" className="w-full justify-start" asChild>
                    <Link to="/profile">Profile</Link>
                  </Button>
                </li>
                <li>
                  <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
                    Logout
                  </Button>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link to="/login">Login</Link>
                  </Button>
                </li>
                <li>
                  <Button variant="secondary" className="w-full" asChild>
                    <Link to="/register">Register</Link>
                  </Button>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header; 