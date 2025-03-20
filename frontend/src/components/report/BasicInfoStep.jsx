import React, { useState, useCallback } from 'react';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';

// Import UI components
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const BasicInfoStep = () => {
  const [errors, setErrors] = useState({});
  const { user } = useAuth();
  
  // Get report context values
  const {
    report,
    handleChange,
    nextStep
  } = useReportContext();

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Simple validation
    const newErrors = {};
    if (!report.title) newErrors.title = 'Title is required';
    if (!report.clientName) newErrors.clientName = 'Client name is required';
    if (!report.propertyAddress.street) newErrors.street = 'Street address is required';
    if (!report.propertyAddress.city) newErrors.city = 'City is required';
    if (!report.propertyAddress.state) newErrors.state = 'State is required';
    if (!report.propertyAddress.zipCode) newErrors.zipCode = 'Zip code is required';
    
    // If there are errors, show them and stop
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Clear errors and proceed to next step
    setErrors({});
    nextStep();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Basic Information</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <div>
            <Label htmlFor="title">Report Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              name="title"
              value={report.title}
              onChange={handleChange}
              placeholder="Property Inspection Report"
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
          </div>
          
          <div>
            <Label htmlFor="clientName">Client Name <span className="text-red-500">*</span></Label>
            <Input
              id="clientName"
              name="clientName"
              value={report.clientName}
              onChange={handleChange}
              placeholder="John Doe"
              className={errors.clientName ? 'border-red-500' : ''}
            />
            {errors.clientName && <p className="text-red-500 text-sm mt-1">{errors.clientName}</p>}
          </div>
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Property Address</h3>
            
            <div>
              <Label htmlFor="propertyAddress.street">Street Address <span className="text-red-500">*</span></Label>
              <Input
                id="propertyAddress.street"
                name="propertyAddress.street"
                value={report.propertyAddress.street}
                onChange={handleChange}
                placeholder="123 Main St"
                className={errors.street ? 'border-red-500' : ''}
              />
              {errors.street && <p className="text-red-500 text-sm mt-1">{errors.street}</p>}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="propertyAddress.city">City <span className="text-red-500">*</span></Label>
                <Input
                  id="propertyAddress.city"
                  name="propertyAddress.city"
                  value={report.propertyAddress.city}
                  onChange={handleChange}
                  placeholder="Anytown"
                  className={errors.city ? 'border-red-500' : ''}
                />
                {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
              </div>
              
              <div>
                <Label htmlFor="propertyAddress.state">State <span className="text-red-500">*</span></Label>
                <Input
                  id="propertyAddress.state"
                  name="propertyAddress.state"
                  value={report.propertyAddress.state}
                  onChange={handleChange}
                  placeholder="CA"
                  className={errors.state ? 'border-red-500' : ''}
                />
                {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="propertyAddress.zipCode">Zip Code <span className="text-red-500">*</span></Label>
                <Input
                  id="propertyAddress.zipCode"
                  name="propertyAddress.zipCode"
                  value={report.propertyAddress.zipCode}
                  onChange={handleChange}
                  placeholder="12345"
                  className={errors.zipCode ? 'border-red-500' : ''}
                />
                {errors.zipCode && <p className="text-red-500 text-sm mt-1">{errors.zipCode}</p>}
              </div>
              
              <div>
                <Label htmlFor="inspectionDate">Inspection Date</Label>
                <Input
                  id="inspectionDate"
                  name="inspectionDate"
                  type="date"
                  value={report.inspectionDate}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Weather Conditions (Optional)</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="weather.conditions">Conditions</Label>
                <Input
                  id="weather.conditions"
                  name="weather.conditions"
                  value={report.weather.conditions}
                  onChange={handleChange}
                  placeholder="Sunny"
                />
              </div>
              
              <div>
                <Label htmlFor="weather.temperature">Temperature</Label>
                <Input
                  id="weather.temperature"
                  name="weather.temperature"
                  value={report.weather.temperature}
                  onChange={handleChange}
                  placeholder="72°F"
                />
              </div>
              
              <div>
                <Label htmlFor="weather.windSpeed">Wind Speed</Label>
                <Input
                  id="weather.windSpeed"
                  name="weather.windSpeed"
                  value={report.weather.windSpeed}
                  onChange={handleChange}
                  placeholder="5 mph"
                />
              </div>
            </div>
          </div>
          
          <div className="pt-6 flex justify-end">
            <Button type="submit">
              Next: Photos & Analysis
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default BasicInfoStep; 