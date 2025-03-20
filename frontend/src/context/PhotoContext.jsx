import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService } from '../services/photoService';
import { safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import { getPhotoUrl, createPhotoFromFile } from '../utils/photoUtils';

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

    const newPhotos = Array.from(files).map(file => {
      // Use the utility function to create a consistent photo object
      return createPhotoFromFile(file, {
        status: 'pending',
        uploadProgress: 0
      });
    });
    
    console.log('Adding new photos:', newPhotos.map(p => ({ 
      clientId: p.clientId, 
      id: p.id,
      name: p.name, 
      status: p.status 
    })));
    
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
      // Make sure we collect both clientId and id for proper tracking
      const clientIds = photosToUpload.map(p => p.clientId || p.id).filter(Boolean);
      
      if (!files.length) {
        setError('No valid files to upload');
        return { success: false, error: 'No valid files to upload' };
      }

      // Set uploading state
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => {
          // Match either clientId or id
          const photoClientId = photo.clientId || photo.id;
          return clientIds.includes(photoClientId) 
            ? { ...photo, status: 'uploading', uploadProgress: 0 }
            : photo;
        })
      );

      const result = await uploadPhotos(files, reportId, (progress) => {
        setUploadProgress(progress);
        // Update progress but don't change status here
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            const photoClientId = photo.clientId || photo.id;
            return clientIds.includes(photoClientId)
              ? { ...photo, uploadProgress: progress }
              : photo;
          })
        );
      });

      if (result.success) {
        const { photos: uploadedPhotos, idMapping } = result.data;
        
        // Log uploaded photos data for debugging
        console.log('Server returned uploaded photos:', 
          uploadedPhotos.map(p => ({id: p._id, status: 'uploaded'}))
        );
        console.log('ID mapping from server:', idMapping);
        
        // Single state update after successful upload
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            const photoClientId = photo.clientId || photo.id;
            if (!clientIds.includes(photoClientId)) return photo;
            
            const serverId = idMapping && photoClientId ? idMapping[photoClientId] : null;
            const serverPhoto = serverId && uploadedPhotos ? 
              uploadedPhotos.find(p => p._id === serverId) : null;
            
            if (!serverPhoto && uploadedPhotos && uploadedPhotos.length === 1 && clientIds.length === 1) {
              // Special case: if we have exactly one photo uploaded and one in our list
              // we can safely assume they match even without proper mapping
              return {
                ...photo,
                _id: uploadedPhotos[0]._id,
                status: 'uploaded',
                uploadProgress: 100,
                path: uploadedPhotos[0].path,
                contentType: uploadedPhotos[0].contentType,
                size: uploadedPhotos[0].size
              };
            }
            
            if (!serverPhoto && !serverId) {
              // If we don't have mapping or server photo, just mark as uploaded
              // This is a fallback in case server response format changes
              return {
                ...photo,
                status: 'uploaded',
                uploadProgress: 100
              };
            }

            if (!serverPhoto) return photo;

            return {
              ...photo,
              _id: serverId,
              status: 'uploaded',
              uploadProgress: 100,
              path: serverPhoto.path,
              contentType: serverPhoto.contentType,
              size: serverPhoto.size
            };
          })
        );
      } else {
        setPhotos(prevPhotos => 
          prevPhotos.map(photo => {
            const photoClientId = photo.clientId || photo.id;
            return clientIds.includes(photoClientId)
              ? { ...photo, status: 'error', uploadProgress: 0 }
              : photo;
          })
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
      return { success: false, error: 'Report ID is required' };
    }

    try {
      setIsAnalyzing(true);
      setError(null);

      // Get uploaded photos with valid server IDs
      const photosToAnalyze = photos.filter(photo => 
        (photo.status === 'uploaded' || photo.status === 'pending') && 
        photo._id?.match(/^[0-9a-f]{24}$/i)
      );

      console.log('Photos available for analysis:', 
        photos.map(p => ({
          id: p._id, 
          clientId: p.clientId || p.id,
          status: p.status, 
          isValid: p._id?.match(/^[0-9a-f]{24}$/i) ? true : false
        }))
      );

      if (!photosToAnalyze.length) {
        console.warn('No uploaded photos found with valid IDs for analysis');
        // Check if we have any photos with IDs that we can try to analyze anyway
        const anyPhotosWithIds = photos.filter(p => p._id);
        
        if (anyPhotosWithIds.length > 0) {
          console.log(`Attempting to analyze ${anyPhotosWithIds.length} photos with IDs despite status concerns`);
          // Try to analyze them anyway
          const photoIds = anyPhotosWithIds.map(p => p._id);
          
          // Set analyzing state for these photos
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
            return result;
          }
        }
        
        setError('No uploaded photos to analyze. Make sure to upload photos first.');
        return { success: false, error: 'No uploaded photos to analyze' };
      }

      const photoIds = photosToAnalyze.map(p => p._id);
      console.log(`Sending ${photoIds.length} photo IDs for analysis:`, photoIds);

      // Set analyzing state
      setPhotos(prevPhotos => 
        prevPhotos.map(photo => 
          photoIds.includes(photo._id)
            ? { ...photo, status: 'analyzing' }
            : photo
        )
      );

      const result = await analyzePhotosService(reportId, photoIds);
      console.log('Analysis service result:', result);

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
      
      return result;
    } catch (err) {
      console.error('Photo analysis error:', err);
      setError(err.message || 'Analysis failed');
      return { success: false, error: err.message };
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