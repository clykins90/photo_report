import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import LogoUploader from '../components/company/LogoUploader';
import api from '../services/api';

// Color utility functions
const hexToRgb = (hex) => {
  // Remove the # if present
  hex = hex.replace('#', '');
  
  // Parse hex values to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return { r, g, b };
};

const rgbToHex = (r, g, b) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

// Function to darken a color until it meets accessibility standards with white text
const darkenForAccessibility = (colorHex, textColor = '#FFFFFF', targetRatio = 4.5) => {
  try {
    let rgb = hexToRgb(colorHex);
    let currentRatio = getContrastRatio(colorHex, textColor);
    
    // If the color already meets standards, return it unchanged
    if (currentRatio >= targetRatio) {
      return colorHex;
    }
    
    // Try up to 10 iterations to find a suitable contrast
    let attempts = 0;
    let newColor = colorHex;
    
    while (currentRatio < targetRatio && attempts < 10) {
      // Darken by reducing each RGB component by 10%
      rgb.r = Math.max(0, Math.floor(rgb.r * 0.9));
      rgb.g = Math.max(0, Math.floor(rgb.g * 0.9));
      rgb.b = Math.max(0, Math.floor(rgb.b * 0.9));
      
      newColor = rgbToHex(rgb.r, rgb.g, rgb.b);
      currentRatio = getContrastRatio(newColor, textColor);
      
      attempts++;
    }
    
    return newColor;
  } catch (error) {
    console.error("Error adjusting color for accessibility:", error);
    return colorHex; // Return original color if there's an error
  }
};

const adjustHue = (colorHex, degrees) => {
  try {
    // Convert hex to RGB
    const rgb = hexToRgb(colorHex);
    
    // Convert RGB to HSL
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        default: h = 0;
      }
      
      h /= 6;
    }
    
    // Adjust hue
    h = (h * 360 + degrees) % 360;
    if (h < 0) h += 360;
    h /= 360;
    
    // Convert back to RGB
    let r1, g1, b1;
    
    if (s === 0) {
      r1 = g1 = b1 = l; // achromatic
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      r1 = hue2rgb(p, q, h + 1/3);
      g1 = hue2rgb(p, q, h);
      b1 = hue2rgb(p, q, h - 1/3);
    }
    
    // Convert back to hex
    return rgbToHex(
      Math.round(r1 * 255), 
      Math.round(g1 * 255), 
      Math.round(b1 * 255)
    );
  } catch (error) {
    console.error("Error adjusting hue:", error);
    return colorHex; // Return original color if there's an error
  }
};

