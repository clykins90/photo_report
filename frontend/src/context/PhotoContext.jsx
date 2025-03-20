import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService, deletePhoto } from '../services/photoService';
import { safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import {
  extractPhotoIds,
  filterPhotosByStatus,
  getPhotoUrl,
  groupPhotosByDataAvailability
} from '../utils/photoUtils';

// Create context
const PhotoContext = createContext();

// Custom hook for using the photo context
export const usePhotoContext = () => {
  const context = useContext(PhotoContext);
  if (!context) {
    throw new Error('usePhotoContext must be used within a PhotoProvider');
  }
  return context;
};

export const PhotoProvider = ({ children, initialPhotos = [] }) => {
  // Main photo state
  const [photos, setPhotos] = useState(() => initialPhotos || []);
  
  // UI state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState(null);

  // Derived data for dependency tracking
  const photoIds = useMemo(() => {
    return extractPhotoIds(photos, { includeClientIds: true });
  }, [photos]);

  const uploadedPhotoIds = useMemo(() => {
    return extractPhotoIds(filterPhotosByStatus(photos, 'uploaded'), { serverOnly: true });
  }, [photos]);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => cleanupAllBlobUrls();
  }, []);

  // initialPhotos effect
  useEffect(() => {
    if (!initialPhotos?.length) return;
    
    setPhotos(prevPhotos => {
      return prevPhotos.length > 0 ? prevPhotos : initialPhotos;
    });
  }, [initialPhotos]);

  // SIMPLIFIED: Single function to update photo statuses consistently
  const updatePhotoStatus = useCallback((photoIds, newStatus, additionalData = {}) => {
    if (!photoIds) return;
    
    // Convert single ID to array
    const ids = Array.isArray(photoIds) ? photoIds : [photoIds];
    
    setPhotos(prevPhotos => {
      return prevPhotos.map(photo => {
        const photoId = photo.clientId || photo._id;
        
        // If this photo needs updating
        if (ids.includes(photoId)) {
          return {
            ...photo,
            ...additionalData,
            status: newStatus
          };
        }
        
        return photo;
      });
    });
  }, []);

  // Upload photos to server (simplified)
  const uploadPhotosToServer = useCallback(async (photosToUpload, reportId) => {
    if (!reportId || !photosToUpload?.length) return { success: false, error: 'No photos or report ID provided' };

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      // Extract files from photos
      const files = photosToUpload.map(p => p.file).filter(Boolean);
      if (!files.length) {
        setError('No valid files to upload');
        setIsUploading(false);
        return { success: false, error: 'No valid files to upload' };
      }
      
      // Mark these photos as uploading
      const photoIds = photosToUpload.map(p => p.clientId);
      updatePhotoStatus(photoIds, 'uploading');
      
      // Upload photos with progress tracking
      const result = await uploadPhotos(files, reportId, (progressPhotos, progress) => {
        // Update overall progress
        setUploadProgress(progress);
        
        // Update individual photo progress
        if (Array.isArray(progressPhotos)) {
          const progressIds = progressPhotos.map(p => p.clientId);
          const status = progress >= 100 ? 'uploaded' : 'uploading';
          updatePhotoStatus(progressIds, status, { uploadProgress: progress });
        }
      });

      if (result.success) {
        const { photos: uploadedPhotos, idMapping } = result.data;
        
        // Update photos with server data
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            // Skip if this photo wasn't part of the upload
            if (!photo.clientId) return photo;
            
            // Get the server ID for this photo
            const serverId = idMapping[photo.clientId];
            if (!serverId) return photo;
            
            // Find the matching server photo data
            const serverPhoto = uploadedPhotos.find(p => p._id === serverId);
            if (!serverPhoto) return photo;
            
            // Create updated photo object
            return {
              ...photo,                    // Keep existing properties
              _id: serverId,              // Set server ID
              status: 'uploaded',         // Update status
              uploadProgress: 100,        // Complete progress
              path: serverPhoto.path,     // Server path
              contentType: serverPhoto.contentType,
              size: serverPhoto.size,
              uploadDate: serverPhoto.uploadDate,
              // Keep local data for UI
              file: photo.file,
              preview: photo.preview,
              clientId: photo.clientId    // Keep for reference
            };
          });
        });

        return result; // Return the successful result
      } else {
        // Handle error
        setError(result.error || 'Upload failed');
        updatePhotoStatus(photoIds, 'error');
        return result; // Return the error result
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
      updatePhotoStatus(photoIds, 'error');
      return { success: false, error: err.message || 'Upload failed' };
    } finally {
      setIsUploading(false);
    }
  }, [updatePhotoStatus]);

  // Add photos from files (simplified)
  const addPhotosFromFiles = useCallback((files, reportId = null) => {
    if (!files?.length) return;

    // Create photos with temporary IDs
    const newPhotos = Array.from(files).map(file => ({
      clientId: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      uploadProgress: 0,
      name: file.name,
      type: file.type,
      size: file.size
    }));
    
    // Add to state
    setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);

    // Start upload if report ID provided
    if (reportId) {
      uploadPhotosToServer(newPhotos, reportId);
    }

    return newPhotos;
  }, [uploadPhotosToServer]);

  // Add photo objects directly
  const addPhotos = useCallback((newPhotos) => {
    if (!newPhotos?.length) return [];
    setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);
    return newPhotos;
  }, []);

  // Update existing photos
  const updatePhotos = useCallback((newPhotos) => {
    if (!newPhotos?.length) return;
    setPhotos(newPhotos);
  }, []);

  // Update a single photo
  const updatePhoto = useCallback((photoId, updatedData) => {
    if (!photoId) return;
    updatePhotoStatus(photoId, updatedData.status || 'pending', updatedData);
  }, [updatePhotoStatus]);

  // Analyze photos (simplified)
  const analyzePhotos = useCallback(async (reportId, photosToAnalyze = null) => {
    if (!reportId) {
      setError('Report ID is required');
      return;
    }
    
    // Use provided photos or all uploaded ones
    let photosForAnalysis = photosToAnalyze;
    if (!photosForAnalysis) {
      photosForAnalysis = filterPhotosByStatus(photos, 'uploaded');
    } else if (!Array.isArray(photosForAnalysis)) {
      photosForAnalysis = [photosForAnalysis];
    }
    
    if (!photosForAnalysis.length) {
      setError('No photos to analyze');
      return;
    }
    
    try {
      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setError(null);
      
      // Start with initial progress
      setAnalysisProgress(10);
      
      // Filter out photos that don't have server IDs
      const photosWithServerIds = photosForAnalysis.filter(photo => {
        // Check for a valid MongoDB ObjectId (24 character hex string)
        const serverId = photo._id;
        return serverId && typeof serverId === 'string' && /^[0-9a-f]{24}$/i.test(serverId);
      });
      
      if (photosWithServerIds.length === 0) {
        setError('No photos with valid server IDs to analyze');
        setIsAnalyzing(false);
        return;
      }
      
      // Mark photos as analyzing - use only the _id field
      const photoIds = photosWithServerIds.map(p => p._id).filter(id => id);
      updatePhotoStatus(photoIds, 'analyzing');
      
      // Only send the _id field to the analyzePhotosService
      const result = await analyzePhotosService(reportId, photoIds);
      
      // Update progress halfway
      setAnalysisProgress(50);
      
      if (result.success) {
        // Process analysis results
        if (result.data?.photos) {
          setPhotos(prevPhotos => {
            return prevPhotos.map(photo => {
              const analyzedPhoto = result.data.photos.find(
                ap => ap._id === photo._id
              );
              
              if (analyzedPhoto) {
                return {
                  ...photo,
                  ...analyzedPhoto,
                  status: 'analyzed'
                };
              }
              
              return photo;
            });
          });
        }
        
        // Complete progress
        setAnalysisProgress(100);
      } else {
        setError(result.error || 'Analysis failed');
        updatePhotoStatus(photoIds, 'error');
      }
    } catch (err) {
      setError(err.message || 'Analysis failed');
      
      const photoIds = photosForAnalysis.map(p => p._id);
      updatePhotoStatus(photoIds, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [photos, updatePhotoStatus]);

  // Remove a photo
  const removePhoto = useCallback((photoToRemove) => {
    if (!photoToRemove) return;
    
    setPhotos(prevPhotos => {
      // Handle string ID or object
      const photoId = typeof photoToRemove === 'string' 
        ? photoToRemove
        : photoToRemove._id || photoToRemove.clientId;
      
      return prevPhotos.filter(photo => {
        const currentId = photo._id || photo.clientId;
        const shouldKeep = currentId !== photoId;
        
        // Clean up blob URL if removing
        if (!shouldKeep && photo.preview?.startsWith('blob:')) {
          safelyRevokeBlobUrl(photo.preview);
        }
        
        return shouldKeep;
      });
    });
  }, []);

  // Clear all photos
  const clearPhotos = useCallback(() => {
    // Guard against recursive updates
    if (photos.length === 0 && !isUploading && !isAnalyzing) return;

    // Clean up blob URLs
    photos.forEach(photo => {
      if (photo?.preview?.startsWith('blob:')) {
        safelyRevokeBlobUrl(photo.preview);
      }
    });
    
    // Batch state updates to prevent multiple re-renders
    setTimeout(() => {
      setPhotos([]);
      setUploadProgress(0);
      setAnalysisProgress(0);
      setIsUploading(false);
      setIsAnalyzing(false);
      setError(null);
    }, 0);
  }, [photos, isUploading, isAnalyzing]);

  // Utility methods (kept simple)
  const getPhotosByStatus = useCallback((status) => {
    return filterPhotosByStatus(photos, status);
  }, [photos]);

  // Context value
  const value = {
    // Photo data
    photos,
    photosCount: photos.length,
    isUploading,
    uploadProgress,
    isAnalyzing,
    analysisProgress,
    error,
    
    // Photo management
    addPhotosFromFiles,
    addPhotos,
    updatePhotos,
    updatePhoto,
    removePhoto,
    clearPhotos,
    uploadPhotosToServer,
    analyzePhotos,
    
    // Helpers
    getPhotosByStatus,
    groupPhotosByAvailability: (photosToGroup = photos) => groupPhotosByDataAvailability(photosToGroup),
    getPhotoUrl: (photoOrId, options = {}) => getPhotoUrl(photoOrId, options),
    setError,
  };
  
  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 