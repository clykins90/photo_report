import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService } from '../services/photoService';
import { safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import { getPhotoUrl } from '../utils/photoUtils';
import PhotoSchema from 'shared/schemas/photoSchema';

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
  const [photos, setPhotos] = useState(() => initialPhotos || []);
  const [status, setStatus] = useState({ type: null, progress: 0, error: null });

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => cleanupAllBlobUrls();
  }, []);

  // Combined photo operations
  const photoOperations = {
    add: useCallback((files) => {
      if (!files?.length) return [];
      const newPhotos = Array.from(files).map(file => PhotoSchema.createFromFile(file));
      setPhotos(prev => [...prev, ...newPhotos]);
      return newPhotos;
    }, []),

    upload: useCallback(async (reportId) => {
      if (!reportId) {
        setStatus({ type: 'error', error: 'No report ID provided' });
        return false;
      }

      try {
        setStatus({ type: 'uploading', progress: 0 });
        const pendingPhotos = photos.filter(PhotoSchema.helpers.canUpload);
        
        if (!pendingPhotos.length) {
          setStatus({ type: null });
          return true;
        }

        const result = await uploadPhotos(
          pendingPhotos.map(p => p.file),
          reportId,
          progress => setStatus(prev => ({ ...prev, progress }))
        );

        if (result.success) {
          console.log('Upload succeeded with response:', result.data);
          
          // Process the response by directly preserving the server data
          setPhotos(prev => prev.map(photo => {
            // Find this photo in the server response
            const uploaded = result.data.photos.find(
              up => up.clientId === photo.clientId
            );
            
            if (uploaded) {
              console.log('Found matching photo:', uploaded);
              console.log('Server status:', uploaded.status);
              
              // Create a merged photo that preserves all server data while keeping client data
              return {
                ...photo,                 // Keep client data
                ...uploaded,              // Apply server data
                status: uploaded.status,  // Explicitly set the status from server
                _id: uploaded._id,        // Ensure ID is set
                path: uploaded.path,      // Ensure path is set
                uploadProgress: 100       // Mark as fully uploaded
              };
            }
            return photo;
          }));
          
          setStatus({ type: null });
          return true;
        }
        throw new Error(result.error);
      } catch (err) {
        setStatus({ type: 'error', error: err.message });
        return false;
      }
    }, [photos]),

    analyze: useCallback(async (reportId) => {
      if (!reportId) {
        setStatus({ type: 'error', error: 'No report ID provided' });
        return false;
      }

      try {
        setStatus({ type: 'analyzing' });
        const uploadedPhotos = photos.filter(PhotoSchema.helpers.canAnalyze);
        
        if (!uploadedPhotos.length) {
          setStatus({ type: null });
          return true;
        }

        const result = await analyzePhotosService(reportId, uploadedPhotos);

        if (result.success) {
          setPhotos(prev => prev.map(photo => {
            const analyzed = result.data.photos.find(ap => ap._id === photo._id);
            return analyzed ? PhotoSchema.deserializeFromApi(analyzed) : photo;
          }));
          setStatus({ type: null });
          return true;
        }
        throw new Error(result.error);
      } catch (err) {
        setStatus({ type: 'error', error: err.message });
        return false;
      }
    }, [photos]),

    remove: useCallback((photoToRemove) => {
      setPhotos(prev => {
        const id = photoToRemove._id || photoToRemove.clientId;
        return prev.filter(p => {
          const keep = (p._id || p.clientId) !== id;
          if (!keep && p.preview?.startsWith('blob:')) {
            safelyRevokeBlobUrl(p.preview);
          }
          return keep;
        });
      });
    }, []),

    clear: useCallback(() => {
      photos.forEach(p => {
        if (p.preview?.startsWith('blob:')) {
          safelyRevokeBlobUrl(p.preview);
        }
      });
      setPhotos([]);
      setStatus({ type: null });
    }, [photos])
  };

  const value = {
    photos,
    status,
    isUploading: status.type === 'uploading',
    isAnalyzing: status.type === 'analyzing',
    error: status.error,
    progress: status.progress,
    ...photoOperations,
    getPhotoUrl: useCallback((photo) => getPhotoUrl(photo), []),
    canUploadPhoto: PhotoSchema.helpers.canUpload,
    canAnalyzePhoto: PhotoSchema.helpers.canAnalyze,
    validatePhoto: PhotoSchema.helpers.validatePhoto
  };
  
  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 