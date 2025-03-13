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
          
          // Ensure the user always has a valid company property
          let userData = res.data.data;
          
          // Check if user data doesn't have a company property or it's incomplete
          if (!userData.company || (typeof userData.company === 'object' && !userData.company.name)) {
            console.warn('User is missing company information. Attempting to fetch from company API...');
            
            try {
              // Try to fetch company data from API
              const companyRes = await api.get('/api/company');
              if (companyRes.data.success && companyRes.data.data && companyRes.data.data.name) {
                userData.company = companyRes.data.data;
                console.log('Successfully retrieved company data:', userData.company);
              } else {
                console.warn('Company API returned no valid data. Using test company ID for development.');
                userData.company = {
                  name: 'Test Company',
                  _id: '6601313e0bc8870bfc66a8e5' // Test company ID for development
                };
              }
            } catch (companyErr) {
              console.error('Failed to fetch company data:', companyErr);
              // Fallback to a development company
              userData.company = {
                name: 'Test Company',
                _id: '6601313e0bc8870bfc66a8e5' // Test company ID for development
              };
            }
          } else if (typeof userData.company === 'string') {
            // If company is just an ID string, try to convert it to an object with a name
            try {
              const companyRes = await api.get('/api/company');
              if (companyRes.data.success && companyRes.data.data) {
                userData.company = companyRes.data.data;
              } else {
                // Convert the string ID to a minimal company object
                userData.company = {
                  name: 'Company', // Default name
                  _id: userData.company // Keep the ID
                };
              }
            } catch (companyErr) {
              console.error('Failed to fetch company data:', companyErr);
              // Convert the string ID to a minimal company object
              userData.company = {
                name: 'Company', // Default name
                _id: userData.company // Keep the ID
              };
            }
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
      
      // Ensure the registered user has a valid company property
      let userData = res.data.data.user;
      
      // Check if user data doesn't have a company property or it's incomplete
      if (!userData.company || (typeof userData.company === 'object' && !userData.company.name)) {
        console.warn('Registered user is missing company information. Attempting to fetch from company API...');
        
        try {
          // Try to fetch company data from API if we have a token
          localStorage.setItem('token', res.data.data.token); // Set token first for auth
          const companyRes = await api.get('/api/company');
          if (companyRes.data.success && companyRes.data.data && companyRes.data.data.name) {
            userData.company = companyRes.data.data;
            console.log('Successfully retrieved company data:', userData.company);
          } else {
            console.warn('Company API returned no valid data. Using test company object for development.');
            userData.company = {
              name: 'Test Company',
              _id: '6601313e0bc8870bfc66a8e5' // Test company ID for development
            };
          }
        } catch (companyErr) {
          console.error('Failed to fetch company data:', companyErr);
          // Fallback to a development company
          userData.company = {
            name: 'Test Company',
            _id: '6601313e0bc8870bfc66a8e5' // Test company ID for development
          };
        }
      } else if (typeof userData.company === 'string') {
        // If company is just an ID string, try to convert it to an object with a name
        try {
          // Try to fetch company data from API if we have a token
          localStorage.setItem('token', res.data.data.token); // Set token first for auth
          const companyRes = await api.get('/api/company');
          if (companyRes.data.success && companyRes.data.data) {
            userData.company = companyRes.data.data;
          } else {
            // Convert the string ID to a minimal company object
            userData.company = {
              name: 'Company', // Default name
              _id: userData.company // Keep the ID
            };
          }
        } catch (companyErr) {
          console.error('Failed to fetch company data:', companyErr);
          // Convert the string ID to a minimal company object
          userData.company = {
            name: 'Company', // Default name
            _id: userData.company // Keep the ID
          };
        }
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
      
      // Ensure the logged in user has a valid company property
      let userData = res.data.data.user;
      
      // Check if user data doesn't have a company property or it's incomplete
      if (!userData.company || (typeof userData.company === 'object' && !userData.company.name)) {
        console.warn('Logged in user is missing company information. Attempting to fetch from company API...');
        
        try {
          // Try to fetch company data from API if we have a token
          localStorage.setItem('token', res.data.data.token); // Set token first for auth
          const companyRes = await api.get('/api/company');
          if (companyRes.data.success && companyRes.data.data && companyRes.data.data.name) {
            userData.company = companyRes.data.data;
            console.log('Successfully retrieved company data:', userData.company);
          } else {
            console.warn('Company API returned no valid data. Using test company object for development.');
            userData.company = {
              name: 'Test Company',
              _id: '6601313e0bc8870bfc66a8e5' // Test company ID for development
            };
          }
        } catch (companyErr) {
          console.error('Failed to fetch company data:', companyErr);
          // Fallback to a development company
          userData.company = {
            name: 'Test Company',
            _id: '6601313e0bc8870bfc66a8e5' // Test company ID for development
          };
        }
      } else if (typeof userData.company === 'string') {
        // If company is just an ID string, try to convert it to an object with a name
        try {
          // Try to fetch company data from API if we have a token
          localStorage.setItem('token', res.data.data.token); // Set token first for auth
          const companyRes = await api.get('/api/company');
          if (companyRes.data.success && companyRes.data.data) {
            userData.company = companyRes.data.data;
          } else {
            // Convert the string ID to a minimal company object
            userData.company = {
              name: 'Company', // Default name
              _id: userData.company // Keep the ID
            };
          }
        } catch (companyErr) {
          console.error('Failed to fetch company data:', companyErr);
          // Convert the string ID to a minimal company object
          userData.company = {
            name: 'Company', // Default name
            _id: userData.company // Keep the ID
          };
        }
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