import { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { uploadPhotos, analyzePhotos, deletePhoto } from '../../services/photoService';
import usePhotoUploadState from '../../hooks/usePhotoUploadState';
import PhotoSchema from 'shared/schemas/photoSchema';
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
 * The simplified upload system no longer uses chunked uploads, reducing complexity.
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
          setUploadProgress(progress);
        },
        fileMetadata
      );
      
      if (result.success) {
        // Get photos and idMapping from response
        const photos = result.data?.photos || [];
        const idMapping = result.data?.idMapping || {};
        
        // Create a local array to track updated photos with valid IDs
        const updatedPhotos = [];
        
        if (photos.length > 0) {
          // Update our photo collection with the server data
          photos.forEach(serverPhoto => {
            if (serverPhoto.clientId) {
              // Use the shared schema to deserialize the photo
              const updatedPhoto = PhotoSchema.deserializeFromApi(serverPhoto);
              updatePhotoAfterUpload(serverPhoto.clientId, updatedPhoto);
              // Add to our local array of updated photos
              updatedPhotos.push(updatedPhoto);
            }
          });
        } else if (Object.keys(idMapping).length > 0) {
          // If we have id mapping but no photos, construct photo objects from the mapping
          Object.entries(idMapping).forEach(([clientId, serverId]) => {
            // Find original file with this clientId
            const originalFile = filesToUpload.find(f => f.clientId === clientId);
            
            if (originalFile) {
              // Create a standardized photo object using the shared schema
              const photoData = PhotoSchema.createFromFile(originalFile);
              
              // Update with server data
              photoData._id = serverId;
              photoData.fileId = serverId;
              photoData.status = 'uploaded';
              photoData.uploadProgress = 100;
              
              // Deserialize using the shared schema to ensure consistent format
              const updatedPhoto = PhotoSchema.deserializeFromApi(photoData);
              
              updatePhotoAfterUpload(clientId, updatedPhoto);
              // Add to our local array of updated photos
              updatedPhotos.push(updatedPhoto);
            } else {
              // Create a minimal photo object with just the server ID
              const photoData = PhotoSchema.createEmpty();
              photoData._id = serverId;
              photoData.fileId = serverId;
              photoData.clientId = clientId;
              photoData.status = 'uploaded';
              photoData.uploadProgress = 100;
              
              // Deserialize using the shared schema
              const updatedPhoto = PhotoSchema.deserializeFromApi(photoData);
              
              // Add this as a new photo since we couldn't find a matching one
              setPhotos(prev => [...prev, updatedPhoto]);
              // Also add to our local array of updated photos
              updatedPhotos.push(updatedPhoto);
            }
          });
        } else {
          setError('No photos or ID mappings returned from server');
        }
        
        // After upload completes, notify parent with the updated photos
        if (onUploadComplete && updatedPhotos.length > 0) {
          onUploadComplete(updatedPhotos);
        }
      } else {
        setError(result.error || 'Failed to upload photos');
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
      
      if (result.success && result.results) {
        // Update photos with analysis results
        result.results.forEach(photoResult => {
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
      
      if (result.success && result.photos && result.photos.length > 0) {
        const analyzedPhoto = result.photos[0];
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
        progress={uploadProgress} 
        isUploading={uploading} 
      />
      
      <PhotoAnalysisProgress 
        progress={analysisProgress} 
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