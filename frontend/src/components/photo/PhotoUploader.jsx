import { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { uploadBatchPhotos, analyzePhotos, analyzePhoto, deletePhoto } from '../../services/photoService';
import useUploadManager from '../../hooks/useUploadManager';
import usePhotoUploadState from '../../hooks/usePhotoUploadState';
import { 
  PhotoDropzone, 
  PhotoUploadProgress, 
  PhotoAnalysisProgress, 
  PhotoGrid 
} from './components';

// Helper function to extract the filename from a file object
const extractFilename = (file) => {
  if (file.name) return file.name;
  if (file.originalname) return file.originalname;
  if (file.path) return file.path.split('/').pop();
  if (file.relativePath) return file.relativePath.split('/').pop();
  if (file.handle && file.handle.name) return file.handle.name;
  return 'unknown-file';
};

/**
 * PhotoUploader Component - Handles photo uploads and AI analysis
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
  
  // Initialize the upload manager
  const uploadManager = useUploadManager({
    maxConcurrentUploads: 3,
    chunkSize: 500 * 1024, // 500KB chunks
    concurrentChunks: 3,
    autoStart: false // We'll start manually after preparing the files
  });
  
  // Handle file drop from dropzone
  const handleFileDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    
    // Add the files to our state
    addFiles(acceptedFiles);
    
    // If we have a report ID, start uploading immediately
    if (reportId) {
      uploadFilesToServer(acceptedFiles);
    }
  }, [addFiles, reportId]);
  
  // Notify parent when photos change, but only for non-upload changes
  useEffect(() => {
    // We're removing this effect entirely since it's causing a loop
    // The parent is already notified in uploadFilesToServer after successful uploads
    // This prevents the circular dependency between PhotoUploader and PhotoUploadStep
  }, [photos, uploading, analyzing, uploadProgress, onUploadComplete, getValidPhotos]);
  
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
      const fileMetadata = filesToUpload.map(file => ({
        clientId: file.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      }));
      
      // Upload the files with progress tracking
      const result = await uploadBatchPhotos(
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
        
        console.log('Upload result:', result);
        console.log('Photos returned:', photos.length);
        console.log('ID mappings:', Object.keys(idMapping).length);
        
        // Create a local array to track updated photos with valid IDs
        const updatedPhotos = [];
        
        if (photos.length > 0) {
          // Update our photo collection with the server data
          photos.forEach(serverPhoto => {
            if (serverPhoto.clientId) {
              updatePhotoAfterUpload(serverPhoto.clientId, serverPhoto);
              // Add to our local array of updated photos
              updatedPhotos.push(serverPhoto);
            }
          });
        } else if (Object.keys(idMapping).length > 0) {
          // If we have id mapping but no photos, construct photo objects from the mapping
          console.log('No photos in response but found ID mappings - creating photo objects');
          
          // Match the clientIds with the original files to get necessary metadata
          Object.entries(idMapping).forEach(([clientId, serverId]) => {
            // Find original file with this clientId
            const originalFile = filesToUpload.find(f => f.clientId === clientId);
            
            if (originalFile) {
              console.log(`Found matching file for clientId ${clientId}:`, originalFile);
              
              // Create a minimal photo object with the server ID
              const photoData = {
                _id: serverId,
                fileId: serverId,
                id: serverId, // Add id field for redundancy
                clientId: clientId,
                status: 'uploaded',
                uploadProgress: 100,
                filename: originalFile.name || 'unknown',
                originalName: originalFile.name || 'unknown',
                contentType: originalFile.type || 'image/jpeg',
                path: `/photos/${serverId}`
              };
              
              console.log('Created photo object from ID mapping:', photoData);
              updatePhotoAfterUpload(clientId, photoData);
              // Add to our local array of updated photos
              updatedPhotos.push(photoData);
            } else {
              console.warn(`No matching file found for clientId ${clientId}`);
              
              // Try to find a file by name or other properties
              const matchingFile = filesToUpload.find(f => {
                // Try to match by name if available
                if (f.name && f.name.includes(clientId)) return true;
                // Try other matching strategies if needed
                return false;
              });
              
              if (matchingFile) {
                console.log(`Found alternative matching file for clientId ${clientId}:`, matchingFile);
                
                // Create a photo object with the server ID
                const photoData = {
                  _id: serverId,
                  fileId: serverId,
                  id: serverId, // Add id field for redundancy
                  clientId: matchingFile.clientId || clientId,
                  status: 'uploaded',
                  uploadProgress: 100,
                  filename: matchingFile.name || 'unknown',
                  originalName: matchingFile.name || 'unknown',
                  contentType: matchingFile.type || 'image/jpeg',
                  path: `/photos/${serverId}`
                };
                
                console.log('Created photo object from alternative match:', photoData);
                updatePhotoAfterUpload(matchingFile.clientId || clientId, photoData);
                // Add to our local array of updated photos
                updatedPhotos.push(photoData);
              } else {
                // Create a minimal photo object with just the server ID
                console.log(`Creating minimal photo object for clientId ${clientId}`);
                const photoData = {
                  _id: serverId,
                  fileId: serverId,
                  id: serverId, // Add id field for redundancy
                  clientId: clientId,
                  status: 'uploaded',
                  uploadProgress: 100,
                  path: `/photos/${serverId}`
                };
                
                console.log('Created minimal photo object:', photoData);
                // Add this as a new photo since we couldn't find a matching one
                setPhotos(prev => [...prev, photoData]);
                // Also add to our local array of updated photos
                updatedPhotos.push(photoData);
              }
            }
          });
        } else {
          setError('No photos or ID mappings returned from server');
        }
        
        // After upload completes, notify parent with the updated photos
        // Use the local array instead of waiting for state to update
        if (onUploadComplete && updatedPhotos.length > 0) {
          // Ensure all photos have valid MongoDB IDs
          const validPhotos = updatedPhotos.filter(photo => {
            // Check if photo has a valid MongoDB ID
            const mongoId = photo._id || photo.fileId || photo.id;
            
            // For File objects or those without MongoDB IDs, check if they have a clientId
            // This allows us to include photos that are still being processed
            if (!mongoId && photo.clientId) {
              console.log('Photo has clientId but no MongoDB ID yet:', photo.clientId);
              return true; // Keep photos with clientId even if they don't have MongoDB ID yet
            }
            
            const hasValidId = mongoId && /^[0-9a-fA-F]{24}$/.test(mongoId.toString());
            
            if (!hasValidId) {
              console.warn('Photo missing valid ID:', photo);
            }
            
            return hasValidId;
          });
          
          console.log('Upload complete, sending updated photos to parent:', validPhotos.length);
          
          if (validPhotos.length > 0) {
            onUploadComplete(validPhotos);
          } else {
            console.error('No valid photos to send to parent after filtering');
            setError('Failed to process uploaded photos. Please try again.');
          }
        } else {
          console.warn('No updated photos available to send to parent');
        }
      } else {
        setError(result.error || 'Failed to upload photos');
      }
      
      // Remove the duplicate call to onUploadComplete since we're now handling it above
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
      
      const result = await analyzePhotos(reportId);
      
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
      
      const result = await analyzePhoto(photo, reportId);
      
      if (result.success && result.data) {
        updatePhotoAnalysis(photo._id, result.data);
      } else {
        // Reset status on error
        updatePhotoAnalysis(photo._id, { error: result.error || 'Analysis failed' });
      }
    } catch (err) {
      console.error('Error analyzing photo:', err);
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
        console.error('Error deleting photo:', err);
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