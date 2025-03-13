import React, { useState } from 'react';
import { validateReportForm } from '../../utils/formValidation';

const BasicInfoStep = ({ formData, handleChange, nextStep }) => {
  const [errors, setErrors] = useState({});

  const handleNextClick = () => {
    // Validate form before proceeding
    const validation = validateReportForm(formData, 1);
    
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    
    // Clear errors and proceed
    setErrors({});
    nextStep();
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Basic Information</h3>
      
      <div className="mb-4">
        <label className="block text-foreground text-sm font-bold mb-2" htmlFor="title">
          Report Title
        </label>
        <input
          className={`shadow appearance-none border ${errors.title ? 'border-red-500' : 'border-input'} rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline`}
          id="title"
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          placeholder="e.g., Roof Damage Inspection"
          required
        />
        {errors.title && (
          <p className="text-red-500 text-xs italic mt-1">{errors.title}</p>
        )}
      </div>
      
      <div className="mb-4">
        <label className="block text-foreground text-sm font-bold mb-2" htmlFor="clientName">
          Client Name
        </label>
        <input
          className={`shadow appearance-none border ${errors.clientName ? 'border-red-500' : 'border-input'} rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline`}
          id="clientName"
          type="text"
          name="clientName"
          value={formData.clientName}
          onChange={handleChange}
          placeholder="Client Name"
          required
        />
        {errors.clientName && (
          <p className="text-red-500 text-xs italic mt-1">{errors.clientName}</p>
        )}
      </div>
      
      <div className="mb-4">
        <label className="block text-foreground text-sm font-bold mb-2">
          Property Address
        </label>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <input
              className={`shadow appearance-none border ${errors.propertyAddress ? 'border-red-500' : 'border-input'} rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline`}
              type="text"
              name="propertyAddress.street"
              value={formData.propertyAddress.street}
              onChange={handleChange}
              placeholder="Street Address"
            />
          </div>
          
          <div>
            <input
              className={`shadow appearance-none border ${errors.propertyAddress ? 'border-red-500' : 'border-input'} rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline`}
              type="text"
              name="propertyAddress.city"
              value={formData.propertyAddress.city}
              onChange={handleChange}
              placeholder="City"
            />
          </div>
          
          <div>
            <input
              className={`shadow appearance-none border ${errors.propertyAddress ? 'border-red-500' : 'border-input'} rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline`}
              type="text"
              name="propertyAddress.state"
              value={formData.propertyAddress.state}
              onChange={handleChange}
              placeholder="State"
            />
          </div>
          
          <div>
            <input
              className={`shadow appearance-none border ${errors.propertyAddress ? 'border-red-500' : 'border-input'} rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline`}
              type="text"
              name="propertyAddress.zipCode"
              value={formData.propertyAddress.zipCode}
              onChange={handleChange}
              placeholder="Zip Code"
            />
          </div>
        </div>
        {errors.propertyAddress && (
          <p className="text-red-500 text-xs italic mt-1">{errors.propertyAddress}</p>
        )}
      </div>
      
      <div className="mb-4">
        <label className="block text-foreground text-sm font-bold mb-2" htmlFor="inspectionDate">
          Inspection Date
        </label>
        <input
          className={`shadow appearance-none border ${errors.inspectionDate ? 'border-red-500' : 'border-input'} rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline`}
          id="inspectionDate"
          type="date"
          name="inspectionDate"
          value={formData.inspectionDate}
          onChange={handleChange}
          required
        />
        {errors.inspectionDate && (
          <p className="text-red-500 text-xs italic mt-1">{errors.inspectionDate}</p>
        )}
      </div>
      
      <div className="mb-4">
        <label className="block text-foreground text-sm font-bold mb-2">
          Weather Conditions
        </label>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
              type="number"
              name="weather.temperature"
              value={formData.weather.temperature}
              onChange={handleChange}
              placeholder="Temperature (°F)"
            />
          </div>
          
          <div>
            <select
              className="shadow appearance-none border rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
              name="weather.conditions"
              value={formData.weather.conditions}
              onChange={handleChange}
            >
              <option value="">Select Conditions</option>
              <option value="Sunny">Sunny</option>
              <option value="Partly Cloudy">Partly Cloudy</option>
              <option value="Cloudy">Cloudy</option>
              <option value="Rainy">Rainy</option>
              <option value="Snowy">Snowy</option>
              <option value="Stormy">Stormy</option>
            </select>
          </div>
          
          <div>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 bg-background text-foreground leading-tight focus:outline-none focus:shadow-outline"
              type="number"
              name="weather.windSpeed"
              value={formData.weather.windSpeed}
              onChange={handleChange}
              placeholder="Wind Speed (mph)"
            />
          </div>
        </div>
      </div>
      
      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={handleNextClick}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Next: Upload Photos
        </button>
      </div>
    </div>
  );
};

export default BasicInfoStep; 