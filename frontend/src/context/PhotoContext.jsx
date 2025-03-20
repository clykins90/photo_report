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
  const [photos, setPhotos] = useState(() => initialPhotos || []);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => cleanupAllBlobUrls();
  }, []);

  // Add photos without uploading
  const addPhotosFromFiles = useCallback((files) => {
    if (!files?.length) return;

    // Create new photos
    const newPhotos = Array.from(files).map(file => createNewPhoto(file));
    setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);

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

      // Get valid photos for upload
      const validPhotos = photosToUpload.filter(photo => photoStateMachine.canUpload(photo));
      const files = validPhotos.map(p => p.file).filter(Boolean);
      const clientIds = validPhotos.map(p => p.clientId).filter(Boolean);

      if (!files.length) return { success: false, error: 'No valid files to upload' };

      // Update state to uploading
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => 
          clientIds.includes(photo.clientId)
            ? { ...photoStateMachine.transition(photo, PhotoState.UPLOADING), preview: photo.preview }
            : photo
        )
      );

      // Upload photos
      const result = await uploadPhotos(files, reportId, (progress) => {
        setUploadProgress(progress);
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => 
            clientIds.includes(photo.clientId)
              ? { ...photo, uploadProgress: progress }
              : photo
          )
        );
      });

      // Update state with server response
      if (result.success) {
        const { photos: serverPhotos, idMapping } = result.data;
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            if (!clientIds.includes(photo.clientId)) return photo;
            
            const serverId = idMapping[photo.clientId];
            const serverPhoto = serverPhotos.find(p => p._id === serverId);
            
            if (!serverPhoto) {
              return photoStateMachine.transition({
                ...photo,
                error: 'Upload failed',
                preview: photo.preview
              }, PhotoState.ERROR);
            }

            return {
              ...photoStateMachine.transition({
                ...photo,
                _id: serverId,
                path: serverPhoto.path,
                contentType: serverPhoto.contentType,
                size: serverPhoto.size
              }, PhotoState.UPLOADED),
              preview: photo.preview
            };
          })
        );
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

  // Analyze photos
  const analyzePhotos = useCallback(async (reportId) => {
    if (!reportId) return { success: false, error: 'Report ID required' };

    try {
      setIsAnalyzing(true);
      setError(null);

      // Get photos ready for analysis
      const photosToAnalyze = photos.filter(photo => photoStateMachine.canAnalyze(photo));
      if (!photosToAnalyze.length) return { success: false, error: 'No photos ready for analysis' };

      // Update state to analyzing
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => 
          photosToAnalyze.includes(photo)
            ? photoStateMachine.transition(photo, PhotoState.ANALYZING)
            : photo
        )
      );

      // Send for analysis
      const result = await analyzePhotosService(reportId, photosToAnalyze);

      // Update state with analysis results
      if (result.success) {
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            const analyzedPhoto = result.data.photos.find(ap => ap._id === photo._id);
            if (!analyzedPhoto) return photo;

            return photoStateMachine.transition({
              ...photo,
              aiAnalysis: analyzedPhoto.aiAnalysis
            }, PhotoState.ANALYZED);
          })
        );
      }

      return result;
    } catch (err) {
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

  // Clear all photos (for new report)
  const clearPhotos = useCallback(() => {
    // Revoke all blob URLs before clearing
    photos.forEach(photo => {
      if (photo.preview?.startsWith('blob:')) {
        safelyRevokeBlobUrl(photo.preview);
      }
    });
    setPhotos([]);
    setError(null);
  }, [photos]);

  const value = {
    photos,
    isUploading,
    uploadProgress,
    isAnalyzing,
    error,
    addPhotosFromFiles,
    analyzePhotos,
    removePhoto,
    clearPhotos,
    setError,
    canUploadPhoto: (photo) => photoStateMachine.canUpload(photo),
    canAnalyzePhoto: (photo) => photoStateMachine.canAnalyze(photo),
    isPhotoInState: (photo, state) => photoStateMachine.isInState(photo, state),
    getPhotoUrl: (photoOrId, options = {}) => getPhotoUrl(photoOrId, options),
    // Add state machine helper methods
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