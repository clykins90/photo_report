import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService, deletePhoto } from '../services/photoService';
import { createAndTrackBlobUrl, safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import {
  createPhotoFromFile,
  updatePhotoWithServerData,
  updatePhotoWithAnalysis,
  extractPhotoIds,
  filterPhotosByStatus
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

export const PhotoProvider = ({ children }) => {
  // Main photo state
  const [photos, setPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState(null);

  // Extract photo IDs for dependency arrays using our utility
  const photoIds = useMemo(() => 
    extractPhotoIds(photos, { includeClientIds: true }),
  [photos]);

  // Extract uploaded photo IDs for analysis using our utility
  const uploadedPhotoIds = useMemo(() => 
    extractPhotoIds(filterPhotosByStatus(photos, 'uploaded'), { serverOnly: true }),
  [photos]);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup blob URLs to prevent memory leaks
      photos.forEach(photo => {
        if (photo.preview && photo.preview.startsWith('blob:')) {
          safelyRevokeBlobUrl(photo.preview);
        }
      });
    };
  }, []);

  // Add new photos from files
  const addPhotosFromFiles = useCallback((files, reportId = null) => {
    if (!files || files.length === 0) return;

    // Create standardized photo objects using our utility
    const newPhotos = Array.from(files).map(file => {
      const preview = createAndTrackBlobUrl(file);
      return createPhotoFromFile(file, { preview });
    });

    // Add photos to state
    setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);

    // If report ID is provided, start uploading
    if (reportId) {
      uploadPhotosToServer(newPhotos, reportId);
    }

    return newPhotos;
  }, []);

  // Upload photos to server
  const uploadPhotosToServer = useCallback(async (photosToUpload, reportId) => {
    if (!reportId || !photosToUpload || photosToUpload.length === 0) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      // Get files to upload
      const files = photosToUpload.map(photo => photo.file);
      
      // Upload the files
      const result = await uploadPhotos(
        files, 
        reportId, 
        (updatedPhotos, progress) => {
          // Update progress state
          setUploadProgress(progress);
          
          // Update individual photo progress
          if (Array.isArray(updatedPhotos)) {
            setPhotos(prevPhotos => {
              return prevPhotos.map(photo => {
                const matchingPhoto = updatedPhotos.find(
                  up => up.clientId === photo.id || up.name === photo.name
                );
                if (matchingPhoto) {
                  return {
                    ...photo,
                    uploadProgress: matchingPhoto.uploadProgress || progress
                  };
                }
                return photo;
              });
            });
          }
        }
      );

      if (result.success) {
        // Update photos with server data using our utility
        const serverPhotos = result.data?.photos || [];
        
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            const serverPhoto = serverPhotos.find(
              sp => sp.clientId === photo.id || sp.name === photo.name
            );
            
            if (serverPhoto) {
              return updatePhotoWithServerData(photo, serverPhoto);
            }
            return photo;
          });
        });
      } else {
        setError(result.error || 'Upload failed');
      }
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Analyze photos
  const analyzePhotos = useCallback(async (reportId, photoIds = null) => {
    if (!reportId) {
      setError('Report ID is required for photo analysis');
      return;
    }

    // If no specific photo IDs are provided, use all uploaded photos
    const photosToAnalyzeIds = photoIds || uploadedPhotoIds;

    if (photosToAnalyzeIds.length === 0) {
      setError('No photos to analyze');
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setError(null);
      
      // Call analysis API with IDs
      const result = await analyzePhotosService(reportId, photosToAnalyzeIds);
      
      if (result.success) {
        // Get analysis results
        const analysisResults = result.results || [];
        
        // Update photos with analysis data using our utility
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            const analysis = analysisResults.find(r => r.photoId === photo._id);
            
            if (analysis) {
              return updatePhotoWithAnalysis(photo, analysis.analysis);
            }
            return photo;
          });
        });
        
        setAnalysisProgress(100);
      } else {
        setError(result.error || 'Analysis failed');
      }
    } catch (err) {
      setError(`Analysis error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [uploadedPhotoIds]); // Depend only on the IDs of uploaded photos, not the entire photos array

  // Remove a photo
  const removePhoto = useCallback(async (photoToRemove) => {
    // If photo has server ID, delete from server
    if (photoToRemove._id) {
      try {
        await deletePhoto(photoToRemove._id);
      } catch (err) {
        setError(`Failed to delete photo: ${err.message}`);
      }
    }

    // Remove from local state
    setPhotos(prevPhotos => prevPhotos.filter(photo => 
      photo.id !== photoToRemove.id && photo._id !== photoToRemove._id
    ));

    // Clean up blob URL if it exists
    if (photoToRemove.preview && photoToRemove.preview.startsWith('blob:')) {
      safelyRevokeBlobUrl(photoToRemove.preview);
    }
  }, []);

  // Clear all photos with blob URL cleanup
  const clearPhotos = useCallback(() => {
    // Clean up blob URLs
    photos.forEach(photo => {
      if (photo.preview && photo.preview.startsWith('blob:')) {
        safelyRevokeBlobUrl(photo.preview);
      }
    });
    
    setPhotos([]);
  }, [photos]);

  // Reset photo state for a new report
  const resetPhotoState = useCallback(() => {
    // We call clearPhotos directly, not through the dependency
    // Clean up blob URLs
    photos.forEach(photo => {
      if (photo.preview && photo.preview.startsWith('blob:')) {
        safelyRevokeBlobUrl(photo.preview);
      }
    });
    
    setPhotos([]);
    
    setIsUploading(false);
    setUploadProgress(0);
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    setError(null);
  }, [photos]);

  // Context value
  const contextValue = {
    photos,
    isUploading,
    uploadProgress,
    isAnalyzing,
    analysisProgress,
    error,
    setError,
    addPhotosFromFiles,
    uploadPhotosToServer,
    analyzePhotos,
    removePhoto,
    clearPhotos,
    resetPhotoState
  };

  return (
    <PhotoContext.Provider value={contextValue}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 