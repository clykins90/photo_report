import { useState, useEffect, useCallback } from 'react';
import { cleanupAllBlobUrls } from '../utils/blobUrlManager';
import { filterPhotosWithValidIds } from '../utils/mongoUtil';
import PhotoSchema from 'shared/schemas/photoSchema';
import photoStorageManager from '../services/photoStorageManager';

/**
 * Custom hook for managing photo upload state
 */
const usePhotoUploadState = (initialPhotos = []) => {
  // Initialize with preserved photo data
  const [photos, setPhotos] = useState(() => 
    photoStorageManager.preserveBatchPhotoData(initialPhotos)
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState(null);
  
  // Update with new initialPhotos if they change
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) {
      setPhotos(photoStorageManager.preserveBatchPhotoData(initialPhotos));
    }
    
    // Clean up blob URLs when unmounting
    return () => {
      cleanupAllBlobUrls();
    };
  }, [initialPhotos]);

  // Add new files to the photo collection
  const addFiles = useCallback((newFiles) => {
    if (!newFiles || newFiles.length === 0) return;
    
    setPhotos(prevPhotos => {
      const updatedPhotos = [...prevPhotos];
      
      // Add each new file to photos if not already present
      newFiles.forEach(file => {
        // Check if this file is already in the collection by matching filename
        const isDuplicate = updatedPhotos.some(photo => 
          photo.originalName === file.originalName || 
          photo.name === file.name
        );
        
        if (!isDuplicate) {
          // If the file is already a client photo object (has clientId), use it directly
          if (file.clientId) {
            updatedPhotos.push(photoStorageManager.preservePhotoData(file));
          } else {
            // Otherwise create a new client photo object using the shared schema
            updatedPhotos.push(photoStorageManager.preservePhotoData(
              PhotoSchema.createFromFile(file)
            ));
          }
        }
      });
      
      return updatedPhotos;
    });
  }, []);

  // Update upload progress for specific photo by client ID
  const updatePhotoUploadProgress = useCallback((clientId, progress) => {
    setPhotos(prevPhotos => {
      return prevPhotos.map(photo => {
        if (photo.clientId === clientId) {
          return photoStorageManager.preservePhotoData({
            ...photo, 
            uploadProgress: progress, 
            status: progress < 100 ? 'uploading' : 'uploaded'
          });
        }
        return photo;
      });
    });
  }, []);

  // Update photo after server upload with MongoDB ID
  const updatePhotoAfterUpload = useCallback((clientId, serverData) => {
    setPhotos(prevPhotos => {
      return prevPhotos.map(photo => {
        if (photo.clientId === clientId) {
          // Use the shared schema to deserialize the photo
          const updatedPhoto = PhotoSchema.deserializeFromApi({
            ...photo,
            ...serverData
          });
          return photoStorageManager.preservePhotoData(updatedPhoto);
        }
        return photo;
      });
    });
  }, []);

  // Update photo analysis state
  const updatePhotoAnalysis = useCallback((photoId, analysisData) => {
    setPhotos(prevPhotos => {
      return prevPhotos.map(photo => {
        if (photo._id === photoId) {
          return photoStorageManager.preservePhotoData({ 
            ...photo, 
            analysis: analysisData,
            status: analysisData ? 'analyzed' : 'analyzing'
          });
        }
        return photo;
      });
    });
  }, []);

  // Remove a photo by ID or client ID
  const removePhoto = useCallback((photoToRemove) => {
    setPhotos(prevPhotos => {
      // Remove by ID if available, otherwise by client ID
      const idToMatch = photoToRemove._id || photoToRemove.clientId;
      return prevPhotos.filter(photo => 
        photo._id !== idToMatch && photo.clientId !== idToMatch
      );
    });
  }, []);

  // Get only photos with valid IDs
  const getValidPhotos = useCallback(() => {
    return filterPhotosWithValidIds(photos);
  }, [photos]);

  return {
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
  };
};

export default usePhotoUploadState; 