import { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext();

// Create and export the useAuth hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

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
          setLoading(true);
          const res = await api.get('/auth/profile');
          
          // Handle nested data structure if present
          const responseData = res.data.data || res.data;
          
          // Ensure the user has a valid company property
          let userData = responseData.user || responseData;
          
          // Only fetch company data if it's completely missing
          if (!userData.company) {
            try {
              // Try to get company info
              const companyRes = await api.get('/company');
              
              // Handle nested data structure for company response
              const companyData = companyRes.data.data || companyRes.data;
              
              if (companyData) {
                userData.company = companyData;
                console.log('Successfully retrieved company data:', userData.company);
              }
            } catch (companyError) {
              console.log('No company data found or error fetching it:', companyError.message);
            }
          } else if (typeof userData.company === 'string') {
            // If company is just an ID, create a minimal object without an extra API call
            userData.company = {
              name: 'Company', // Default name
              _id: userData.company // Keep the ID
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
      const res = await api.post('/auth/register', formData);
      
      // Handle nested data structure if present
      const responseData = res.data.data || res.data;
      
      // Ensure the registered user has a valid company property
      let userData = responseData.user;
      const userToken = responseData.token;
      
      // Check if user data doesn't have a company property or it's incomplete
      if (!userData.company || (typeof userData.company === 'object' && !userData.company.name)) {
        console.warn('Registered user is missing company information. Attempting to fetch from company API...');
        
        try {
          // Try to fetch company data from API if we have a token
          localStorage.setItem('token', userToken); // Set token first for auth
          const companyRes = await api.get('/company');
          
          // Handle nested data for company response
          const companyData = companyRes.data.data || companyRes.data;
          
          if (companyRes.data.success && companyData && companyData.name) {
            userData.company = companyData;
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
          localStorage.setItem('token', userToken); // Set token first for auth
          const companyRes = await api.get('/company');
          
          // Handle nested data for company response
          const companyData = companyRes.data.data || companyRes.data;
          
          if (companyRes.data.success && companyData) {
            userData.company = companyData;
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
      
      localStorage.setItem('token', userToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(userToken);
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
      
      // Enhanced logging for debugging
      console.log('Login attempt details:', {
        email,
        apiBaseUrl: api.defaults.baseURL,
        environment: import.meta.env.MODE
      });
      
      const res = await api.post('/auth/login', { email, password });
      
      console.log('Login successful, response:', res.status, res.statusText);

      // Handle nested data structure if present
      const responseData = res.data.data || res.data;
      
      // Ensure the logged in user has a valid company property
      let userData = responseData.user;
      const userToken = responseData.token;
      
      // Only fetch company data if it's missing or just an ID string
      if (!userData.company) {
        console.warn('Logged in user is missing company information. Attempting to fetch from company API...');
        
        try {
          // Try to fetch company data from API if we have a token
          localStorage.setItem('token', userToken); // Set token first for auth
          const companyRes = await api.get('/company');
          
          // Handle nested data for company response
          const companyData = companyRes.data.data || companyRes.data;
          
          if (companyRes.data.success && companyData && companyData.name) {
            userData.company = companyData;
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
        // If company is just an ID string, convert it to an object with a name
        // and fetch full details only if needed
        try {
          // Set a basic company object first to avoid multiple fetches
          userData.company = {
            name: 'Company', // Default name
            _id: userData.company // Keep the ID
          };
          
          // Try to fetch company data from API if we have a token
          localStorage.setItem('token', userToken); // Set token first for auth
          const companyRes = await api.get('/company');
          
          // Handle nested data for company response
          const companyData = companyRes.data.data || companyRes.data;
          
          if (companyRes.data.success && companyData) {
            userData.company = companyData;
          }
        } catch (companyErr) {
          console.error('Failed to fetch company data:', companyErr);
          // We already have the minimal company object, so no need to set it again
        }
      }
      
      localStorage.setItem('token', userToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(userToken);
      setUser(userData);
      setIsAuthenticated(true);
      setError(null);
      return res.data;
    } catch (err) {
      console.error('Login error details:', {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        url: err.config?.url,
        baseURL: err.config?.baseURL,
        fullURL: err.config?.baseURL + err.config?.url,
        headers: err.response?.headers,
        networkError: !err.response
      });
      
      // Set a more descriptive error message based on the status code
      if (err.response?.status === 404) {
        setError('API endpoint not found. Please check your network connection or try again later.');
      } else if (err.response?.status === 401) {
        setError(err.response?.data?.message || 'Invalid credentials');
      } else if (!err.response) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.response?.data?.message || 'Login failed');
      }
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