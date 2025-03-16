import { useState, useEffect, useCallback } from 'react';
import photoStorageManager from '../services/photoStorageManager';

/**
 * Custom hook for managing photos with preserved local data
 * @param {Array} initialPhotos - Initial photos array
 * @returns {Object} - Photos state and utility functions
 */
const usePhotoStorage = (initialPhotos = []) => {
  // Initialize with preserved data
  const [photos, setPhotos] = useState(() => 
    photoStorageManager.preserveBatchPhotoData(initialPhotos)
  );
  
  // Update photos while preserving data
  const updatePhotos = useCallback((newPhotos) => {
    setPhotos(photoStorageManager.preserveBatchPhotoData(newPhotos));
  }, []);
  
  // Add photos while preserving data
  const addPhotos = useCallback((newPhotos) => {
    setPhotos(prev => [
      ...prev,
      ...photoStorageManager.preserveBatchPhotoData(newPhotos)
    ]);
  }, []);
  
  // Update a single photo
  const updatePhoto = useCallback((photoId, updatedData) => {
    setPhotos(prev => 
      prev.map(photo => {
        const id = photo._id || photo.id;
        if (id === photoId) {
          return photoStorageManager.preservePhotoData({
            ...photo,
            ...updatedData
          });
        }
        return photo;
      })
    );
  }, []);
  
  // Remove a photo
  const removePhoto = useCallback((photoId) => {
    setPhotos(prev => 
      prev.filter(photo => {
        const id = photo._id || photo.id;
        return id !== photoId;
      })
    );
  }, []);
  
  // Log photo data availability on changes
  useEffect(() => {
    photoStorageManager.logPhotoDataAvailability(photos);
  }, [photos]);
  
  return {
    photos,
    updatePhotos,
    addPhotos,
    updatePhoto,
    removePhoto,
    getPhotoUrl: photoStorageManager.getPhotoUrl,
    getBestDataSource: photo => photoStorageManager.getBestDataSource(photo),
    groupPhotosByDataAvailability: () => photoStorageManager.groupPhotosByDataAvailability(photos)
  };
};

export default usePhotoStorage; 