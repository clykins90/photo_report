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

    upload: useCallback(async (reportId) => {
      if (!reportId) {
        setStatus({ type: 'error', error: 'No report ID provided' });
        return false;
      }

      // Identify photos to upload *before* the async operation
      const pendingPhotos = photosRef.current.filter(PhotoSchema.helpers.canUpload);
      const clientIdsToUpload = pendingPhotos.map(p => p.clientId); // <-- STORE THE IDs

      // If no photos to upload, exit early
      if (!pendingPhotos.length) {
        setStatus({ type: null });
        return true;
      }

      try {
        setStatus({ type: 'uploading', progress: 0 });
        // Log the files we're sending to ensure they have clientIds
        console.log('Files to upload:', pendingPhotos.map(p => ({
          name: p.originalName,
          clientId: p.clientId,
          hasFile: !!p.file,
          fileClientId: p.file?.clientId
        })));

        const result = await uploadPhotos(
          pendingPhotos.map(p => p.file), // Use the actual pendingPhotos objects here
          reportId,
          progress => setStatus(prev => ({ ...prev, progress }))
        );

        if (result.success) {
          // Debug the server response once
          console.log('Server response data:', result.data);
          
          // Ensure idMapping and photos array exist
          const idMapping = result.data?.idMapping;
          const serverPhotos = result.data?.photos || [];

          if (!idMapping) {
            console.error("Upload successful, but server response is missing the crucial 'idMapping'. State update cannot proceed reliably.");
            // Optionally set an error state or just return without updating status
            setStatus({ type: 'error', error: 'Server response missing idMapping.' });
            return false; // Indicate failure due to missing mapping
          }
          
          // Create a map of server photos keyed by their _id for efficient lookup
          const serverPhotoMapById = serverPhotos.reduce((map, sp) => {
            if (sp && sp._id) {
              map[sp._id] = sp;
            }
            return map;
          }, {});
          
          // Process the response in a single transaction to avoid multiple updates
          setPhotos(prev => {
            // Update client photos with server data in a single pass using idMapping
            const updated = prev.map(photo => {
              // Skip photos that weren't part of this upload batch
              // Check against the originally identified client IDs
              if (!clientIdsToUpload.includes(photo.clientId)) {
                return photo;
              }
              
              // Find the server ID using the mapping
              const mappedServerId = idMapping[photo.clientId];
              
              if (mappedServerId) {
                // Find the corresponding full server photo data using the mapped ID
                const serverPhoto = serverPhotoMapById[mappedServerId];
                
                if (serverPhoto) {
                  // Found a match via idMapping
                  console.log(`Matched via idMapping: Client ID ${photo.clientId} -> Server ID ${serverPhoto._id}`);
                  // Use the schema method to deserialize and merge, preserving client data
                  return PhotoSchema.deserializeFromApi(serverPhoto, photo);
                } else {
                  // ID was in mapping, but corresponding photo data not found in response array
                  console.warn(`Mapped Server ID ${mappedServerId} for Client ID ${photo.clientId} not found in server photos array.`);
                  // Set status to error as the server claimed success but data is missing
                  return { ...photo, status: 'error', error: 'Server mapping inconsistent' };
                }
              } else {
                // No mapping found for this client photo's ID
                // This implies the photo wasn't successfully processed or mapped by the server
                console.warn(`No ID mapping found for Client ID ${photo.clientId}. Marking as error.`);
                 // Set status to error as it was expected to be uploaded but wasn't mapped
                 return { ...photo, status: 'error', error: 'Upload failed on server (no mapping)' };
              }
            });
            
            return updated;
          });
          
          setStatus({ type: null });
          return true;
        }
        // If result.success is false, throw the error provided by the service
        throw new Error(result.error || 'Unknown upload error');
      } catch (err) {
        console.error("Upload failed:", err); // Log the actual error
        setStatus({ type: 'error', error: err.message || 'Upload failed' });

        // Use the originally captured clientIdsToUpload list to mark failures
        setPhotos(prev =>
          prev.map(photo =>
            clientIdsToUpload.includes(photo.clientId)
              ? { ...photo, status: 'error', error: err.message || 'Upload failed', uploadProgress: 0 }
              : photo
          )
        );

        return false;
      }
    }, []), // Removed photos from dependency array, using photosRef.current instead

    analyze: useCallback(async (reportId) => {
      if (!reportId) {
        setStatus({ type: 'error', error: 'No report ID provided' });
        return false;
      }

      // Identify photos to analyze *before* the async operation
      const photosToAnalyze = photosRef.current.filter(PhotoSchema.helpers.canAnalyze);
      const photoIdsToAnalyze = photosToAnalyze.map(p => p._id); // <-- STORE THE IDs

      // If no photos to analyze, exit early
      if (!photosToAnalyze.length) {
        setStatus({ type: null });
        return true;
      }

      try {
        setStatus({ type: 'analyzing' });

        // Pass only the photo IDs to the service
        const result = await analyzePhotosService(reportId, photoIdsToAnalyze); // Pass the IDs

        if (result.success && result.data?.photos) {
          // Create a map of analyzed photos keyed by their _id for efficient lookup
          const analyzedPhotoMap = result.data.photos.reduce((map, ap) => {
            if (ap && ap._id) {
              map[ap._id] = ap;
            }
            return map;
          }, {});

          setPhotos(prev => prev.map(photo => {
            // Check if this photo was part of the analysis batch and has analysis data
            const analyzedData = photoIdsToAnalyze.includes(photo._id) ? analyzedPhotoMap[photo._id] : null;

            if (analyzedData) {
              // Found analysis data for this photo
              const updatedPhoto = PhotoSchema.deserializeFromApi(analyzedData, photo);
              console.log('Updated photo with analysis:', updatedPhoto);
              return updatedPhoto; // Includes status update from deserializeFromApi
            } else if (photoIdsToAnalyze.includes(photo._id)) {
              // Was part of the batch, but no analysis data returned (treat as error or just leave status?)
              // Let's mark it as error for clarity
              console.warn(`Analysis data missing for photo ID ${photo._id}`);
              return { ...photo, status: 'error', error: 'Analysis data not returned' };
            }
            // If not part of the batch, return the photo unchanged
            return photo;
          }));

          setStatus({ type: null });
          return true;
        }
        // If result.success is false or data is missing, throw error
        throw new Error(result.error || 'Unknown analysis error');
      } catch (err) {
        console.error("Analysis failed:", err); // Log the actual error
        setStatus({ type: 'error', error: err.message || 'Analysis failed' });

        // Use the originally captured photoIdsToAnalyze list to mark failures
        setPhotos(prev =>
          prev.map(photo =>
            photoIdsToAnalyze.includes(photo._id)
              ? { ...photo, status: 'error', error: err.message || 'Analysis failed' }
              : photo
          )
        );

        return false;
      }
    }, []), // Removed photos from dependency array, using photosRef.current instead

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
    // forceUpdateStatus: photoOperations.forceUpdateStatus // Remove export if function is removed
  };
  
  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 