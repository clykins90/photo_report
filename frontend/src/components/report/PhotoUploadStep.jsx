import React, { useEffect } from 'react';
import PhotoUploader from '../photo/PhotoUploader';
import { filterPhotosWithValidIds } from '../../utils/mongoUtil';

const PhotoUploadStep = ({ 
  uploadedPhotos = [],
  onUploadComplete, 
  prevStep, 
  nextStep,
  reportId = null
}) => {
  // Add debugging to see what photos are being passed in
  useEffect(() => {
    console.log('PhotoUploadStep received photos:', uploadedPhotos.length);
  }, [uploadedPhotos]);

  const handleUploadComplete = (newPhotos) => {
    console.log('PhotoUploadStep handleUploadComplete received:', newPhotos.length);
    
    // Only call onUploadComplete if we have photos with valid MongoDB IDs
    if (onUploadComplete && newPhotos && newPhotos.length > 0) {
      // Filter photos to only those with valid MongoDB IDs
      const validPhotos = filterPhotosWithValidIds(newPhotos);
      
      console.log('Photos with valid IDs:', validPhotos.length);
      
      if (validPhotos.length > 0) {
        // Call parent handler
        onUploadComplete(validPhotos);
      } else {
        console.warn('No photos with valid MongoDB IDs found. Check server response format.');
      }
    }
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Upload Photos</h3>
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Upload photos of the property for inspection. You can upload multiple photos at once.
              {!reportId && (
                <span className="block mt-1 font-medium">
                  Photos will be stored locally and automatically uploaded when the report is submitted.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
      
      <PhotoUploader 
        onUploadComplete={handleUploadComplete} 
        initialPhotos={uploadedPhotos}
        reportId={reportId}
        showUploadControls={true}
      />
      
      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={prevStep}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Back: Basic Info
        </button>
        
        <button
          type="button"
          onClick={nextStep}
          disabled={uploadedPhotos.length === 0}
          className={`${
            uploadedPhotos.length === 0 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-700'
          } text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline`}
        >
          Next: AI Analysis
        </button>
      </div>
    </div>
  );
};

export default PhotoUploadStep; 