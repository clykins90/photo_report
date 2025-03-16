import { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { uploadPhotos, analyzePhotos, deletePhoto } from '../../services/photoService';
import usePhotoUploadState from '../../hooks/usePhotoUploadState';
import PhotoSchema from 'shared/schemas/photoSchema';
import photoStorageManager from '../../services/photoStorageManager';
import { 
  PhotoDropzone, 
  PhotoUploadProgress, 
  PhotoAnalysisProgress, 
  PhotoGrid 
} from './components';

/**
 * PhotoUploader Component - Handles photo uploads and AI analysis
 * 
 * This component uses the shared PhotoSchema approach for consistent photo object handling:
 * - PhotoSchema.createFromFile() for creating client-side photo objects
 * - PhotoSchema.createEmpty() for creating empty photo objects
 * - PhotoSchema.deserializeFromApi() for processing server responses
 * 
 * The component also uses PhotoStorageManager to ensure all local file data is preserved.
 */
const PhotoUploader = ({ 
  onUploadComplete, 
  initialPhotos = [], 
  showUploadControls = true,
  reportId = null
}) => {
  // Initialize upload state with custom hook
  const {
    photos,
    setPhotos,
    uploading,
    setUploading,
    uploadProgress,
    setUploadProgress,
    analyzing,
    setAnalyzing,
    analysisProgress,
    setAnalysisProgress,
    error,
    setError,
    addFiles,
    updatePhotoUploadProgress,
    updatePhotoAfterUpload,
    updatePhotoAnalysis,
    removePhoto,
    getValidPhotos
  } = usePhotoUploadState(initialPhotos);
  
  // Handle file drop from dropzone
  const handleFileDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    
    // Create standardized client photo objects
    const clientPhotoObjects = acceptedFiles.map(file => PhotoSchema.createFromFile(file));
    
    // Add the files to our state
    addFiles(clientPhotoObjects);
    
    // If we have a report ID, start uploading immediately
    if (reportId) {
      uploadFilesToServer(acceptedFiles);
    }
  }, [addFiles, reportId]);
  
  // Upload files to server
  const uploadFilesToServer = async (filesToUpload) => {
    if (!reportId) {
      setError('Report ID is required for photo upload');
      return;
    }
    
    if (!filesToUpload || filesToUpload.length === 0) {
      return;
    }
    
    try {
      setUploading(true);
      setUploadProgress(0);
      setError(null);
      
      // Create file metadata including client IDs
      const fileMetadata = filesToUpload.map(file => {
        // If the file already has a clientId, use it; otherwise generate one
        const clientId = file.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Return minimal metadata needed for upload
        return { clientId };
      });
      
      // Upload the files with progress tracking
      const result = await uploadPhotos(
        filesToUpload, 
        reportId, 
        (progress) => {
          // Ensure progress is a number
          let numericProgress = 0;
          
          if (Array.isArray(progress)) {
            // Calculate average progress across all files
            if (progress.length > 0) {
              // Sum all progress values and divide by length
              const sum = progress.reduce((total, current) => total + (typeof current === 'number' ? current : 0), 0);
              numericProgress = sum / progress.length;
            }
          } else {
            // Single progress value
            numericProgress = typeof progress === 'number' ? progress : 0;
          }
          
          setUploadProgress(numericProgress);
        },
        fileMetadata
      );
      
      // Handle both possible API response formats
      const photoArray = result.data?.photos || result.photos;
      
      if (result.success && photoArray && Array.isArray(photoArray)) {
        // Create a local array to track updated photos with valid IDs
        const updatedPhotos = [];
        
        // Process each photo from the server response
        photoArray.forEach(serverPhoto => {
          // Find the original file object from our files array
          const originalFile = filesToUpload.find(file => {
            // Match by clientId if available
            if (serverPhoto.clientId && file.clientId) {
              return file.clientId === serverPhoto.clientId;
            }
            // Otherwise try to match by name
            return file.name === serverPhoto.originalName;
          });
          
          // Use the shared schema to deserialize the photo
          const updatedPhoto = PhotoSchema.deserializeFromApi(serverPhoto);
          
          // Explicitly preserve the file object
          if (originalFile) {
            updatedPhoto.file = originalFile;
          }
          
          // If the photo has a clientId, update the existing photo in our state
          if (serverPhoto.clientId) {
            updatePhotoAfterUpload(serverPhoto.clientId, updatedPhoto);
          } else {
            // If no clientId (shouldn't happen with this API), add as new
            setPhotos(prev => [...prev, photoStorageManager.preservePhotoData(updatedPhoto)]);
          }
          
          // Add to our list of updated photos to notify parent component
          updatedPhotos.push(photoStorageManager.preservePhotoData(updatedPhoto));
        });
        
        // After upload completes, notify parent with the updated photos
        if (onUploadComplete && updatedPhotos.length > 0) {
          // Log the photo data availability to verify files are preserved
          photoStorageManager.logPhotoDataAvailability(updatedPhotos);
          onUploadComplete(updatedPhotos);
        }
      } else {
        // If the response doesn't match our expected format
        console.error('Unexpected API response structure:', result);
        setError('Upload failed: Unexpected server response');
      }
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };
  
  // Analyze all photos for a report
  const analyzeAllPhotos = async () => {
    if (!reportId) {
      setError('Report ID is required for photo analysis');
      return;
    }
    
    const validPhotos = getValidPhotos();
    if (validPhotos.length === 0) {
      setError('No valid photos to analyze');
      return;
    }
    
    try {
      setAnalyzing(true);
      setAnalysisProgress(0);
      setError(null);
      
      // Get the IDs of all valid photos
      const photoIds = validPhotos.map(photo => photo._id).filter(id => id);
      
      const result = await analyzePhotos(reportId, photoIds);
      
      if (result.success) {
        // Handle both possible API response formats
        const resultsArray = result.results || result.data || [];
        
        // Update photos with analysis results
        resultsArray.forEach(photoResult => {
          if (photoResult.photoId && photoResult.analysis) {
            updatePhotoAnalysis(photoResult.photoId, photoResult.analysis);
          }
        });
        
        setAnalysisProgress(100);
      } else {
        setError(result.error || 'Failed to analyze photos');
      }
    } catch (err) {
      setError(`Analysis error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };
  
  // Analyze a single photo
  const handleAnalyzePhoto = async (photo) => {
    if (!reportId || !photo._id) {
      return;
    }
    
    try {
      // Mark photo as analyzing
      updatePhotoAnalysis(photo._id, null);
      
      const result = await analyzePhotos(reportId, [photo._id]);
      
      // Handle both possible API response formats
      const photosArray = result.photos || (result.data && result.data.photos) || [];
      
      if (result.success && photosArray.length > 0) {
        const analyzedPhoto = photosArray[0];
        updatePhotoAnalysis(photo._id, analyzedPhoto.analysis);
      } else {
        updatePhotoAnalysis(photo._id, { error: result.error || 'Analysis failed' });
      }
    } catch (err) {
      updatePhotoAnalysis(photo._id, { error: err.message });
    }
  };
  
  // Remove a photo
  const handleRemovePhoto = async (photo) => {
    // If photo has an ID and is uploaded, delete from server
    if (photo._id) {
      try {
        await deletePhoto(photo._id);
      } catch (err) {
        // Set error state instead of using console.error
        setError(`Failed to delete photo: ${err.message}`);
      }
    }
    
    // Remove from local state
    removePhoto(photo);
  };
  
  // Ensure progress values are always numbers
  const safeUploadProgress = typeof uploadProgress === 'number' ? uploadProgress : 
    (Array.isArray(uploadProgress) ? 
      // Calculate average if it's an array
      (uploadProgress.length > 0 ? 
        uploadProgress.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0) / uploadProgress.length 
        : 0) 
      : 0);
  
  const safeAnalysisProgress = typeof analysisProgress === 'number' ? analysisProgress : 
    (Array.isArray(analysisProgress) ? 
      // Calculate average if it's an array
      (analysisProgress.length > 0 ? 
        analysisProgress.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0) / analysisProgress.length 
        : 0) 
      : 0);
  
  return (
    <div className="photo-uploader space-y-4">
      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-md">
          {error}
        </div>
      )}
      
      {showUploadControls && (
        <PhotoDropzone 
          onDrop={handleFileDrop} 
          disabled={uploading || analyzing}
        />
      )}
      
      <PhotoUploadProgress 
        progress={safeUploadProgress} 
        isUploading={uploading} 
      />
      
      <PhotoAnalysisProgress 
        progress={safeAnalysisProgress} 
        isAnalyzing={analyzing} 
      />
      
      {photos.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">
              Photos ({photos.length})
            </h3>
            
            <div className="flex space-x-2">
              {showUploadControls && reportId && photos.some(p => !p._id) && (
                <button
                  onClick={() => uploadFilesToServer(photos.filter(p => !p._id))}
                  disabled={uploading || analyzing}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                >
                  Upload
                </button>
              )}
              
              {reportId && photos.some(p => p._id && !p.analysis) && (
                <button
                  onClick={analyzeAllPhotos}
                  disabled={uploading || analyzing}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                >
                  Analyze All
                </button>
              )}
            </div>
          </div>
          
          <PhotoGrid 
            photos={photos}
            onRemovePhoto={handleRemovePhoto}
            onAnalyzePhoto={handleAnalyzePhoto}
          />
        </div>
      )}
    </div>
  );
};

PhotoUploader.propTypes = {
  onUploadComplete: PropTypes.func,
  initialPhotos: PropTypes.array,
  showUploadControls: PropTypes.bool,
  reportId: PropTypes.string
};

export default PhotoUploader; 