const getLuminance = (hex) => {
  const rgb = hexToRgb(hex);
  
  // Convert RGB to relative luminance
  const rSRGB = rgb.r / 255;
  const gSRGB = rgb.g / 255;
  const bSRGB = rgb.b / 255;
  
  const r = rSRGB <= 0.03928 ? rSRGB / 12.92 : Math.pow((rSRGB + 0.055) / 1.055, 2.4);
  const g = gSRGB <= 0.03928 ? gSRGB / 12.92 : Math.pow((gSRGB + 0.055) / 1.055, 2.4);
  const b = bSRGB <= 0.03928 ? bSRGB / 12.92 : Math.pow((bSRGB + 0.055) / 1.055, 2.4);
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const getContrastRatio = (color1, color2) => {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  
  return (brightest + 0.05) / (darkest + 0.05);
};

const ProfilePage = () => {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [previewAccessibleColor, setPreviewAccessibleColor] = useState(null);
  const [previewAccessibleSecondary, setPreviewAccessibleSecondary] = useState(null);
  const [paletteSelected, setPaletteSelected] = useState(false);
  
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
        // Fetch company data
        const companyRes = await api.get('/company');
        if (companyRes.data && companyRes.data.data) {
          setCompany(companyRes.data.data);
          
          // Initialize form with company data
          setFormData({
            name: companyRes.data.data.name || '',
            email: companyRes.data.data.email || '',
            phone: companyRes.data.data.phone || '',
            website: companyRes.data.data.website || '',
            address: {
              street: companyRes.data.data.address?.street || '',
              city: companyRes.data.data.address?.city || '',
              state: companyRes.data.data.address?.state || '',
              zipCode: companyRes.data.data.address?.zipCode || '',
              country: companyRes.data.data.address?.country || ''
            },
            branding: {
              primaryColor: companyRes.data.data.branding?.primaryColor || '#2563EB',
              secondaryColor: companyRes.data.data.branding?.secondaryColor || '#475569'
            }
          });
        }
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

  // Handle password form input changes  
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setPasswordError('');
  };
  
  // Handle company form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const formDataToSubmit = {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        website: formData.website,
        branding: formData.branding
      };

      // Update to new endpoint
      const response = await api.put('/company', formDataToSubmit);
      
      if (response.data && response.data.success) {
        setCompany(response.data.data);
        toast.success('Profile updated successfully');
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      toast.error(err.response?.data?.message || 'Error updating profile');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle password change submission
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    
    const { currentPassword, newPassword, confirmPassword } = passwordFormData;
    
    // Validate password
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    
    setSubmitting(true);
    setPasswordError('');
    
    try {
      await api.put('/auth/password', {
        currentPassword,
        newPassword
      });
      
      // Clear form
      setPasswordFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      toast.success('Password updated successfully');
    } catch (err) {
      console.error('Error updating password:', err);
      setPasswordError(err.response?.data?.message || 'Error updating password');
    } finally {
      setSubmitting(false);
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
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      
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
          
          <div className="bg-card text-card-foreground p-6 rounded-lg shadow mb-8">
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
                
                {/* Color Palette Suggestions */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2">Suggested Color Palettes</h4>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: "Professional Blue", primary: "#1E40AF", secondary: "#1D4ED8" },
                      { name: "Modern Green", primary: "#065F46", secondary: "#047857" },
                      { name: "Classic Gray", primary: "#1F2937", secondary: "#374151" },
                      { name: "Vibrant Red", primary: "#991B1B", secondary: "#B91C1C" },
                      { name: "Elegant Purple", primary: "#5B21B6", secondary: "#6D28D9" }
                    ].map((palette, index) => (
                      <button
                        key={index}
                        className="p-1 border rounded flex items-center hover:bg-muted"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            branding: {
                              ...formData.branding,
                              primaryColor: palette.primary,
                              secondaryColor: palette.secondary
                            }
                          });
                          setPaletteSelected(true);
                          setTimeout(() => setPaletteSelected(false), 3000); // Hide message after 3 seconds
                        }}
                        title={palette.name}
                      >
                        <div 
                          className="w-6 h-6 rounded-sm mr-1" 
                          style={{ backgroundColor: palette.primary }}
                        ></div>
                        <div 
                          className="w-6 h-6 rounded-sm" 
                          style={{ backgroundColor: palette.secondary }}
                        ></div>
                      </button>
                    ))}
                  </div>
                  {paletteSelected && (
                    <div className="mt-2 text-xs text-green-600 bg-green-50 p-2 rounded animate-pulse">
                      ✓ Selected palette colors are accessibility-compliant with white text (WCAG 2.1 AA)
                    </div>
                  )}
                </div>
                
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
                
                {/* Harmony Suggestions */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Color Harmony Suggestions</h4>
                  <div className="text-xs text-muted-foreground mb-2">
                    Based on your primary color, here are some harmonious options for your secondary color:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { type: "Complementary", color: adjustHue(formData.branding.primaryColor, 180) },
                      { type: "Analogous 1", color: adjustHue(formData.branding.primaryColor, 30) },
                      { type: "Analogous 2", color: adjustHue(formData.branding.primaryColor, -30) },
                      { type: "Triadic 1", color: adjustHue(formData.branding.primaryColor, 120) },
                      { type: "Triadic 2", color: adjustHue(formData.branding.primaryColor, -120) },
                    ].map((suggestion, index) => (
                      <button
                        key={index}
                        className="p-1 border rounded flex items-center hover:bg-muted"
                        onClick={() => setFormData({
                          ...formData,
                          branding: {
                            ...formData.branding,
                            secondaryColor: suggestion.color
                          }
                        })}
                        title={suggestion.type}
                      >
                        <div className="flex flex-col items-center">
                          <div 
                            className="w-6 h-6 rounded-sm" 
                            style={{ backgroundColor: suggestion.color }}
                          ></div>
                          <span className="text-xs">{suggestion.type}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-2">Enhanced Preview</h4>
                  <div className="border rounded-md p-4 max-w-md">
                    {(previewAccessibleColor || previewAccessibleSecondary) && (
                      <div className="bg-blue-50 text-blue-700 text-xs p-1 mb-2 rounded">
                        Preview: Showing accessibility-adjusted color
                      </div>
                    )}
                    {/* Header preview */}
                    <div 
                      className="h-12 rounded-t-md flex items-center px-4 mb-4" 
                      style={{ backgroundColor: previewAccessibleColor || formData.branding.primaryColor }}
                    >
                      <div className="text-white font-bold">Report Header</div>
                    </div>
                    
                    {/* Content preview */}
                    <div className="mb-4">
                      <div className="text-sm font-bold mb-1" style={{ color: previewAccessibleColor || formData.branding.primaryColor }}>
                        Section Heading
                      </div>
                      <div className="bg-gray-100 h-2 w-full rounded mb-2"></div>
                      <div className="bg-gray-100 h-2 w-5/6 rounded mb-2"></div>
                      <div className="bg-gray-100 h-2 w-4/6 rounded"></div>
                    </div>
                    
                    {/* Button/highlight preview */}
                    <div className="flex space-x-4">
                      <div 
                        className="py-1 px-3 rounded text-xs text-white" 
                        style={{ backgroundColor: previewAccessibleColor || formData.branding.primaryColor }}
                      >
                        Primary Button
                      </div>
                      <div 
                        className="py-1 px-3 rounded text-xs text-white" 
                        style={{ backgroundColor: previewAccessibleSecondary || formData.branding.secondaryColor }}
                      >
                        Secondary Button
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Accessibility check */}
                <div className="mt-4 text-xs">
                  <div className="mb-1 font-medium">Accessibility Check:</div>
                  {getContrastRatio(formData.branding.primaryColor, '#FFFFFF') < 4.5 ? (
                    <div className="text-red-500 flex items-center mb-2">
                      <span className="mr-2">⚠️ Your primary color might not provide enough contrast with white text.</span>
                      <button
                        type="button"
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs py-1 px-2 rounded"
                        onMouseEnter={() => {
                          const accessibleColor = darkenForAccessibility(formData.branding.primaryColor);
                          setPreviewAccessibleColor(accessibleColor);
                        }}
                        onMouseLeave={() => {
                          setPreviewAccessibleColor(null);
                        }}
                        onClick={() => {
                          const accessibleColor = darkenForAccessibility(formData.branding.primaryColor);
                          setFormData({
                            ...formData,
                            branding: {
                              ...formData.branding,
                              primaryColor: accessibleColor
                            }
                          });
                          setPreviewAccessibleColor(null);
                        }}
                      >
                        Fix Contrast
                      </button>
                    </div>
                  ) : (
                    <div className="text-green-500 mb-2">
                      ✓ Your primary color provides good contrast for readability.
                    </div>
                  )}
                  
                  {getContrastRatio(formData.branding.secondaryColor, '#FFFFFF') < 4.5 ? (
                    <div className="text-red-500 flex items-center">
                      <span className="mr-2">⚠️ Your secondary color might not provide enough contrast with white text.</span>
                      <button
                        type="button"
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs py-1 px-2 rounded"
                        onMouseEnter={() => {
                          const accessibleColor = darkenForAccessibility(formData.branding.secondaryColor);
                          setPreviewAccessibleSecondary(accessibleColor);
                        }}
                        onMouseLeave={() => {
                          setPreviewAccessibleSecondary(null);
                        }}
                        onClick={() => {
                          const accessibleColor = darkenForAccessibility(formData.branding.secondaryColor);
                          setFormData({
                            ...formData,
                            branding: {
                              ...formData.branding,
                              secondaryColor: accessibleColor
                            }
                          });
                          setPreviewAccessibleSecondary(null);
                        }}
                      >
                        Fix Contrast
                      </button>
                    </div>
                  ) : (
                    <div className="text-green-500">
                      ✓ Your secondary color provides good contrast for readability.
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-primary/90 hover:bg-primary/80 text-primary-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline border border-primary/20"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
          
          {/* Password Change Section */}
          <div className="bg-card text-card-foreground p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Change Password</h2>
            
            <form onSubmit={handlePasswordSubmit}>
              {passwordError && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {passwordError}
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="currentPassword">
                  Current Password
                </label>
                <input
                  className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                  id="currentPassword"
                  type="password"
                  name="currentPassword"
                  value={passwordFormData.currentPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="newPassword">
                  New Password
                </label>
                <input
                  className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                  id="newPassword"
                  type="password"
                  name="newPassword"
                  value={passwordFormData.newPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-card-foreground text-sm font-bold mb-2" htmlFor="confirmPassword">
                  Confirm New Password
                </label>
                <input
                  className="shadow appearance-none border border-input rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  value={passwordFormData.confirmPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-primary/90 hover:bg-primary/80 text-primary-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline border border-primary/20"
                  disabled={submitting}
                >
                  {submitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default ProfilePage; 