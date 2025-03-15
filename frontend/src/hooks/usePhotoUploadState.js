import { useState, useEffect, useCallback } from 'react';
import { cleanupAllBlobUrls } from '../utils/blobUrlManager';
import { filterPhotosWithValidIds } from '../utils/mongoUtil';

/**
 * Custom hook for managing photo upload state
 */
const usePhotoUploadState = (initialPhotos = []) => {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState(null);
  
  // Initialize with any photos passed in
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) {
      setPhotos(initialPhotos);
    }
    
    // Clean up blob URLs when unmounting
    return () => {
      cleanupAllBlobUrls();
    };
  }, []);

  // Add new files to the photo collection
  const addFiles = useCallback((newFiles) => {
    if (!newFiles || newFiles.length === 0) return;
    
    setPhotos(prevPhotos => {
      const updatedPhotos = [...prevPhotos];
      
      // Add each new file to photos if not already present
      newFiles.forEach(file => {
        // Check if this file is already in the collection by matching filename
        const isDuplicate = updatedPhotos.some(photo => 
          photo.name === file.name || 
          photo.originalname === file.name ||
          photo.filename === file.name
        );
        
        if (!isDuplicate) {
          // Create a new photo object
          const newPhoto = {
            ...file,
            preview: URL.createObjectURL(file),
            clientId: `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            status: 'pending',
            uploadProgress: 0
          };
          
          updatedPhotos.push(newPhoto);
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
          return { ...photo, uploadProgress: progress, status: progress < 100 ? 'uploading' : 'uploaded' };
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
          return { 
            ...photo, 
            ...serverData, 
            status: 'uploaded',
            uploadProgress: 100
          };
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
          return { 
            ...photo, 
            analysis: analysisData,
            status: 'analyzed'
          };
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