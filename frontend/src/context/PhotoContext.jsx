import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
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
  // Use a ref to keep track of the latest photos for logging purposes
  const photosRef = useRef(photos);
  
  // Update the ref when photos change
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

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

    // Function to force update photo status (for debugging/recovery)
    forceUpdateStatus: useCallback((photoId, newStatus) => {
      setPhotos(prev => prev.map(photo => {
        // Match by _id or clientId
        if ((photoId === photo._id) || (photoId === photo.clientId)) {
          return { ...photo, status: newStatus };
        }
        return photo;
      }));
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
          // Debug the server response
          console.log('Server response photos:', result.data.photos);
          
          // Process the response using direct object mapping
          const updatedPhotos = await new Promise(resolve => {
            setPhotos(prev => {
              const updated = prev.map(photo => {
                // First try matching by clientId (most reliable)
                const uploaded = result.data.photos.find(up => 
                  // Try all possible ways to match the photos
                  up.clientId === photo.clientId || 
                  up.originalClientId === photo.clientId ||
                  photo.originalClientId === up.clientId ||
                  (up.originalName === photo.originalName && photo.status === 'pending')
                );
                
                if (uploaded) {
                  // Create a merged photo with explicit status enforcement
                  return {
                    ...photo,                         // Base is client photo
                    _id: uploaded._id,                // Server ID
                    path: uploaded.path,              // Server path
                    status: 'uploaded',               // FORCE status to uploaded
                    uploadProgress: 100,              // Complete progress
                    uploadDate: uploaded.uploadDate,  // Server timestamp
                    aiAnalysis: uploaded.aiAnalysis,  // Analysis if present
                    preview: photo.preview,           // Preserve preview
                    file: photo.file                  // Preserve file
                  };
                }
                return photo;
              });
              
              // Resolve with the new state for logging
              setTimeout(() => resolve(updated), 0);
              return updated;
            });
          });
          
          // Log the actually updated photos
          console.log('Photos after update:', 
            updatedPhotos.map(p => ({ 
              id: p._id, 
              clientId: p.clientId, 
              status: p.status 
            }))
          );
          
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
            if (analyzed) {
              // Use the improved function that preserves client data
              return PhotoSchema.deserializeFromApi(analyzed, photo);
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