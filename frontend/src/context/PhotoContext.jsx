import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { uploadPhotos, analyzePhotos as analyzePhotosService, deletePhoto } from '../services/photoService';
import { safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../utils/blobUrlManager';
import {
  createPhotoFromFile,
  updatePhotoWithServerData,
  updatePhotoWithAnalysis,
  extractPhotoIds,
  filterPhotosByStatus,
  getPhotoUrl,
  preservePhotoData,
  preserveBatchPhotoData,
  groupPhotosByDataAvailability,
  getBestDataSource
} from '../utils/photoUtils';

// Log which preservePhotoData we're using to debug the issue
console.log('PhotoContext is using preservePhotoData from:', preservePhotoData.toString().substring(0, 100));

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
  // Store a reference to the initialPhotos for comparison
  const initialPhotosRef = React.useRef(initialPhotos);
  
  // Main photo state - initialize with preserved data if provided
  const [photos, setPhotos] = useState(() => {
    if (initialPhotos?.length > 0) {
      // Store reference for comparison
      initialPhotosRef.current = initialPhotos;
      // Return preserved batch
      return preserveBatchPhotoData(initialPhotos);
    }
    return []; // Empty array if no initialPhotos
  });
  
  // Rest of your existing state declarations
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState(null);

  // Extract photo IDs for dependency arrays using our utility
  const photoIds = useMemo(() => {
    return extractPhotoIds(photos, { includeClientIds: true });
  }, [photos]);

  // Extract uploaded photo IDs for analysis using our utility
  const uploadedPhotoIds = useMemo(() => {
    return extractPhotoIds(filterPhotosByStatus(photos, 'uploaded'), { serverOnly: true });
  }, [photos]);

  // Update with new initialPhotos if they change
  useEffect(() => {
    if (!initialPhotos || initialPhotos.length === 0) return;
    
    if (initialPhotosRef.current === initialPhotos) {
      return;
    }
    
    initialPhotosRef.current = initialPhotos;
    
    setPhotos(prevPhotos => {
      if (prevPhotos && prevPhotos.length > 0) {
        return prevPhotos;
      }
      
      return preserveBatchPhotoData(initialPhotos);
    });
  }, [initialPhotos]);
  
  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      cleanupAllBlobUrls();
    };
  }, []);

  // Add new photos from files
  const addPhotosFromFiles = useCallback((files, reportId = null) => {
    if (!files || files.length === 0) return;

    // Create standardized photo objects using our utility
    const newPhotos = Array.from(files).map(file => {
      // Use the existing createPhotoFromFile which now handles blob creation
      return createPhotoFromFile(file);
    });

    // Add photos to state
    setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);

    // If report ID is provided, start uploading
    if (reportId) {
      uploadPhotosToServer(newPhotos, reportId);
    }

    return newPhotos;
  }, []);

  // Add photos directly (objects that follow our photo object structure)
  const addPhotos = useCallback((newPhotos) => {
    if (!newPhotos || !Array.isArray(newPhotos) || newPhotos.length === 0) return [];
    
    const processedPhotos = preserveBatchPhotoData(newPhotos);
    
    setPhotos(prevPhotos => [...prevPhotos, ...processedPhotos]);
    
    return processedPhotos;
  }, []);

  // Update existing photos
  const updatePhotos = useCallback((newPhotos) => {
    if (!newPhotos || !Array.isArray(newPhotos)) return;
    
    setPhotos(preserveBatchPhotoData(newPhotos));
  }, []);

  // Update a single photo by ID
  const updatePhoto = useCallback((photoId, updatedData) => {
    if (!photoId) return;
    
    setPhotos(prevPhotos => 
      prevPhotos.map(photo => {
        const id = photo._id || photo.id;
        if (id === photoId) {
          return preservePhotoData({
            ...photo,
            ...updatedData
          });
        }
        return photo;
      })
    );
  }, []);
  
  // Update photo upload progress for a specific photo
  const updatePhotoUploadProgress = useCallback((photoIdentifier, progress) => {
    setPhotos(prevPhotos => {
      return prevPhotos.map(photo => {
        // Match by ID, clientId, or name
        if (photo.id === photoIdentifier || 
            photo._id === photoIdentifier || 
            photo.clientId === photoIdentifier) {
          
          return preservePhotoData({
            ...photo, 
            uploadProgress: progress, 
            status: progress < 100 ? 'uploading' : 'uploaded'
          });
        }
        return photo;
      });
    });
  }, []);

  // Upload photos to server
  const uploadPhotosToServer = useCallback(async (photosToUpload, reportId) => {
    if (!reportId || !photosToUpload || photosToUpload.length === 0) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      // Get files to upload
      const files = photosToUpload.map(photo => photo.file).filter(Boolean);
      
      if (files.length === 0) {
        setError('No valid files to upload');
        setIsUploading(false);
        return;
      }
      
      // Upload the files
      const result = await uploadPhotos(
        files, 
        reportId, 
        (updatedPhotos, progress) => {
          // Update progress state
          setUploadProgress(progress);
          
          // Update individual photo progress
          if (Array.isArray(updatedPhotos)) {
            setPhotos(prevPhotos => {
              return prevPhotos.map(photo => {
                const matchingPhoto = updatedPhotos.find(
                  up => up.id === photo.id || up.clientId === photo.clientId
                );
                
                if (matchingPhoto) {
                  // When we reach 100%, make absolutely sure the status is 'uploaded'
                  if (progress >= 100) {
                    console.log(`Progress callback: Setting photo ${photo.id || photo.clientId} status to 'uploaded'`);
                    return {
                      ...photo,
                      uploadProgress: 100,
                      status: 'uploaded'
                    };
                  }
                  
                  return {
                    ...photo,
                    uploadProgress: progress,
                    status: progress < 100 ? 'uploading' : 'uploaded'
                  };
                }
                
                return photo;
              });
            });
          }
        }
      );

      if (result.success) {
        const { photos: uploadedPhotos, idMapping } = result.data;
        
        // Debug idMapping to see what's coming back from server
        console.log("Received from server:", { 
          uploadedPhotosCount: uploadedPhotos?.length,
          idMapping
        });
        
        // Check if server returns status field
        console.log("Server photo sample:", uploadedPhotos[0]);
        console.log("Does server photo have status field?", uploadedPhotos[0].hasOwnProperty('status'));
        
        // Debug client photos pre-update
        console.log("Client photo statuses pre-update:", photos.map(p => ({
          id: p._id || p.id || p.clientId,
          status: p.status
        })));
        
        // SIMPLIFIED APPROACH: Create a complete array of updated photos
        // that explicitly sets status to 'uploaded'
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            // Check if this photo's clientId is in the idMapping
            const serverPhotoId = idMapping && photo.clientId && idMapping[photo.clientId];
            
            // Find matching uploaded photo by id, _id, or through the idMapping
            const uploadedPhoto = uploadedPhotos.find(
              up => up.id === photo.id || 
                  up._id === photo._id ||
                  up._id === serverPhotoId
            );
            
            if (uploadedPhoto) {
              // Create updated photo with server data
              return {
                ...photo,
                ...uploadedPhoto,
                _id: uploadedPhoto._id,
                // Preserve client-side data
                file: photo.file,
                preview: photo.preview,
                // ALWAYS force status to be 'uploaded'
                status: 'uploaded',
                uploadProgress: 100
              };
            }
            
            return photo;
          });
        });
      } else {
        // Handle error
        setError(result.error || 'Failed to upload photos');
        
        // Mark photos as error
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            if (photosToUpload.some(p => p.id === photo.id || p._id === photo._id)) {
              return { ...photo, status: 'error' };
            }
            return photo;
          });
        });
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
      setError(error.message || 'Failed to upload photos');
      
      // Mark photos as error
      setPhotos(prevPhotos => {
        return prevPhotos.map(photo => {
          if (photosToUpload.some(p => p.id === photo.id || p._id === photo._id)) {
            return { ...photo, status: 'error' };
          }
          return photo;
        });
      });
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Analyze photos (either all uploaded photos or specified photos)
  const analyzePhotos = useCallback(async (reportId, photosToAnalyze = null) => {
    if (!reportId) {
      setError('Report ID is required for analysis');
      return;
    }
    
    // If no specific photos provided, use all uploaded photos
    let photosForAnalysis = photosToAnalyze;
    
    if (!photosForAnalysis) {
      const uploadedPhotos = filterPhotosByStatus(photos, 'uploaded');
      photosForAnalysis = uploadedPhotos.length > 0 ? uploadedPhotos : [];
    } else if (!Array.isArray(photosForAnalysis)) {
      // If a single photo or ID was provided, convert to array
      photosForAnalysis = [photosForAnalysis];
    }
    
    if (!photosForAnalysis || photosForAnalysis.length === 0) {
      setError('No photos to analyze');
      return;
    }
    
    try {
      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setError(null);
      
      // Start with initial progress
      setAnalysisProgress(10);
      
      // Log what photos we're analyzing for debugging
      console.log('Sending photo analysis request', {
        reportId,
        photoCount: photosForAnalysis.length,
        photoIds: photosForAnalysis.map(p => typeof p === 'string' ? p : p._id || p.id)
      });
      
      // Update photos status to 'analyzing'
      setPhotos(prevPhotos => {
        return prevPhotos.map(photo => {
          // Check if this photo is being analyzed
          const isBeingAnalyzed = photosForAnalysis.some(p => {
            if (typeof p === 'string') {
              return p === photo._id || p === photo.id;
            }
            return p._id === photo._id || p.id === photo.id;
          });
          
          if (isBeingAnalyzed) {
            return { ...photo, status: 'analyzing' };
          }
          
          return photo;
        });
      });
      
      // Call the service - this makes the API request to the backend
      const result = await analyzePhotosService(reportId, photosForAnalysis);
      
      // Update progress halfway
      setAnalysisProgress(50);
      
      if (result.success) {
        // Handle success
        setAnalysisProgress(75);
        
        console.log('Analysis successful:', result);
        
        // If we got individual results for each photo
        if (result.results && Array.isArray(result.results)) {
          setPhotos(prevPhotos => {
            return prevPhotos.map(photo => {
              // Find matching result by ID
              const photoId = photo._id || photo.id;
              const matchingResult = result.results.find(r => r.photoId === photoId);
              
              if (matchingResult && matchingResult.analysis) {
                // Use utility to update with analysis
                return updatePhotoWithAnalysis(photo, matchingResult.analysis);
              }
              
              return photo;
            });
          });
        } 
        // If we got a new array of analyzed photos
        else if (result.data && result.data.photos) {
          const analyzedPhotos = result.data.photos;
          
          setPhotos(prevPhotos => {
            return prevPhotos.map(photo => {
              // Find matching analyzed photo
              const analyzedPhoto = analyzedPhotos.find(
                ap => ap._id === photo._id || ap.id === photo.id
              );
              
              if (analyzedPhoto && analyzedPhoto.analysis) {
                // Use preservePhotoData to ensure we don't lose file data
                return preservePhotoData({
                  ...photo,
                  ...analyzedPhoto,
                  status: 'analyzed'
                });
              }
              
              return photo;
            });
          });
        }
        
        // Complete progress
        setAnalysisProgress(100);
      } else {
        // Handle error
        setError(result.error || 'Failed to analyze photos');
        console.error('Analysis failed:', result.error);
        
        // Mark photos as error
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            const photoId = typeof photo === 'string' ? photo : photo._id || photo.id;
            const photoIds = photosForAnalysis.map(p => 
              typeof p === 'string' ? p : p._id || p.id
            );
            
            if (photoIds.includes(photoId)) {
              return { ...photo, status: 'error' };
            }
            
            return photo;
          });
        });
      }
    } catch (error) {
      console.error('Error during analysis:', error);
      setError(error.message || 'Failed to analyze photos');
      
      // Mark photos as error
      setPhotos(prevPhotos => {
        return prevPhotos.map(photo => {
          const photoId = typeof photo === 'string' ? photo : photo._id || photo.id;
          const photoIds = photosForAnalysis.map(p => 
            typeof p === 'string' ? p : p._id || p.id
          );
          
          if (photoIds.includes(photoId)) {
            return { ...photo, status: 'error' };
          }
          
          return photo;
        });
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [photos]);

  // Remove a photo
  const removePhoto = useCallback((photoToRemove) => {
    if (!photoToRemove) return;
    
    setPhotos(prevPhotos => {
      // Handle when photoToRemove is a string ID
      if (typeof photoToRemove === 'string') {
        return prevPhotos.filter(photo => {
          const shouldKeep = photo._id !== photoToRemove && 
                            photo.id !== photoToRemove && 
                            photo.clientId !== photoToRemove;
          
          // If removing, cleanup any blob URLs
          if (!shouldKeep && photo.preview && photo.preview.startsWith('blob:')) {
            safelyRevokeBlobUrl(photo.preview);
          }
          
          return shouldKeep;
        });
      }
      
      // Handle when photoToRemove is an object
      return prevPhotos.filter(photo => {
        const photoId = photoToRemove._id || photoToRemove.id || photoToRemove.clientId;
        const shouldKeep = photo._id !== photoId && 
                           photo.id !== photoId && 
                           photo.clientId !== photoId;
        
        // If removing, cleanup any blob URLs
        if (!shouldKeep && photo.preview && photo.preview.startsWith('blob:')) {
          safelyRevokeBlobUrl(photo.preview);
        }
        
        return shouldKeep;
      });
    });
  }, []);

  // Clear all photos
  const clearPhotos = useCallback(() => {
    // Cleanup blob URLs before clearing
    photos.forEach(photo => {
      if (photo && photo.preview && photo.preview.startsWith('blob:')) {
        safelyRevokeBlobUrl(photo.preview);
      }
    });
    
    setPhotos([]);
    setUploadProgress(0);
    setAnalysisProgress(0);
    setIsUploading(false);
    setIsAnalyzing(false);
    setError(null);
  }, []); // No dependency on photos to avoid causing rerenders

  // Get best data source for a photo
  const getBestPhotoDataSource = useCallback((photo) => {
    return getBestDataSource(photo);
  }, []);

  // Get URL for a photo
  const getPhotoUrlFromContext = useCallback((photo, options = {}) => {
    return getPhotoUrl(photo, options);
  }, []);
  
  // Group photos by data availability
  const groupPhotosByAvailability = useCallback((photosToGroup = photos) => {
    return groupPhotosByDataAvailability(photosToGroup);
  }, [photos]);

  // Filter photos by status
  const getPhotosByStatus = useCallback((status) => {
    return filterPhotosByStatus(photos, status);
  }, [photos]);

  // Monitor photo status changes
  useEffect(() => {
    // Count photos by status
    const statusCounts = {};
    photos.forEach(p => {
      statusCounts[p.status || 'unknown'] = (statusCounts[p.status || 'unknown'] || 0) + 1;
    });
    
    // Log when we have uploads
    if (statusCounts.uploaded > 0) {
      console.log("DETECTED STATUS CHANGE: Now have", statusCounts.uploaded, "uploaded photos");
    }
  }, [photos]);

  // Context value
  const value = {
    // State
    photos,
    isUploading,
    uploadProgress,
    isAnalyzing,
    analysisProgress,
    error,
    
    // Photo management
    addPhotosFromFiles,
    addPhotos,
    updatePhotos,
    updatePhoto,
    removePhoto,
    clearPhotos,
    
    // Upload functions
    uploadPhotosToServer,
    updatePhotoUploadProgress,
    
    // Analysis
    analyzePhotos,
    
    // Filtering and data access
    getPhotosByStatus,
    groupPhotosByAvailability,
    getBestPhotoDataSource,
    getPhotoUrl: getPhotoUrlFromContext,
    
    // Error handling
    setError,
  };
  
  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
};

export default PhotoContext; 