import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService } from '../services/photoService';
import { safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import { getPhotoUrl } from '../utils/photoUtils';
import { photoStateMachine, PhotoState, createNewPhoto } from '../utils/photoStateMachine';

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

    const newPhotos = Array.from(files).map(file => createNewPhoto(file));
    
    console.log('Adding new photos:', newPhotos.map(p => ({ 
      clientId: p.clientId, 
      name: p.name, 
      status: p.status 
    })));
    
    setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);

    if (reportId) {
      uploadPhotosToServer(newPhotos, reportId);
    }

    return newPhotos;
  }, []);

  // Upload photos to server
  const uploadPhotosToServer = useCallback(async (photosToUpload, reportId) => {
    if (!reportId || !photosToUpload?.length) {
      return { success: false, error: 'No photos or report ID provided' };
    }

    try {
      setIsUploading(true);
      setError(null);

      // Filter photos that can be uploaded according to state machine
      const validPhotos = photosToUpload.filter(photo => {
        const canUpload = photoStateMachine.canUpload(photo);
        if (!canUpload) {
          console.warn(`Photo ${photo.clientId} cannot be uploaded. Current state: ${photo.status}`);
        }
        return canUpload;
      });

      console.log('Valid photos for upload:', validPhotos.map(p => ({
        clientId: p.clientId,
        status: p.status,
        hasFile: !!p.file
      })));

      const files = validPhotos.map(p => p.file).filter(Boolean);
      const clientIds = validPhotos.map(p => p.clientId).filter(Boolean);
      
      if (!files.length) {
        const error = 'No valid files to upload';
        console.warn(error, {
          totalPhotos: photosToUpload.length,
          validPhotos: validPhotos.length,
          files: files.length
        });
        setError(error);
        return { success: false, error };
      }

      // Set uploading state using state machine
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => {
          if (!clientIds.includes(photo.clientId)) return photo;
          try {
            return photoStateMachine.transition(photo, PhotoState.UPLOADING);
          } catch (err) {
            console.warn(`Failed to transition photo ${photo.clientId} to uploading state:`, err);
            // If we can't transition to uploading, try to transition to error
            try {
              return photoStateMachine.transition({
                ...photo,
                error: 'Failed to prepare for upload'
              }, PhotoState.ERROR);
            } catch (e) {
              console.error('Failed to set error state:', e);
              return photo;
            }
          }
        })
      );

      const result = await uploadPhotos(files, reportId, (progress) => {
        setUploadProgress(progress);
        // Update progress but don't change state
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => 
            clientIds.includes(photo.clientId)
              ? { ...photo, uploadProgress: progress }
              : photo
          )
        );
      });

      if (result.success) {
        const { photos: uploadedPhotos, idMapping } = result.data;
        
        console.log('Upload successful:', {
          uploadedPhotos: uploadedPhotos.map(p => ({id: p._id, status: 'uploaded'})),
          idMapping,
          clientIds
        });
        
        // Create a map of client IDs to server photos for easier lookup
        const serverPhotoMap = {};
        Object.entries(idMapping).forEach(([clientId, serverId]) => {
          const serverPhoto = uploadedPhotos.find(p => p._id === serverId);
          if (serverPhoto) {
            serverPhotoMap[clientId] = serverPhoto;
          }
        });
        
        // Update photos with server data using state machine
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            // Skip photos that weren't part of this upload
            if (!clientIds.includes(photo.clientId)) return photo;
            
            // Find the corresponding server photo
            const serverPhoto = serverPhotoMap[photo.clientId];
            
            if (!serverPhoto) {
              console.warn(`No server data found for photo ${photo.clientId}`, {
                availableIds: Object.keys(serverPhotoMap),
                idMapping,
                uploadedPhotoIds: uploadedPhotos.map(p => p._id)
              });
              return photo;
            }

            try {
              return photoStateMachine.transition({
                ...photo,
                _id: serverPhoto._id,
                path: serverPhoto.path,
                contentType: serverPhoto.contentType,
                size: serverPhoto.size
              }, PhotoState.UPLOADED);
            } catch (err) {
              console.warn(`Failed to transition photo ${photo.clientId} to uploaded state:`, err);
              return photoStateMachine.transition({
                ...photo,
                error: 'Failed to process server response'
              }, PhotoState.ERROR);
            }
          })
        );
      } else {
        console.error('Upload failed:', result.error);
        // Set error state using state machine
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            if (!clientIds.includes(photo.clientId)) return photo;
            try {
              return photoStateMachine.transition({
                ...photo,
                error: result.error || 'Upload failed'
              }, PhotoState.ERROR);
            } catch (err) {
              console.warn(`Failed to transition photo ${photo.clientId} to error state:`, err);
              return photo;
            }
          })
        );
        setError(result.error || 'Upload failed');
      }

      return result;
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
      return { success: false, error: err.message };
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, []);

  // Analyze photos
  const analyzePhotos = useCallback(async (reportId) => {
    if (!reportId) {
      setError('Report ID is required');
      return { success: false, error: 'Report ID is required' };
    }

    try {
      setIsAnalyzing(true);
      setError(null);

      // Get photos that can be analyzed according to state machine
      const photosToAnalyze = photos.filter(photo => 
        photoStateMachine.canAnalyze(photo) && 
        photo._id?.match(/^[0-9a-f]{24}$/i)
      );

      if (!photosToAnalyze.length) {
        setError('No photos ready for analysis');
        return { success: false, error: 'No photos ready for analysis' };
      }

      const photoIds = photosToAnalyze.map(p => p._id);
      
      // Set analyzing state using state machine
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => {
          if (!photoIds.includes(photo._id)) return photo;
          try {
            return photoStateMachine.transition(photo, PhotoState.ANALYZING);
          } catch (err) {
            console.warn(`Failed to transition photo ${photo._id} to analyzing state:`, err);
            return photo;
          }
        })
      );

      const result = await analyzePhotosService(reportId, photoIds);

      if (result.success && result.data?.photos) {
        // Update photos with analysis data using state machine
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            const analyzedPhoto = result.data.photos.find(ap => ap._id === photo._id);
            if (!analyzedPhoto) return photo;

            try {
              return photoStateMachine.transition({
                ...photo,
                analysis: analyzedPhoto.analysis
              }, PhotoState.ANALYZED);
            } catch (err) {
              console.warn(`Failed to transition photo ${photo._id} to analyzed state:`, err);
              return photo;
            }
          })
        );
      } else {
        // Set error state using state machine
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            if (!photoIds.includes(photo._id)) return photo;
            try {
              return photoStateMachine.transition({
                ...photo,
                error: result.error || 'Analysis failed'
              }, PhotoState.ERROR);
            } catch (err) {
              console.warn(`Failed to transition photo ${photo._id} to error state:`, err);
              return photo;
            }
          })
        );
        setError(result.error || 'Analysis failed');
      }
      
      return result;
    } catch (err) {
      console.error('Photo analysis error:', err);
      setError(err.message || 'Analysis failed');
      return { success: false, error: err.message };
    } finally {
      setIsAnalyzing(false);
    }
  }, [photos]);

  // Remove photo (with state machine validation)
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
    setError,
    getPhotoUrl: (photoOrId, options = {}) => getPhotoUrl(photoOrId, options),
    // Add state machine helper methods
    canUploadPhoto: (photo) => photoStateMachine.canUpload(photo),
    canAnalyzePhoto: (photo) => photoStateMachine.canAnalyze(photo),
    isPhotoInState: (photo, state) => photoStateMachine.isInState(photo, state),
    getPhotoNextStates: (photo) => photoStateMachine.getNextPossibleStates(photo.status),
    validatePhoto: (photo) => photoStateMachine.validatePhoto(photo)
  };
  
  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 