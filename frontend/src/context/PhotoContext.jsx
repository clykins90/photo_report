import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService, deletePhoto } from '../services/photoService';
import { safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import {
  createPhotoFromFile,
  updatePhotoWithServerData,
  updatePhotoWithAnalysis,
  extractPhotoIds,
  filterPhotosByStatus,
  getPhotoUrl,
  preservePhotoData,
  preserveBatchPhotoData,
  groupPhotosByDataAvailability,
  getBestDataSource
} from '../utils/photoUtils';

// Remove excessive debugging that might cause rendering loops
// console.log('PhotoContext is using preservePhotoData from:', preservePhotoData.toString().substring(0, 100));

// Create context
const PhotoContext = createContext();

// Custom hook for using the photo context
export const usePhotoContext = () => {
  // Remove console.log that might contribute to the loop
  // console.log('usePhotoContext called');
  const context = useContext(PhotoContext);
  if (!context) {
    throw new Error('usePhotoContext must be used within a PhotoProvider');
  }
  return context;
};

export const PhotoProvider = ({ children, initialPhotos = [] }) => {
  // Reduce excessive debugging logs
  // console.log('PhotoProvider rendering with initialPhotos:', initialPhotos.length);
  
  // Main photo state
  const [photos, setPhotos] = useState(() => 
    initialPhotos?.length > 0 ? preserveBatchPhotoData(initialPhotos) : []
  );
  
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

  // initialPhotos effect (optional if needed for report loading)
  useEffect(() => {
    // console.log('initialPhotos useEffect running:', initialPhotos.length);
    if (!initialPhotos?.length) return;
    
    setPhotos(prevPhotos => {
      // Only replace if we don't already have photos
      return prevPhotos.length > 0 ? prevPhotos : preserveBatchPhotoData(initialPhotos);
    });
  }, [initialPhotos]);

  // SIMPLIFIED: Single function to update photo statuses consistently
  const updatePhotoStatus = useCallback((photoIds, newStatus, additionalData = {}) => {
    if (!photoIds) return;
    
    // Convert single ID to array
    const ids = Array.isArray(photoIds) ? photoIds : [photoIds];
    
    setPhotos(prevPhotos => {
      return prevPhotos.map(photo => {
        const photoId = photo.id || photo._id || photo.clientId;
        
        // If this photo needs updating
        if (ids.includes(photoId)) {
          return preservePhotoData({
            ...photo,
            ...additionalData,
            status: newStatus
          });
        }
        
        return photo;
      });
    });
  }, []);

  // Upload photos to server (simplified)
  const uploadPhotosToServer = useCallback(async (photosToUpload, reportId) => {
    if (!reportId || !photosToUpload?.length) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      // Extract files from photos
      const files = photosToUpload.map(p => p.file).filter(Boolean);
      if (!files.length) {
        setError('No valid files to upload');
        setIsUploading(false);
        return;
      }
      
      // Mark these photos as uploading
      const photoIds = photosToUpload.map(p => p.id || p.clientId);
      updatePhotoStatus(photoIds, 'uploading');
      
      // Upload photos
      const result = await uploadPhotos(files, reportId, (updatedPhotos, progress) => {
        // Update the overall progress state
        setUploadProgress(progress);
        
        // Update individual photo progress
        if (Array.isArray(updatedPhotos)) {
          const progressIds = updatedPhotos.map(p => p.id || p.clientId);
          const status = progress >= 100 ? 'uploaded' : 'uploading';
          updatePhotoStatus(progressIds, status, { uploadProgress: progress });
        }
      });

      if (result.success) {
        const { photos: uploadedPhotos, idMapping } = result.data;
        
        // Update photos with server data
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            // Match by clientId through idMapping or direct match
            const serverPhotoId = idMapping && photo.clientId && idMapping[photo.clientId];
            const uploadedPhoto = uploadedPhotos.find(up => 
              up._id === photo._id || 
              up._id === serverPhotoId
            );
            
            if (uploadedPhoto) {
              // Server returned this photo - merge and set to uploaded
              return preservePhotoData({
                ...photo,
                ...uploadedPhoto,
                _id: uploadedPhoto._id,
                file: photo.file, // preserve local file reference
                preview: photo.preview, // preserve preview URL
                status: 'uploaded',
                uploadProgress: 100
              });
            }
            
            return photo;
          });
        });
      } else {
        // Handle error
        setError(result.error || 'Upload failed');
        updatePhotoStatus(photoIds, 'error');
      }
    } catch (err) {
      // Changed from 'error' to 'err' to avoid shadowing the error state variable
      // console.error('Error uploading photos:', err);
      setError(err.message || 'Upload failed');
      
      // Mark affected photos as error
      const photoIds = photosToUpload.map(p => p.id || p._id || p.clientId);
      updatePhotoStatus(photoIds, 'error');
    } finally {
      setIsUploading(false);
    }
  }, [updatePhotoStatus]);

  // Add photos from files (simplified)
  const addPhotosFromFiles = useCallback((files, reportId = null) => {
    if (!files?.length) return;
    // console.log('addPhotosFromFiles called with files:', files.length, 'reportId:', reportId);

    // Create photos from files
    const newPhotos = Array.from(files).map(createPhotoFromFile);
    
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
    const processedPhotos = preserveBatchPhotoData(newPhotos);
    setPhotos(prevPhotos => [...prevPhotos, ...processedPhotos]);
    return processedPhotos;
  }, []);

  // Update existing photos
  const updatePhotos = useCallback((newPhotos) => {
    if (!newPhotos?.length) return;
    setPhotos(preserveBatchPhotoData(newPhotos));
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
      
      // Mark photos as analyzing
      const photoIds = photosForAnalysis.map(p => 
        typeof p === 'string' ? p : p._id || p.id
      );
      updatePhotoStatus(photoIds, 'analyzing');
      
      // Call service
      const result = await analyzePhotosService(reportId, photosForAnalysis);
      
      // Update progress halfway
      setAnalysisProgress(50);
      
      if (result.success) {
        // Process analysis results
        if (result.data?.photos) {
          setPhotos(prevPhotos => {
            return prevPhotos.map(photo => {
              const analyzedPhoto = result.data.photos.find(
                ap => ap._id === photo._id || ap.id === photo.id
              );
              
              if (analyzedPhoto) {
                return preservePhotoData({
                  ...photo,
                  ...analyzedPhoto,
                  status: 'analyzed'
                });
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
      // Fix the variable name to 'err' instead of 'error' to avoid confusion with the state variable
      // console.error('Analysis error:', err);
      setError(err.message || 'Analysis failed');
      
      const photoIds = photosForAnalysis.map(p => 
        typeof p === 'string' ? p : p._id || p.id
      );
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
        : photoToRemove._id || photoToRemove.id || photoToRemove.clientId;
      
      return prevPhotos.filter(photo => {
        const currentId = photo._id || photo.id || photo.clientId;
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
    getBestPhotoDataSource: (photo) => getBestDataSource(photo),
    getPhotoUrl: (photoOrId, options = {}) => getPhotoUrl(photoOrId, options),
    setError,
  };
  
  // Debug log for context value
  // console.log('PhotoContext providing with:', {
  //   photosCount: photos.length,
  //   isUploading,
  //   isAnalyzing
  // });
  
  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 