import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService } from '../services/photoService';
import { safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import { getPhotoUrl } from '../utils/photoUtils';

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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => cleanupAllBlobUrls();
  }, []);

  // Add photos from files (simplified)
  const addPhotosFromFiles = useCallback((files, reportId = null) => {
    if (!files?.length) return;

    const newPhotos = Array.from(files).map(file => ({
      clientId: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      name: file.name,
      type: file.type,
      size: file.size
    }));
    
    setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);

    if (reportId) {
      uploadPhotosToServer(newPhotos, reportId);
    }

    return newPhotos;
  }, []);

  // Upload photos to server (simplified)
  const uploadPhotosToServer = useCallback(async (photosToUpload, reportId) => {
    if (!reportId || !photosToUpload?.length) {
      return { success: false, error: 'No photos or report ID provided' };
    }

    try {
      setIsUploading(true);
      setError(null);

      const files = photosToUpload.map(p => p.file).filter(Boolean);
      const clientIds = photosToUpload.map(p => p.clientId).filter(Boolean);
      
      if (!files.length) {
        setError('No valid files to upload');
        return { success: false, error: 'No valid files to upload' };
      }

      // Set all target photos to uploading state
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => 
          clientIds.includes(photo.clientId) 
            ? { ...photo, status: 'uploading' }
            : photo
        )
      );
      
      const result = await uploadPhotos(files, reportId, (_, progress) => {
        setUploadProgress(progress);
      });

      if (result.success) {
        const { photos: uploadedPhotos, idMapping } = result.data;
        
        // Update photos with server data
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            if (!clientIds.includes(photo.clientId)) return photo;
            
            const serverId = idMapping[photo.clientId];
            const serverPhoto = uploadedPhotos.find(p => p._id === serverId);
            
            return serverPhoto ? {
              ...photo,
              _id: serverId,
              status: 'uploaded',
              path: serverPhoto.path,
              contentType: serverPhoto.contentType,
              size: serverPhoto.size
            } : photo;
          })
        );
      } else {
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => 
            clientIds.includes(photo.clientId)
              ? { ...photo, status: 'error' }
              : photo
          )
        );
        setError(result.error || 'Upload failed');
      }

      return result;
    } catch (err) {
      setError(err.message || 'Upload failed');
      return { success: false, error: err.message };
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, []);

  // Analyze photos (simplified)
  const analyzePhotos = useCallback(async (reportId) => {
    if (!reportId) {
      setError('Report ID is required');
      return;
    }

    try {
      setIsAnalyzing(true);
      setError(null);

      // Get uploaded photos with valid server IDs
      const photosToAnalyze = photos.filter(photo => 
        photo.status === 'uploaded' && 
        photo._id?.match(/^[0-9a-f]{24}$/i)
      );

      if (!photosToAnalyze.length) {
        setError('No uploaded photos to analyze');
        return;
      }

      const photoIds = photosToAnalyze.map(p => p._id);

      // Set analyzing state
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => 
          photoIds.includes(photo._id)
            ? { ...photo, status: 'analyzing' }
            : photo
        )
      );

      const result = await analyzePhotosService(reportId, photoIds);

      if (result.success && result.data?.photos) {
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            const analyzedPhoto = result.data.photos.find(ap => ap._id === photo._id);
            return analyzedPhoto ? {
              ...photo,
              ...analyzedPhoto,
              status: 'analyzed'
            } : photo;
          })
        );
      } else {
        setError(result.error || 'Analysis failed');
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => 
            photoIds.includes(photo._id)
              ? { ...photo, status: 'error' }
              : photo
          )
        );
      }
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [photos]);

  // Remove photo (simplified)
  const removePhoto = useCallback((photoToRemove) => {
    if (!photoToRemove) return;
    
    setPhotos(prevPhotos => {
      const idToRemove = typeof photoToRemove === 'string' 
        ? photoToRemove 
        : photoToRemove._id || photoToRemove.clientId;
      
      return prevPhotos.filter(photo => {
        const shouldKeep = (photo._id || photo.clientId) !== idToRemove;
        if (!shouldKeep && photo.preview?.startsWith('blob:')) {
          safelyRevokeBlobUrl(photo.preview);
        }
        return shouldKeep;
      });
    });
  }, []);

  // Clear all photos (simplified)
  const clearPhotos = useCallback(() => {
    photos.forEach(photo => {
      if (photo?.preview?.startsWith('blob:')) {
        safelyRevokeBlobUrl(photo.preview);
      }
    });
    setPhotos([]);
    setError(null);
    setUploadProgress(0);
    setIsUploading(false);
    setIsAnalyzing(false);
  }, [photos]);

  const value = {
    photos,
    isUploading,
    uploadProgress,
    isAnalyzing,
    error,
    addPhotosFromFiles,
    uploadPhotosToServer,
    analyzePhotos,
    removePhoto,
    clearPhotos,
    setError,
    getPhotoUrl: (photoOrId, options = {}) => getPhotoUrl(photoOrId, options),
  };
  
  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 