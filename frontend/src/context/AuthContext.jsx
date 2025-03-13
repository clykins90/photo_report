import { createContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Initialize state from localStorage if available
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user on initial render
  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const res = await api.get('/api/auth/profile');
          
          // Ensure the user always has a company property
          // In development, we'll add a fallback company ID if not provided
          let userData = res.data.data;
          
          // Check if user data doesn't have a company property or it's null
          if (!userData.company) {
            console.warn('User is missing company property. Using test company ID for development.');
            userData = {
              ...userData,
              company: '6601313e0bc8870bfc66a8e5' // Test company ID for development
            };
          }
          
          setUser(userData);
          setIsAuthenticated(true);
          // Save user data to localStorage
          localStorage.setItem('user', JSON.stringify(userData));
        } catch (err) {
          console.error('Auth loading error:', err);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
          setIsAuthenticated(false);
          setError('Authentication failed. Please log in again.');
        }
      }
      setLoading(false);
    };

    loadUser();
  }, [token]);

  // Register user
  const register = async (formData) => {
    try {
      setLoading(true);
      const res = await api.post('/api/auth/register', formData);
      
      // Ensure the registered user has a company property
      let userData = res.data.data.user;
      if (!userData.company) {
        console.warn('Registered user is missing company property. Using test company ID.');
        userData = {
          ...userData,
          company: '6601313e0bc8870bfc66a8e5' // Test company ID for development
        };
      }
      
      localStorage.setItem('token', res.data.data.token);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(res.data.data.token);
      setUser(userData);
      setIsAuthenticated(true);
      setError(null);
      return res.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Login user
  const login = async (email, password) => {
    try {
      setLoading(true);
      const res = await api.post('/api/auth/login', { email, password });
      
      // Ensure the logged in user has a company property
      let userData = res.data.data.user;
      if (!userData.company) {
        console.warn('Logged in user is missing company property. Using test company ID.');
        userData = {
          ...userData,
          company: '6601313e0bc8870bfc66a8e5' // Test company ID for development
        };
      }
      
      localStorage.setItem('token', res.data.data.token);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(res.data.data.token);
      setUser(userData);
      setIsAuthenticated(true);
      setError(null);
      return res.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Logout user
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  // Clear errors
  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        loading,
        error,
        register,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 