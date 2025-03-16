import React, { useState } from 'react';
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
  // Add state to track upload progress and status
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

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
      
      // Keep the progress bar visible for a moment before resetting
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 1000);
      
      // Pass all processed photos to the parent component
      if (onUploadComplete) {
        onUploadComplete(processedPhotos);
      }
    }
  };

  // Add a progress callback handler
  const handleUploadProgress = (updatedPhotos, progress) => {
    console.log('Upload progress update:', progress, updatedPhotos);
    
    // Set uploading state to true when progress updates start
    if (progress > 0 && !isUploading) {
      setIsUploading(true);
    }
    
    // Ensure progress is a number
    if (typeof progress === 'number') {
      setUploadProgress(progress);
    } else if (Array.isArray(updatedPhotos)) {
      // If it's an array of photos with progress, calculate the average
      const totalProgress = updatedPhotos.reduce((sum, photo) => {
        return sum + (photo.uploadProgress || 0);
      }, 0);
      setUploadProgress(totalProgress / updatedPhotos.length);
    }
    
    // If progress is 100%, don't immediately hide the progress bar
    // Let the handleUploadComplete function handle that
    if (progress === 100) {
      // Keep the progress at 100% but don't reset isUploading yet
      setUploadProgress(100);
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
      
      {/* Show progress bar directly in this component for better control */}
      {isUploading && (
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-blue-700">
              Uploading photos... {Math.round(uploadProgress)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
              style={{ width: `${Math.min(Math.round(uploadProgress), 100)}%` }}
            />
          </div>
        </div>
      )}
      
      <PhotoUploader 
        onUploadComplete={handleUploadComplete} 
        initialPhotos={uploadedPhotos}
        reportId={reportId}
        showUploadControls={true}
        preserveFiles={true} // Ensure the uploader keeps the file objects
        onProgressUpdate={handleUploadProgress} // Add progress update handler
        initialProgress={uploadProgress} // Pass initial progress
        forceShowProgress={isUploading} // Force progress bar to show
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
          disabled={uploadedPhotos.length === 0 || isUploading}
          className={`${
            uploadedPhotos.length === 0 || isUploading
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