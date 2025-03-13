import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import LogoUploader from '../components/company/LogoUploader';
import api from '../services/api';

const CompanyProfilePage = () => {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    website: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: ''
    },
    branding: {
      primaryColor: '#2563EB',
      secondaryColor: '#475569'
    }
  });

  // Fetch company data
  useEffect(() => {
    const fetchCompanyData = async () => {
      try {
        setLoading(true);
        // For now, we don't need the ID since company info is part of the user profile
        const companyRes = await api.get('/api/company');
        setCompany(companyRes.data.data);
      } catch (error) {
        console.error('Error fetching company:', error);
        setError(error.response?.data?.message || 'Failed to load company data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCompanyData();
  }, []);
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Handle nested address fields
    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } 
    // Handle nested branding fields
    else if (name.startsWith('branding.')) {
      const brandingField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        branding: {
          ...prev.branding,
          [brandingField]: value
        }
      }));
    } 
    // Handle regular fields
    else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const formData = {
        name: company.name,
        address: company.address,
        phone: company.phone,
        email: company.email,
        website: company.website,
        licenseNumber: company.licenseNumber,
        insuranceInfo: company.insuranceInfo,
        branding: company.branding
      };

      // Update to new endpoint
      const response = await api.put('/api/company', formData);
      
      setCompany(response.data.data);
      toast.success('Company profile updated successfully');
    } catch (err) {
      console.error('Error updating company profile:', err);
      toast.error(err.response?.data?.message || 'Error updating company profile');
    }
  };
  
  // Handle logo update
  const handleLogoUpdate = (logoUrl) => {
    setCompany(prev => ({
      ...prev,
      logo: logoUrl
    }));
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold mb-6">Company Profile</h1>
      
      {loading ? (
        <div className="bg-card text-card-foreground animate-pulse p-6 rounded-lg mb-8">
          <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border-l-4 border-destructive p-4 mb-8">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-muted-foreground mt-1">Please try again or contact support if the problem persists.</p>
        </div>
      ) : (
        <>
          <div className="bg-card text-card-foreground p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-semibold mb-4">Company Logo</h2>
            <p className="text-muted-foreground mb-4">
              Upload your company logo to display on reports and the dashboard.
            </p>
            
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                {company?.logoUrl ? (
                  <img 
                    src={company.logoUrl} 
                    alt={company.name} 
                    className="w-24 h-24 object-contain border border-muted rounded"
                  />
                ) : (
                  <div className="w-24 h-24 bg-muted flex items-center justify-center rounded">
                    <span className="text-muted-foreground">No logo</span>
                  </div>
                )}
              </div>
              
              <LogoUploader 
                currentLogo={company?.logo} 
                onLogoUpdate={handleLogoUpdate} 
                hidePreview={true} 
              />
            </div>
          </div>
          
          <div className="bg-card text-card-foreground p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Company Information</h2>
            
            <form onSubmit={handleSubmit}>
              {/* Company Name */}
              <div className="mb-4">
                <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="name">
                  Company Name
                </label>
                <input
                  className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                  id="name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              
              {/* Email and Phone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="email">
                    Email
                  </label>
                  <input
                    className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="phone">
                    Phone
                  </label>
                  <input
                    className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                    id="phone"
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>
              
              {/* Website */}
              <div className="mb-4">
                <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="website">
                  Website
                </label>
                <input
                  className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                  id="website"
                  type="text"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                />
              </div>
              
              {/* Address */}
              <div className="mb-4">
                <h3 className="text-lg font-medium mb-2">Address</h3>
                
                <div className="mb-4">
                  <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="street">
                    Street Address
                  </label>
                  <input
                    className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                    id="street"
                    type="text"
                    name="address.street"
                    value={formData.address.street}
                    onChange={handleChange}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="city">
                      City
                    </label>
                    <input
                      className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                      id="city"
                      type="text"
                      name="address.city"
                      value={formData.address.city}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="state">
                      State/Province
                    </label>
                    <input
                      className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                      id="state"
                      type="text"
                      name="address.state"
                      value={formData.address.state}
                      onChange={handleChange}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="zipCode">
                      ZIP/Postal Code
                    </label>
                    <input
                      className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                      id="zipCode"
                      type="text"
                      name="address.zipCode"
                      value={formData.address.zipCode}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="country">
                      Country
                    </label>
                    <input
                      className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                      id="country"
                      type="text"
                      name="address.country"
                      value={formData.address.country}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
              
              {/* Branding */}
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Brand Colors</h3>
                <p className="text-muted-foreground mb-4">
                  These colors will be used in your branded reports and documents.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="primaryColor">
                      Primary Color
                    </label>
                    <div className="flex items-center">
                      <input
                        className="shadow border border-input rounded py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline mr-2"
                        id="primaryColor"
                        type="text"
                        name="branding.primaryColor"
                        value={formData.branding.primaryColor}
                        onChange={handleChange}
                      />
                      <input
                        type="color"
                        value={formData.branding.primaryColor}
                        onChange={(e) => 
                          setFormData({
                            ...formData,
                            branding: {
                              ...formData.branding,
                              primaryColor: e.target.value
                            }
                          })
                        }
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="secondaryColor">
                      Secondary Color
                    </label>
                    <div className="flex items-center">
                      <input
                        className="shadow border border-input rounded py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline mr-2"
                        id="secondaryColor"
                        type="text"
                        name="branding.secondaryColor"
                        value={formData.branding.secondaryColor}
                        onChange={handleChange}
                      />
                      <input
                        type="color"
                        value={formData.branding.secondaryColor}
                        onChange={(e) => 
                          setFormData({
                            ...formData,
                            branding: {
                              ...formData.branding,
                              secondaryColor: e.target.value
                            }
                          })
                        }
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Preview</h4>
                  <div className="flex space-x-2">
                    <div 
                      className="w-12 h-12 rounded" 
                      style={{ backgroundColor: formData.branding.primaryColor }}
                    ></div>
                    <div 
                      className="w-12 h-12 rounded" 
                      style={{ backgroundColor: formData.branding.secondaryColor }}
                    ></div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/80 text-primary-foreground font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default CompanyProfilePage; 