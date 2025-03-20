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
      // Ensure each file has a stable client ID that will be used for matching
      const filesWithClientIds = Array.from(files).map(file => {
        // If the file already has a clientId, use it, otherwise create one
        if (!file.clientId) {
          const clientId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          file.clientId = clientId;
          file.originalClientId = clientId;
        }
        return file;
      });
      
      const newPhotos = filesWithClientIds.map(file => PhotoSchema.createFromFile(file));
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
        
        // Log the files we're sending to ensure they have clientIds
        console.log('Files to upload:', pendingPhotos.map(p => ({
          name: p.originalName,
          clientId: p.clientId,
          hasFile: !!p.file,
          fileClientId: p.file?.clientId
        })));

        const result = await uploadPhotos(
          pendingPhotos.map(p => p.file),
          reportId,
          progress => setStatus(prev => ({ ...prev, progress }))
        );

        if (result.success) {
          // Debug the server response once
          console.log('Server response photos:', result.data.photos);
          
          // Process the response in a single transaction to avoid multiple updates
          setPhotos(prev => {
            // Create a mapping of client IDs to server photos for efficient lookup
            const serverPhotoMap = {};
            result.data.photos.forEach(serverPhoto => {
              if (serverPhoto.clientId) {
                serverPhotoMap[serverPhoto.clientId] = serverPhoto;
              }
            });
            
            // Add additional debug information - only once
            console.log('Server photo map keys:', Object.keys(serverPhotoMap));
            
            // Update client photos with server data in a single pass
            const updated = prev.map(photo => {
              // Skip photos that aren't pending uploads
              if (photo.status !== 'pending') {
                return photo;
              }
              
              // Try to find the matching server photo by clientId
              const serverPhoto = serverPhotoMap[photo.clientId];
              
              if (serverPhoto) {
                console.log(`Found match: Client ID ${photo.clientId} -> Server ID ${serverPhoto._id}`);
                // Create a merged photo with explicit status enforcement
                return {
                  ...photo,                             // Base is client photo
                  _id: serverPhoto._id,                 // Server ID
                  path: serverPhoto.path,               // Server path
                  status: 'uploaded',                   // FORCE status to uploaded
                  uploadProgress: 100,                  // Complete progress
                  uploadDate: serverPhoto.uploadDate,   // Server timestamp
                  aiAnalysis: serverPhoto.aiAnalysis,   // Analysis if present
                  preview: photo.preview,               // Preserve preview URL
                  url: `/api/photos/${serverPhoto._id}`, // Add direct URL for display
                  file: photo.file                      // Preserve file
                };
              } else if (result.data.idMapping && result.data.idMapping[photo.clientId]) {
                // Try matching by ID map from server response
                const mappedId = result.data.idMapping[photo.clientId];
                const mappedPhoto = result.data.photos.find(sp => sp._id === mappedId);
                
                if (mappedPhoto) {
                  console.log(`Found match through ID mapping: Client ID ${photo.clientId} -> Server ID ${mappedPhoto._id}`);
                  return {
                    ...photo,
                    _id: mappedPhoto._id,
                    path: mappedPhoto.path,
                    status: 'uploaded',
                    uploadProgress: 100,
                    uploadDate: mappedPhoto.uploadDate,
                    aiAnalysis: mappedPhoto.aiAnalysis,
                    preview: photo.preview,             // Preserve preview URL
                    url: `/api/photos/${mappedPhoto._id}`, // Add direct URL for display
                    file: photo.file
                  };
                }
              } else {
                // If still no match, try a fallback match by original filename
                const fallbackMatch = result.data.photos.find(sp => 
                  sp.originalName === photo.originalName
                );
                
                if (fallbackMatch) {
                  console.log(`Fallback match by filename: ${photo.originalName} -> ${fallbackMatch._id}`);
                  return {
                    ...photo,
                    _id: fallbackMatch._id,
                    path: fallbackMatch.path,
                    status: 'uploaded',
                    uploadProgress: 100,
                    uploadDate: fallbackMatch.uploadDate,
                    aiAnalysis: fallbackMatch.aiAnalysis,
                    preview: photo.preview,             // Preserve preview URL
                    url: `/api/photos/${fallbackMatch._id}`, // Add direct URL for display
                    file: photo.file
                  };
                }
              }
              
              // No match found, keep the client photo unchanged
              return photo;
            });
            
            return updated;
          });
          
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
              // Deep copy the photo to be updated
              const updatedPhoto = PhotoSchema.deserializeFromApi(analyzed, photo);
              
              // Ensure analysis data is properly assigned
              if (analyzed.analysis || analyzed.aiAnalysis) {
                updatedPhoto.aiAnalysis = analyzed.aiAnalysis || analyzed.analysis;
                updatedPhoto.status = 'analyzed';
              }
              
              // Log for debugging
              console.log('Updated photo with analysis:', updatedPhoto);
              
              return updatedPhoto;
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