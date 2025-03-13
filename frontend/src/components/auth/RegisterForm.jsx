import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

const RegisterForm = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, error, clearError } = useContext(AuthContext);
  const navigate = useNavigate();

  const { firstName, lastName, email, password, confirmPassword } = formData;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setFormError('');
    clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!firstName || !lastName || !email || !password) {
      setFormError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    try {
      setIsSubmitting(true);
      await register({
        firstName,
        lastName,
        email,
        password,
      });
      navigate('/dashboard');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-card p-8 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-card-foreground">Register</h2>
      
      {(formError || error) && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded mb-4">
          {formError || error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="firstName">
              First Name
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-foreground bg-background leading-tight focus:outline-none focus:shadow-outline"
              id="firstName"
              type="text"
              name="firstName"
              value={firstName}
              onChange={handleChange}
              placeholder="First Name"
              required
            />
          </div>
          
          <div className="flex-1">
            <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="lastName">
              Last Name
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-foreground bg-background leading-tight focus:outline-none focus:shadow-outline"
              id="lastName"
              type="text"
              name="lastName"
              value={lastName}
              onChange={handleChange}
              placeholder="Last Name"
              required
            />
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="email">
            Email
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-foreground bg-background leading-tight focus:outline-none focus:shadow-outline"
            id="email"
            type="email"
            name="email"
            value={email}
            onChange={handleChange}
            placeholder="Email"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="password">
            Password
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-foreground bg-background leading-tight focus:outline-none focus:shadow-outline"
            id="password"
            type="password"
            name="password"
            value={password}
            onChange={handleChange}
            placeholder="Password"
            required
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="confirmPassword">
            Confirm Password
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-foreground bg-background leading-tight focus:outline-none focus:shadow-outline"
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={handleChange}
            placeholder="Confirm Password"
            required
          />
        </div>
        
        <div className="flex items-center justify-between">
          <button
            className="bg-primary/90 hover:bg-primary/80 text-primary-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full border border-primary/20"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Registering...' : 'Register'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterForm; 