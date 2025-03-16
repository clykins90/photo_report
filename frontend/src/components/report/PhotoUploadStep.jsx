import React from 'react';
import PhotoUploader from '../photo/PhotoUploader';
import PhotoSchema from 'shared/schemas/photoSchema';
import photoStorageManager from '../../services/photoStorageManager';

const PhotoUploadStep = ({ 
  uploadedPhotos = [],
  onUploadComplete, 
  prevStep, 
  nextStep,
  reportId = null
}) => {
  const handleUploadComplete = (newPhotos) => {
    // Only continue if we have photos
    if (newPhotos && newPhotos.length > 0) {
      console.log('Processing photos for upload complete:', newPhotos);
      
      // Use the storage manager to preserve all photo data
      const processedPhotos = photoStorageManager.preserveBatchPhotoData(newPhotos);
      
      // Verify file objects are preserved
      const photosWithFiles = processedPhotos.filter(p => !!p.file);
      console.log(`${photosWithFiles.length} of ${processedPhotos.length} photos have file objects preserved`);
      
      // Log the processed photos to verify they have the necessary data
      console.log('Processed photos with preserved file data:', 
        processedPhotos.map(p => ({
          id: p._id || p.id,
          hasFile: !!p.file,
          hasPreview: !!p.preview,
          hasLocalDataUrl: !!p.localDataUrl
        }))
      );
      
      // Pass all processed photos to the parent component
      if (onUploadComplete) {
        onUploadComplete(processedPhotos);
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
        preserveFiles={true} // Ensure the uploader keeps the file objects
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