import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  // If no user is logged in, don't show the navbar
  if (!user) return null;
  
  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                PhotoReport
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                to="/"
                className="border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white hover:border-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link
                to="/reports/new"
                className="border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white hover:border-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                New Report
              </Link>
            </div>
          </div>
          
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <div className="relative">
              <div className="flex items-center">
                <button
                  onClick={handleLogout}
                  className="ml-3 bg-gray-200 dark:bg-gray-700 p-1 rounded-full text-gray-600 dark:text-gray-200 hover:text-gray-800 dark:hover:text-white focus:outline-none"
                >
                  <span className="px-2 py-1">Logout</span>
                </button>
              </div>
            </div>
          </div>
          
          <div className="-mr-2 flex items-center sm:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
            >
              <span className="sr-only">Open main menu</span>
              <svg
                className={`${isMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              <svg
                className={`${isMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} sm:hidden`}>
        <div className="pt-2 pb-3 space-y-1">
          <Link
            to="/"
            className="text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium"
            onClick={() => setIsMenuOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            to="/reports/new"
            className="text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium"
            onClick={() => setIsMenuOpen(false)}
          >
            New Report
          </Link>
          <button
            onClick={() => {
              setIsMenuOpen(false);
              handleLogout();
            }}
            className="text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium w-full text-left"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 