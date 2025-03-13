import React, { useContext } from 'react';
import DamageForm from './DamageForm';
import AuthContext from '../../context/AuthContext';

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
  
  // Debug function to show user and company info
  const showDebugInfo = () => {
    console.log("Current User:", user);
    console.log("User ID:", user?._id);
    console.log("Company ID:", user?.company);
    
    alert(`User ID: ${user?._id || 'Not found'}\nCompany ID: ${user?.company || 'Not found'}`);
  };
  
  // Check if we're in development mode
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
  
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Review & Submit Report</h3>
      
      {isDevelopment && (
        <div className="mb-4 p-2 bg-secondary/20 rounded">
          <button 
            type="button"
            onClick={showDebugInfo}
            className="text-xs bg-purple-500 hover:bg-purple-700 text-white py-1 px-2 rounded"
          >
            Debug: Check User/Company IDs
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            Developer mode: Click to check user and company IDs in console
          </p>
        </div>
      )}
      
      <div className="space-y-6">
        {/* Basic Information */}
        <section className="bg-card text-card-foreground p-4 rounded-lg shadow">
          <h4 className="text-lg font-medium mb-2">Basic Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Report Title</p>
              <p className="font-medium">{formData.title || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Client Name</p>
              <p className="font-medium">{formData.clientName || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Property Address</p>
              <p className="font-medium">
                {formData.propertyAddress.street}<br />
                {formData.propertyAddress.city}, {formData.propertyAddress.state} {formData.propertyAddress.zipCode}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Inspection Date</p>
              <p className="font-medium">{formData.inspectionDate}</p>
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
                  src={photo.preview} 
                  alt={`Photo ${index + 1}`}
                  className="w-full h-24 object-cover rounded-md"
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