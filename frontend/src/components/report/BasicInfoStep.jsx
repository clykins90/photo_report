import React, { useState, useCallback } from 'react';
import { validateReportForm } from '../../utils/formValidation';
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
    nextStep,
    error: contextError
  } = useReportContext();

  // Handle next button click
  const handleNextClick = useCallback(() => {
    // Validate form before proceeding
    const validation = validateReportForm(report, 1);
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    
    // Clear errors and proceed
    setErrors({});
    nextStep(user);
  }, [report, nextStep, user]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Basic Information</h2>
      
      <div className="grid grid-cols-1 gap-6">
        <div>
          <Label htmlFor="title">
            Report Title <span className="text-red-500">*</span>
          </Label>
          <Input
            id="title"
            type="text"
            name="title"
            value={report.title}
            onChange={handleChange}
            placeholder="e.g., Roof Inspection Report"
            className={errors.title ? 'border-red-500' : ''}
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-500">{errors.title}</p>
          )}
        </div>

        <div>
          <Label htmlFor="clientName">
            Client Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="clientName"
            type="text"
            name="clientName"
            value={report.clientName}
            onChange={handleChange}
            placeholder="e.g., John Smith"
            className={errors.clientName ? 'border-red-500' : ''}
          />
          {errors.clientName && (
            <p className="mt-1 text-sm text-red-500">{errors.clientName}</p>
          )}
        </div>

        {/* Property Address */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">Property Address</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="street">
                Street Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="street"
                type="text"
                name="propertyAddress.street"
                value={report.propertyAddress?.street || ''}
                onChange={handleChange}
                placeholder="e.g., 123 Main St"
                className={errors['propertyAddress.street'] ? 'border-red-500' : ''}
              />
              {errors['propertyAddress.street'] && (
                <p className="mt-1 text-sm text-red-500">{errors['propertyAddress.street']}</p>
              )}
            </div>
            <div>
              <Label htmlFor="city">
                City <span className="text-red-500">*</span>
              </Label>
              <Input
                id="city"
                type="text"
                name="propertyAddress.city"
                value={report.propertyAddress?.city || ''}
                onChange={handleChange}
                placeholder="e.g., San Francisco"
                className={errors['propertyAddress.city'] ? 'border-red-500' : ''}
              />
              {errors['propertyAddress.city'] && (
                <p className="mt-1 text-sm text-red-500">{errors['propertyAddress.city']}</p>
              )}
            </div>
            <div>
              <Label htmlFor="state">
                State <span className="text-red-500">*</span>
              </Label>
              <Input
                id="state"
                type="text"
                name="propertyAddress.state"
                value={report.propertyAddress?.state || ''}
                onChange={handleChange}
                placeholder="e.g., CA"
                className={errors['propertyAddress.state'] ? 'border-red-500' : ''}
              />
              {errors['propertyAddress.state'] && (
                <p className="mt-1 text-sm text-red-500">{errors['propertyAddress.state']}</p>
              )}
            </div>
            <div>
              <Label htmlFor="zipCode">
                ZIP Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="zipCode"
                type="text"
                name="propertyAddress.zipCode"
                value={report.propertyAddress?.zipCode || ''}
                onChange={handleChange}
                placeholder="e.g., 94105"
                className={errors['propertyAddress.zipCode'] ? 'border-red-500' : ''}
              />
              {errors['propertyAddress.zipCode'] && (
                <p className="mt-1 text-sm text-red-500">{errors['propertyAddress.zipCode']}</p>
              )}
            </div>
          </div>
        </div>

        {/* Inspection Date */}
        <div>
          <Label htmlFor="inspectionDate">
            Inspection Date <span className="text-red-500">*</span>
          </Label>
          <Input
            id="inspectionDate"
            type="date"
            name="inspectionDate"
            value={report.inspectionDate || ''}
            onChange={handleChange}
            className={errors.inspectionDate ? 'border-red-500' : ''}
          />
          {errors.inspectionDate && (
            <p className="mt-1 text-sm text-red-500">{errors.inspectionDate}</p>
          )}
        </div>

        {/* Weather Conditions */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">Weather Conditions</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="text"
                name="weather.temperature"
                value={report.weather?.temperature || ''}
                onChange={handleChange}
                placeholder="e.g., 75°F"
              />
            </div>
            <div>
              <Label htmlFor="conditions">Conditions</Label>
              <Input
                id="conditions"
                type="text"
                name="weather.conditions"
                value={report.weather?.conditions || ''}
                onChange={handleChange}
                placeholder="e.g., Partly Cloudy"
              />
            </div>
            <div>
              <Label htmlFor="windSpeed">Wind Speed</Label>
              <Input
                id="windSpeed"
                type="text"
                name="weather.windSpeed"
                value={report.weather?.windSpeed || ''}
                onChange={handleChange}
                placeholder="e.g., 5-10 mph"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-8">
        <Button
          type="button"
          onClick={handleNextClick}
        >
          Next Step
        </Button>
      </div>
    </div>
  );
};

export default BasicInfoStep; 