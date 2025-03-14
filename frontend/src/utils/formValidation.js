/**
 * Validate report form data
 * @param {Object} formData - The report form data
 * @param {number} step - The current step (1-4)
 * @returns {Object} - { isValid: boolean, errors: Object }
 */
export const validateReportForm = (formData, step) => {
  const errors = {};

  // Step 1: Basic information
  if (step === 1) {
    if (!formData.title?.trim()) {
      errors.title = 'Report title is required';
    } else if (formData.title.trim().length < 3) {
      errors.title = 'Report title must be at least 3 characters';
    }
    
    if (!formData.clientName?.trim()) {
      errors.clientName = 'Client name is required';
    } else if (formData.clientName.trim().length < 2) {
      errors.clientName = 'Client name must be at least 2 characters';
    }
    
    // Validate property address fields - all fields are now required
    const addressFields = {
      street: formData.propertyAddress?.street?.trim(),
      city: formData.propertyAddress?.city?.trim(),
      state: formData.propertyAddress?.state?.trim(),
      zipCode: formData.propertyAddress?.zipCode?.trim()
    };
    
    // Check each address field individually
    if (!addressFields.street) {
      errors.propertyAddress = errors.propertyAddress || {};
      errors.propertyAddress.street = 'Street address is required';
    }
    
    if (!addressFields.city) {
      errors.propertyAddress = errors.propertyAddress || {};
      errors.propertyAddress.city = 'City is required';
    }
    
    if (!addressFields.state) {
      errors.propertyAddress = errors.propertyAddress || {};
      errors.propertyAddress.state = 'State is required';
    }
    
    if (!addressFields.zipCode) {
      errors.propertyAddress = errors.propertyAddress || {};
      errors.propertyAddress.zipCode = 'Zip code is required';
    } else if (!/^\d{5}(-\d{4})?$/.test(addressFields.zipCode)) {
      errors.propertyAddress = errors.propertyAddress || {};
      errors.propertyAddress.zipCode = 'Please enter a valid zip code (e.g., 12345 or 12345-6789)';
    }
    
    // If any property address errors exist, add a general error message
    if (errors.propertyAddress) {
      errors.propertyAddress.general = 'Please complete all address fields correctly';
    }
    
    // Validate inspection date
    if (!formData.inspectionDate) {
      errors.inspectionDate = 'Inspection date is required';
    } else {
      const selectedDate = new Date(formData.inspectionDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      oneYearAgo.setHours(0, 0, 0, 0);
      
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      oneYearFromNow.setHours(0, 0, 0, 0);
      
      if (selectedDate < oneYearAgo) {
        errors.inspectionDate = 'Inspection date cannot be more than 1 year in the past';
      } else if (selectedDate > oneYearFromNow) {
        errors.inspectionDate = 'Inspection date cannot be more than 1 year in the future';
      }
    }
  }
  
  // Step 2: Photos
  // Photo validation would typically happen in the PhotoUploadStep component
  
  // Step 3: AI Analysis
  if (step === 3) {
    // No strict validation requirements for summary or damages
    // These are typically generated by AI
  }
  
  // Step 4: Review
  if (step === 4) {
    // Final validation before submission
    if (!formData.title?.trim()) {
      errors.title = 'Report title is required';
    }
    
    if (!formData.clientName?.trim()) {
      errors.clientName = 'Client name is required';
    }
    
    if (!formData.inspectionDate) {
      errors.inspectionDate = 'Inspection date is required';
    }
    
    // Validate required property address fields for final submission
    if (!formData.propertyAddress?.street?.trim()) {
      errors.propertyAddressStreet = 'Street address is required';
    }
    
    if (!formData.propertyAddress?.city?.trim()) {
      errors.propertyAddressCity = 'City is required';
    }
    
    if (!formData.propertyAddress?.state?.trim()) {
      errors.propertyAddressState = 'State is required';
    }
    
    if (!formData.propertyAddress?.zipCode?.trim()) {
      errors.propertyAddressZip = 'Zip code is required';
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Get form error message for display
 * @param {Object} errors - Error object from validateReportForm
 * @returns {string} - Formatted error message
 */
export const getFormErrorMessage = (errors) => {
  if (!errors || Object.keys(errors).length === 0) {
    return '';
  }
  
  // Check for property address errors
  if (errors.propertyAddress) {
    if (errors.propertyAddress.general) {
      return errors.propertyAddress.general;
    }
    
    // Return the first specific address error
    const addressErrorKeys = ['street', 'city', 'state', 'zipCode'];
    for (const key of addressErrorKeys) {
      if (errors.propertyAddress[key]) {
        return `Property Address: ${errors.propertyAddress[key]}`;
      }
    }
  }
  
  // Check for other address-related errors (for backward compatibility)
  const addressErrors = [
    'propertyAddressStreet', 
    'propertyAddressCity', 
    'propertyAddressState', 
    'propertyAddressZip'
  ].filter(key => errors[key]);
  
  if (addressErrors.length > 0) {
    return 'Please complete all property address fields before submitting (street, city, state, and zip code).';
  }
  
  // Return the first error message for other error types
  const firstError = Object.values(errors)[0];
  return firstError;
}; 