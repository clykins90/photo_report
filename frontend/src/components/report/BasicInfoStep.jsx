import React, { useState, useCallback } from 'react';
import { validateReportForm } from '../../utils/formValidation';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';

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
      <h2 className="text-2xl font-bold text-gray-800">Basic Information</h2>
      
      <div className="grid grid-cols-1 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="title">
            Report Title <span className="text-red-500">*</span>
          </label>
          <input
            className={`block w-full rounded-md shadow-sm py-2 px-3 bg-white border ${errors.title ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
            id="title"
            type="text"
            name="title"
            value={report.title}
            onChange={handleChange}
            placeholder="e.g., Roof Inspection Report"
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="clientName">
            Client Name <span className="text-red-500">*</span>
          </label>
          <input
            className={`block w-full rounded-md shadow-sm py-2 px-3 bg-white border ${errors.clientName ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
            id="clientName"
            type="text"
            name="clientName"
            value={report.clientName}
            onChange={handleChange}
            placeholder="e.g., John Doe"
          />
          {errors.clientName && (
            <p className="mt-1 text-sm text-red-600">{errors.clientName}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="inspectionDate">
            Inspection Date <span className="text-red-500">*</span>
          </label>
          <input
            className={`block w-full rounded-md shadow-sm py-2 px-3 bg-white border ${errors.inspectionDate ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
            id="inspectionDate"
            type="date"
            name="inspectionDate"
            value={report.inspectionDate}
            onChange={handleChange}
          />
          {errors.inspectionDate && (
            <p className="mt-1 text-sm text-red-600">{errors.inspectionDate}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Property Address <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <input
                className={`block w-full rounded-md shadow-sm py-2 px-3 bg-white border ${errors['propertyAddress.street'] ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                type="text"
                name="propertyAddress.street"
                value={report.propertyAddress?.street || ''}
                onChange={handleChange}
                placeholder="Street Address"
              />
              {errors['propertyAddress.street'] && (
                <p className="mt-1 text-sm text-red-600">{errors['propertyAddress.street']}</p>
              )}
            </div>
            <div>
              <input
                className={`block w-full rounded-md shadow-sm py-2 px-3 bg-white border ${errors['propertyAddress.city'] ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                type="text"
                name="propertyAddress.city"
                value={report.propertyAddress?.city || ''}
                onChange={handleChange}
                placeholder="City"
              />
              {errors['propertyAddress.city'] && (
                <p className="mt-1 text-sm text-red-600">{errors['propertyAddress.city']}</p>
              )}
            </div>
            <div>
              <input
                className={`block w-full rounded-md shadow-sm py-2 px-3 bg-white border ${errors['propertyAddress.state'] ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                type="text"
                name="propertyAddress.state"
                value={report.propertyAddress?.state || ''}
                onChange={handleChange}
                placeholder="State"
              />
              {errors['propertyAddress.state'] && (
                <p className="mt-1 text-sm text-red-600">{errors['propertyAddress.state']}</p>
              )}
            </div>
            <div>
              <input
                className={`block w-full rounded-md shadow-sm py-2 px-3 bg-white border ${errors['propertyAddress.zipCode'] ? 'border-red-500' : 'border-gray-300'} focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                type="text"
                name="propertyAddress.zipCode"
                value={report.propertyAddress?.zipCode || ''}
                onChange={handleChange}
                placeholder="ZIP Code"
              />
              {errors['propertyAddress.zipCode'] && (
                <p className="mt-1 text-sm text-red-600">{errors['propertyAddress.zipCode']}</p>
              )}
            </div>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Weather Conditions (Optional)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <input
                className="block w-full rounded-md shadow-sm py-2 px-3 bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                type="text"
                name="weather.temperature"
                value={report.weather?.temperature || ''}
                onChange={handleChange}
                placeholder="Temperature (e.g., 75°F)"
              />
            </div>
            <div>
              <input
                className="block w-full rounded-md shadow-sm py-2 px-3 bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                type="text"
                name="weather.conditions"
                value={report.weather?.conditions || ''}
                onChange={handleChange}
                placeholder="Conditions (e.g., Sunny)"
              />
            </div>
            <div>
              <input
                className="block w-full rounded-md shadow-sm py-2 px-3 bg-white border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                type="text"
                name="weather.windSpeed"
                value={report.weather?.windSpeed || ''}
                onChange={handleChange}
                placeholder="Wind Speed (e.g., 5 mph)"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="pt-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleNextClick}
            className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Next: Photos & Analysis
          </button>
        </div>
      </div>
    </div>
  );
};

export default BasicInfoStep; 