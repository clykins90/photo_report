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
    console.log(`Updating photo with clientId ${clientId} with server data:`, serverData);
    
    setPhotos(prevPhotos => {
      return prevPhotos.map(photo => {
        if (photo.clientId === clientId) {
          // Ensure we have valid MongoDB IDs by explicitly setting them
          const updatedPhoto = { 
            ...photo, 
            ...serverData,
            // Explicitly set the MongoDB ID fields to ensure they're properly assigned
            _id: serverData._id || serverData.fileId || serverData.id,
            fileId: serverData.fileId || serverData._id || serverData.id,
            status: 'uploaded',
            uploadProgress: 100
          };
          console.log(`Updated photo with MongoDB ID:`, {
            clientId,
            _id: updatedPhoto._id,
            fileId: updatedPhoto.fileId,
            isValid: updatedPhoto._id ? /^[0-9a-fA-F]{24}$/.test(updatedPhoto._id) : false
          });
          return updatedPhoto;
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
    console.log('Getting valid photos for analysis...');
    const validPhotos = filterPhotosWithValidIds(photos);
    console.log(`Found ${validPhotos.length} photos with valid MongoDB IDs for analysis`);
    if (validPhotos.length > 0) {
      console.log('First valid photo:', validPhotos[0]);
    }
    return validPhotos;
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