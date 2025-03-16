import { useTheme } from '../context/ThemeContext';
import LoginPage from './LoginPage';

// This file exists to maintain compatibility with the import in App.jsx
// It also ensures the login page has proper theming
const Login = () => {
  // We just need to import useTheme to ensure the context is active
  useTheme();
  
  // Re-exports the LoginPage component
  return <LoginPage />;
};

export default Login; 