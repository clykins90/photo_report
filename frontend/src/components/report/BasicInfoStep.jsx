import React, { useState, useCallback, useMemo, useEffect } from 'react';
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

  // Memoize the report values to prevent unnecessary re-renders
  const reportValues = useMemo(() => ({
    title: report.title || '',
    clientName: report.clientName || '',
    propertyAddress: {
      street: report.propertyAddress?.street || '',
      city: report.propertyAddress?.city || '',
      state: report.propertyAddress?.state || '',
      zipCode: report.propertyAddress?.zipCode || '',
    },
    inspectionDate: report.inspectionDate || '',
    weather: {
      temperature: report.weather?.temperature || '',
      conditions: report.weather?.conditions || '',
      windSpeed: report.weather?.windSpeed || '',
    }
  }), [report]);

  // Create a stable onChange handler to avoid recreating it on every render
  const onChange = useCallback((e) => {
    if (handleChange) {
      handleChange(e);
    }
  }, [handleChange]);

  // Track if we've already started the next step process
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Handle next button click
  const handleNextClick = useCallback(async () => {
    // Prevent multiple clicks
    if (isProcessing) return;
    
    // Validate form before proceeding
    const validation = validateReportForm(report, 1);
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    
    // Clear errors and proceed
    setErrors({});
    setIsProcessing(true);
    
    try {
      // Make sure to pass the user object, not call it as a function
      // Use await to handle the promise returned by nextStep
      await nextStep(user);
    } catch (error) {
      console.error('Error proceeding to next step:', error);
    } finally {
      // Reset processing state after nextStep completes (success or failure)
      // This ensures we don't get stuck in processing state
      setTimeout(() => setIsProcessing(false), 500);
    }
  }, [report, nextStep, user, isProcessing]);
  
  // We don't need this useEffect as it's causing an infinite loop
  // The isProcessing state will be reset when the component unmounts naturally
  // or when the user successfully proceeds to the next step

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
            value={reportValues.title}
            onChange={onChange}
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
            value={reportValues.clientName}
            onChange={onChange}
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
                value={reportValues.propertyAddress.street}
                onChange={onChange}
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
                value={reportValues.propertyAddress.city}
                onChange={onChange}
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
                value={reportValues.propertyAddress.state}
                onChange={onChange}
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
                value={reportValues.propertyAddress.zipCode}
                onChange={onChange}
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
            value={reportValues.inspectionDate}
            onChange={onChange}
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
                value={reportValues.weather.temperature}
                onChange={onChange}
                placeholder="e.g., 75°F"
              />
            </div>
            <div>
              <Label htmlFor="conditions">Conditions</Label>
              <Input
                id="conditions"
                type="text"
                name="weather.conditions"
                value={reportValues.weather.conditions}
                onChange={onChange}
                placeholder="e.g., Partly Cloudy"
              />
            </div>
            <div>
              <Label htmlFor="windSpeed">Wind Speed</Label>
              <Input
                id="windSpeed"
                type="text"
                name="weather.windSpeed"
                value={reportValues.weather.windSpeed}
                onChange={onChange}
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