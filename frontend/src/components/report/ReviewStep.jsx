import React, { useContext, useState, useEffect } from 'react';
import DamageForm from './DamageForm';
import AuthContext from '../../context/AuthContext';
import { validateReportForm } from '../../utils/formValidation';
import { getPhotoUrl } from '../../services/photoService';

const ReviewStep = ({ 
  formData, 
  uploadedPhotos,
  addDamage,
  updateDamage,
  removeDamage,
  handleChange,
  prevStep, 
  handleSubmit,
  isSubmitting,
  pdfUrl,
  error
}) => {
  const { user } = useContext(AuthContext);
  const [validationErrors, setValidationErrors] = useState({});
  
  // Validate the form fields on initial render and when formData changes
  useEffect(() => {
    const { errors } = validateReportForm(formData, 4);
    setValidationErrors(errors);
  }, [formData]);
  
  // Get the best available image URL for a photo (same function as in AIAnalysisStep)
  const getBestImageUrl = (photo) => {
    // Use the centralized photo URL handler from photoService
    // which properly handles path prefixes to avoid duplicates
    return getPhotoUrl(photo);
  };
  
  // Function to check if property address is complete
  const isAddressComplete = () => {
    return formData.propertyAddress?.street?.trim() && 
           formData.propertyAddress?.city?.trim() && 
           formData.propertyAddress?.state?.trim() && 
           formData.propertyAddress?.zipCode?.trim();
  };

  // Function to handle Edit Basic Info button click
  const handleEditBasicInfo = () => {
    prevStep();
    prevStep();
    prevStep();
  };
  
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Review & Submit Report</h3>
      
      {/* Show validation errors at the top */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-700 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">Please fix the following issues before submitting:</p>
              <ul className="mt-1 text-sm text-red-700 dark:text-red-300 list-disc list-inside">
                {Object.values(validationErrors).map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
              <div className="mt-3">
                <button
                  onClick={handleEditBasicInfo}
                  className="bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 text-red-800 dark:text-red-300 py-1 px-3 rounded text-sm font-medium"
                >
                  Go to Basic Info Step
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="space-y-6">
        {/* Basic Information */}
        <section className="bg-card text-card-foreground p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-lg font-medium">Basic Information</h4>
            <button 
              onClick={handleEditBasicInfo}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              Edit Basic Info
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Report Title</p>
              <p className={`font-medium ${validationErrors.title ? 'text-red-500' : ''}`}>
                {formData.title || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Client Name</p>
              <p className={`font-medium ${validationErrors.clientName ? 'text-red-500' : ''}`}>
                {formData.clientName || 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Property Address</p>
              <p className={`font-medium ${!isAddressComplete() ? 'text-red-500' : ''}`}>
                {formData.propertyAddress.street || '[Street Address Required]'}<br />
                {formData.propertyAddress.city || '[City Required]'}, {formData.propertyAddress.state || '[State Required]'} {formData.propertyAddress.zipCode || '[Zip Required]'}
              </p>
              {!isAddressComplete() && (
                <p className="text-red-500 text-xs mt-1">All address fields are required</p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Inspection Date</p>
              <p className={`font-medium ${validationErrors.inspectionDate ? 'text-red-500' : ''}`}>
                {formData.inspectionDate}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Weather Conditions</p>
              <p className="font-medium">
                {formData.weather.conditions}, {formData.weather.temperature}°, 
                Wind: {formData.weather.windSpeed} mph
              </p>
            </div>
          </div>
        </section>
        
        {/* AI Generated Summary */}
        <section className="bg-card text-card-foreground p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-lg font-medium">AI-Generated Summary</h4>
            <button 
              onClick={() => document.getElementById('summary-edit').focus()}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              Edit
            </button>
          </div>
          <div className="mb-4">
            <textarea
              id="summary-edit"
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              className="w-full p-2 border border-input bg-background text-foreground rounded-md min-h-[100px]"
              placeholder="No summary generated. Go back to the AI Analysis step to generate one."
            ></textarea>
          </div>
          
          {/* Materials section */}
          {formData.materials && (
            <div className="mb-4">
              <h5 className="text-md font-medium mb-1">Materials Observed</h5>
              <div className="bg-muted/40 p-3 rounded">
                <p className="text-card-foreground">{formData.materials}</p>
              </div>
            </div>
          )}
          
          {/* Tags section */}
          {formData.tags && formData.tags.length > 0 && (
            <div className="mb-4">
              <h5 className="text-md font-medium mb-1">Report Tags</h5>
              <div className="flex flex-wrap gap-1">
                {formData.tags.map((tag, index) => (
                  <span 
                    key={index} 
                    className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 text-xs px-2 py-1 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
        
        {/* Damages & Recommendations */}
        <section className="bg-card text-card-foreground p-4 rounded-lg shadow">
          <h4 className="text-lg font-medium mb-2">Damages Identified</h4>
          <DamageForm
            damages={formData.damages}
            addDamage={addDamage}
            updateDamage={updateDamage}
            removeDamage={removeDamage}
          />
        </section>
        
        <section className="bg-card text-card-foreground p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-lg font-medium">Recommendations</h4>
            <button 
              onClick={() => document.getElementById('recommendations-edit').focus()}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              Edit
            </button>
          </div>
          <textarea
            id="recommendations-edit"
            name="recommendations"
            value={formData.recommendations}
            onChange={handleChange}
            className="w-full p-2 border border-input bg-background text-foreground rounded-md min-h-[100px]"
            placeholder="No recommendations provided."
          ></textarea>
        </section>
        
        {/* Photo Preview */}
        <section className="bg-card text-card-foreground p-4 rounded-lg shadow">
          <h4 className="text-lg font-medium mb-2">Photos ({uploadedPhotos.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {uploadedPhotos.map((photo, index) => (
              <div key={index} className="relative">
                <img 
                  src={getBestImageUrl(photo)} 
                  alt={`Photo ${index + 1}`}
                  className="w-full h-24 object-cover rounded-md"
                  onError={(e) => e.target.src = '/placeholder-image.png'}
                />
                {photo.analysis && (
                  <div className="absolute bottom-0 right-0 bg-green-500 text-white text-xs px-1 rounded-tl-md">
                    AI Analyzed
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        
        {error && (
          <div className="bg-destructive/10 border-l-4 border-destructive p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-destructive" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-destructive">
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {pdfUrl && (
          <div className="bg-green-600/10 border-l-4 border-green-600 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700 dark:text-green-400">
                  PDF generated successfully!
                </p>
                <div className="mt-2">
                  <a 
                    href={pdfUrl} 
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download PDF
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={prevStep}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Back: AI Analysis
        </button>
        
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            console.log("Submit button clicked");
            console.log("Form data being submitted:", formData);
            handleSubmit(e);
          }}
          disabled={isSubmitting}
          className={`bg-primary hover:bg-primary/80 text-primary-foreground font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${
            isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </div>
    </div>
  );
};

export default ReviewStep; 