import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadBatchPhotos, analyzePhotos, getPhotoUrl } from '../../services/photoService';

// Helper function to extract the filename from a file object
const extractFilename = (file) => {
  if (file.name) return file.name;
  if (file.originalname) return file.originalname;
  if (file.path) return file.path.split('/').pop();
  if (file.relativePath) return file.relativePath.split('/').pop();
  if (file.handle && file.handle.name) return file.handle.name;
  return 'unknown-file';
};

const PhotoUploader = ({ 
  onUploadComplete, 
  initialPhotos = [], 
  showUploadControls = true,
  reportId = null
}) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Track image loading attempts to prevent infinite retries
  const imageRetryCounters = useRef({});
  
  // Track active blob URLs to prevent premature revocation
  const activeBlobUrls = useRef(new Set());
  
  // Store temporary URLs to avoid creating them during render
  const tempUrlCache = useRef(new Map());

  // Helper to check if a blob URL is valid
  const isBlobUrlValid = (url) => {
    if (!url || !url.startsWith('blob:')) return false;
    
    // Check if the URL is in our active set
    return activeBlobUrls.current.has(url);
  };

  // Helper to safely create blob URLs
  const createAndTrackBlobUrl = (file) => {
    if (!file) return null;
    
    // Check if we already have a URL for this file
    const fileId = file.name || file.path || Math.random().toString();
    if (tempUrlCache.current.has(fileId)) {
      return tempUrlCache.current.get(fileId);
    }
    
    try {
      const url = URL.createObjectURL(file);
      activeBlobUrls.current.add(url);
      tempUrlCache.current.set(fileId, url);
      return url;
    } catch (e) {
      console.error('Failed to create blob URL:', e);
      return null;
    }
  };

  // Helper to safely revoke blob URLs
  const safelyRevokeBlobUrl = (url) => {
    if (url && url.startsWith('blob:') && activeBlobUrls.current.has(url)) {
      try {
        URL.revokeObjectURL(url);
        activeBlobUrls.current.delete(url);
      } catch (e) {
        console.warn('Failed to revoke blob URL:', e);
      }
    }
  };

  // Initialize with any provided photos
  useEffect(() => {
    if (initialPhotos.length > 0) {
      // Ensure all initial photos have the necessary properties
      const processedPhotos = initialPhotos.map(photo => {
        // Create a new object instead of modifying the original
        const processedPhoto = { ...photo };
        
        // If the photo doesn't have a proper ID, generate one
        if (!processedPhoto.id) {
          processedPhoto.id = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        
        // Store the filename in a separate property instead of modifying name
        if (!processedPhoto.displayName) {
          if (processedPhoto.name) {
            processedPhoto.displayName = processedPhoto.name;
          } else if (processedPhoto.handle && processedPhoto.handle.name) {
            processedPhoto.displayName = processedPhoto.handle.name;
          } else if (processedPhoto.path) {
            processedPhoto.displayName = processedPhoto.path.split('/').pop();
          } else if (processedPhoto.relativePath) {
            processedPhoto.displayName = processedPhoto.relativePath.split('/').pop();
          } else if (processedPhoto.filename) {
            processedPhoto.displayName = processedPhoto.filename;
          }
        }
        
        return processedPhoto;
      });
      
      setFiles(processedPhotos);
    }
  }, [initialPhotos]);

  // Use useEffect to notify parent of changes to files
  useEffect(() => {
    // Only notify parent if files have been initialized
    if (files.length > 0 && onUploadComplete) {
      onUploadComplete(files);
    }
  }, [files, onUploadComplete]);

  // Prepare image URLs in advance to avoid creating them during render
  useEffect(() => {
    // Pre-create and cache blob URLs for all files that need them
    files.forEach(file => {
      if (file.originalFile && !file.preview && !tempUrlCache.current.has(file.originalFile.name || file.id)) {
        const url = createAndTrackBlobUrl(file.originalFile);
        if (url) {
          // Update the file with the preview URL without triggering a full state update
          file.preview = url;
        }
      }
    });
  }, [files]);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!showUploadControls) return; // Don't allow new files if in analyze-only mode
    
    // Add preview to each file
    const newFiles = acceptedFiles.map(file => {
      // First check if we already have a URL for this file
      const fileId = file.name || file.path || Math.random().toString();
      let previewUrl = null;
      
      if (tempUrlCache.current.has(fileId)) {
        previewUrl = tempUrlCache.current.get(fileId);
      } else {
        // Only create a new blob URL if we don't have one cached
        previewUrl = createAndTrackBlobUrl(file);
      }
      
      // Generate a client ID for reliable tracking
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Create a new object with the file properties we need
      return {
        // Original file reference
        originalFile: file,
        // Use a client ID for reliable tracking
        id: clientId,
        clientId: clientId, // Store the client ID explicitly
        // Use the cached or newly created blob URL
        preview: previewUrl,
        // Set initial status
        status: 'pending', // Mark as pending until uploaded to server
        analysis: null,
        // Store the name in a separate property
        displayName: file.name || extractFilename(file)
      };
    });
    
    // Add new files to state
    const updatedFiles = [...files, ...newFiles];
    setFiles(updatedFiles);
    
    // If reportId is available, upload to server
    if (reportId && newFiles.length > 0) {
      await uploadFilesToServer(newFiles);
    }
  }, [files, reportId, showUploadControls]);

  // Separate function to upload files to server when reportId is available
  const uploadFilesToServer = async (filesToUpload) => {
    setUploading(true);
    setError(null);
    setUploadProgress(0);
    
    try {
      // Get original file objects
      const originalFiles = filesToUpload.map(file => file.originalFile);
      
      // Prepare metadata with client IDs
      const fileMetadata = filesToUpload.map(file => ({
        clientId: file.clientId
      }));
      
      // Update files to 'uploading' status but preserve all other properties
      setFiles(prev => prev.map(file => {
        if (filesToUpload.some(newFile => newFile.id === file.id)) {
          return {
            ...file,
            status: 'uploading'
          };
        }
        return file;
      }));
      
      // Upload files in batch with client IDs
      const response = await uploadBatchPhotos(
        originalFiles, 
        reportId,
        (progress) => {
          setUploadProgress(progress);
        },
        fileMetadata // Pass the metadata with client IDs
      );
      
      if (!response.success) {
        throw new Error(response.error || 'Upload failed');
      }
      
      console.log('Upload response:', response);
      
      // Check if we have photos in the response
      if (!response.photos || !Array.isArray(response.photos) || response.photos.length === 0) {
        console.error('No photos returned in upload response:', response);
        throw new Error('Server did not return photo information');
      }
      
      // Log the ID mapping for debugging
      console.log('Client ID to Server ID mapping:', response.idMapping);
      
      // Update the status of uploaded files but KEEP the preview URLs
      setFiles(prev => {
        const updatedFiles = prev.map(file => {
          // Check if this file was part of the uploaded batch
          if (filesToUpload.some(newFile => newFile.id === file.id)) {
            // Use the ID mapping to find the corresponding server file
            const serverId = response.idMapping[file.clientId];
            const serverFile = serverId ? 
              response.photos.find(photo => photo._id === serverId) : 
              null;
            
            if (serverFile) {
              console.log(`Matched file ${file.displayName} with server ID ${serverId}`);
              
              // Return updated file with server data but keep the preview URL
              return {
                ...file,
                status: 'complete',
                // Store the MongoDB ID - CRITICAL for analysis
                _id: serverFile._id,
                // Also set the id field to the MongoDB ID for consistency
                id: serverFile._id,
                // Store the fileId if available
                fileId: serverFile.fileId || serverFile._id,
                // Store the filename
                filename: serverFile.filename,
                // Store the original name
                originalName: serverFile.originalName,
                // ALWAYS keep the preview URL
                preview: file.preview,
                // Store the displayName
                displayName: file.displayName || serverFile.originalName || serverFile.filename,
                // Store the section if available
                section: serverFile.section || file.section || 'Uncategorized',
                // Store the path
                path: serverFile.path
              };
            } else {
              // If we couldn't find a matching server file, mark as error
              console.warn(`No server file found for client ID ${file.clientId}`);
              return {
                ...file,
                status: 'error',
                error: 'File was uploaded but server did not return matching ID'
              };
            }
          }
          return file;
        });
        
        return updatedFiles;
      });
      
      // Call onUploadComplete with the updated files
      if (onUploadComplete) {
        // Get the current updated files with server IDs
        const currentFiles = [...files];
        
        // Find and update files with server data
        currentFiles.forEach((file, index) => {
          // Check if this file was part of the uploaded batch
          if (filesToUpload.some(newFile => newFile.id === file.id)) {
            // Use the ID mapping to find the corresponding server file
            const serverId = response.idMapping[file.clientId];
            const serverFile = serverId ? 
              response.photos.find(photo => photo._id === serverId) : 
              null;
            
            if (serverFile) {
              currentFiles[index] = {
                ...file,
                status: 'complete',
                _id: serverFile._id,
                id: serverFile._id, // Update the ID to match MongoDB ID
                fileId: serverFile.fileId || serverFile._id,
                filename: serverFile.filename,
                originalName: serverFile.originalName,
                preview: file.preview,
                displayName: file.displayName || serverFile.originalName || serverFile.filename,
                section: serverFile.section || file.section || 'Uncategorized',
                path: serverFile.path
              };
            }
          }
        });
        
        // Add debugging to see what's being passed to the parent
        console.log('Calling onUploadComplete with files:', currentFiles);
        
        // Call onUploadComplete with the updated files
        onUploadComplete(currentFiles);
      }
    } catch (err) {
      console.error('Upload failed:', err.message);
      setError(err.message || 'Failed to upload photos');
      
      // Update status of failed files but keep the preview URLs
      setFiles(prev => {
        const updatedFiles = prev.map(file => {
          if (filesToUpload.some(newFile => newFile.id === file.id)) {
            return {
              ...file,
              status: 'error',
              error: err.message || 'Upload failed'
            };
          }
          return file;
        });
        
        return updatedFiles;
      });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/heic': [],
    },
    maxSize: 10485760, // 10MB
    disabled: !showUploadControls // Disable dropzone in analyze-only mode
  });

  // Function to analyze all uploaded photos using AI
  const analyzeAllPhotos = async () => {
    if (files.length === 0 || analyzing || !reportId) return;
    
    try {
      // First, check if we have any photos with valid MongoDB ObjectIDs
      const photosWithValidIds = files.filter(file => 
        file.status === 'complete' && 
        !file.analysis && 
        file._id && 
        typeof file._id === 'string' && 
        /^[0-9a-fA-F]{24}$/.test(file._id)
      );
      
      if (photosWithValidIds.length === 0) {
        throw new Error('No valid MongoDB ObjectIDs found in the photos. Make sure photos are properly uploaded first.');
      }
      
      setAnalyzing(true);
      setError(null);
      setAnalysisProgress(0);
      
      // Update status of all files to analyzing, but only those with valid IDs
      setFiles(prev => {
        const updatedFiles = prev.map(file => {
          if (file.status === 'complete' && !file.analysis && file._id && typeof file._id === 'string' && /^[0-9a-fA-F]{24}$/.test(file._id)) {
            return {
              ...file,
              status: 'analyzing',
            };
          }
          return file;
        });
        return updatedFiles;
      });
      
      // Call the analyze endpoint with the report ID
      const response = await analyzePhotos(reportId);
      
      if (!response.success) {
        throw new Error(response.error || 'Analysis failed');
      }
      
      // Update the files with analysis results
      setFiles(prev => {
        const updatedFiles = prev.map(file => {
          if (response.results && response.results.length > 0) {
            const result = response.results.find(r => r.photoId === file._id?.toString());
            if (result) {
              return {
                ...file,
                status: 'complete',
                analysis: result.analysis,
              };
            }
          }
          return file;
        });
        
        return updatedFiles;
      });
      
      console.log(`AI analysis completed for ${response.results?.length || 0} photos`);
    } catch (err) {
      console.error('Overall analysis error:', err);
      setError(err.message || 'Photo analysis failed. Please try again.');
      
      // Reset status of files that were being analyzed
      setFiles(prev => {
        const updatedFiles = prev.map(file => {
          if (file.status === 'analyzing') {
            return {
              ...file,
              status: 'complete',
            };
          }
          return file;
        });
        return updatedFiles;
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRemoveFile = (id) => {
    if (!showUploadControls) return; // Don't allow file removal in analyze-only mode
    
    // Find the file to remove without modifying the state yet
    const fileToRemove = files.find(file => file.id === id);
    if (!fileToRemove) return;
    
    // Create a new array without the removed file
    const newFiles = files.filter(file => file.id !== id);
    
    // Update the state first
    setFiles(newFiles);
    
    // Only after the state is updated, clean up resources
    // This ensures we don't revoke URLs that might still be in use
    setTimeout(() => {
      // If the file has been uploaded to the server, log it
      if (fileToRemove._id) {
        console.log(`File ${fileToRemove._id} should be deleted from the server`);
      }
      
      // Only revoke the blob URL if we're sure it's not needed anymore
      if (fileToRemove.preview && fileToRemove.preview.startsWith('blob:')) {
        console.log('Revoking blob URL for removed file:', fileToRemove.preview);
        safelyRevokeBlobUrl(fileToRemove.preview);
      }
    }, 500); // Small delay to ensure the state update has completed
  };

  const updatePhotoAnalysis = (photoId, updatedAnalysis) => {
    setFiles(prev => 
      prev.map(file => 
        file.id === photoId 
          ? { ...file, analysis: updatedAnalysis } 
          : file
      )
    );
  };

  // Clean up all created object URLs on unmount ONLY
  useEffect(() => {
    // This effect should only run on unmount
    return () => {
      // We'll only clean up when the component is fully unmounted
      activeBlobUrls.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn('Failed to revoke blob URL during cleanup:', e);
        }
      });
      activeBlobUrls.current.clear();
      tempUrlCache.current.clear();
    };
  }, []); // Empty dependency array means this only runs on mount/unmount

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}
      
      {/* Dropzone for file uploads */}
      {showUploadControls && (
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <div className="space-y-2">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-gray-600">
              {isDragActive ? 'Drop the files here...' : 'Drag & drop photos here, or click to select files'}
            </p>
            <p className="text-sm text-gray-500">
              Supported formats: JPG, PNG, HEIC (Max 10MB per file)
            </p>
          </div>
        </div>
      )}
      
      {/* Upload progress */}
      {uploading && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Uploading photos... {uploadProgress}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {/* Analysis progress */}
      {analyzing && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Analyzing photos... {analysisProgress}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-green-600 h-2.5 rounded-full" 
              style={{ width: `${analysisProgress}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {/* Analyze button */}
      {files.length > 0 && !analyzing && (
        <div className="mt-4">
          {files.some(file => file.status === 'complete' && !file.analysis && file._id && typeof file._id === 'string' && /^[0-9a-fA-F]{24}$/.test(file._id)) ? (
            <button
              type="button"
              onClick={analyzeAllPhotos}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={analyzing}
            >
              Analyze Photos with AI
            </button>
          ) : (
            files.some(file => file.status === 'pending' || file.status === 'uploading') ? (
              <p className="text-sm text-amber-600">Please wait for photos to finish uploading before analysis.</p>
            ) : (
              files.some(file => !file._id || typeof file._id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(file._id)) && (
                <p className="text-sm text-amber-600">Photos must be uploaded to the server before they can be analyzed.</p>
              )
            )
          )}
        </div>
      )}
      
      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4">
          <h4 className="text-lg font-medium mb-2">Uploaded Photos ({files.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {files.map((file) => (
              <div key={file.id} className="relative">
                <div className="relative pb-[100%] overflow-hidden rounded-lg border border-gray-200">
                  <img
                    src={file.preview && isBlobUrlValid(file.preview) 
                      ? file.preview 
                      : file._id 
                        ? `/api/photos/${file._id}?size=thumbnail` 
                        : '/placeholder-image.png'}
                    alt={file.displayName || 'Uploaded photo'}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      // Track error count to prevent infinite retries
                      const imgId = file.id || file._id;
                      if (!imgId) {
                        e.target.src = `/placeholder-image.png`;
                        return;
                      }
                      
                      // Initialize retry counter if needed
                      if (!imageRetryCounters.current[imgId]) {
                        imageRetryCounters.current[imgId] = 0;
                      }
                      
                      // Increment retry counter
                      imageRetryCounters.current[imgId]++;
                      
                      // Only retry a few times to avoid infinite loops
                      if (imageRetryCounters.current[imgId] <= 2) {
                        // Try different fallback strategies
                        if (file._id && !e.target.src.includes('size=original')) {
                          // Try with original size
                          e.target.src = `/api/photos/${file._id}?size=original`;
                        } else if (file.originalFile) {
                          // If we have the original file, try recreating the blob URL
                          try {
                            // Revoke old URL if it exists and is invalid
                            if (file.preview && !isBlobUrlValid(file.preview)) {
                              safelyRevokeBlobUrl(file.preview);
                            }
                            
                            // Don't update state here - just set the src directly
                            // Check cache first before creating a new URL
                            const cachedUrl = tempUrlCache.current.get(file.originalFile.name || file.id);
                            if (cachedUrl) {
                              e.target.src = cachedUrl;
                            } else {
                              const newUrl = createAndTrackBlobUrl(file.originalFile);
                              if (newUrl) {
                                e.target.src = newUrl;
                              } else {
                                e.target.src = `/placeholder-image.png`;
                              }
                            }
                            return;
                          } catch (err) {
                            console.error('Failed to recreate blob URL:', err);
                          }
                        }
                        
                        // Default fallback
                        e.target.src = `/placeholder-image.png`;
                      } else {
                        // Too many retries, use placeholder
                        e.target.src = `/placeholder-image.png`;
                      }
                    }}
                  />
                  
                  {/* Status indicator */}
                  <div className="absolute top-2 right-2">
                    {file.status === 'pending' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Pending
                      </span>
                    )}
                    {file.status === 'uploading' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Uploading
                      </span>
                    )}
                    {file.status === 'analyzing' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Analyzing
                      </span>
                    )}
                    {file.status === 'complete' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Complete
                      </span>
                    )}
                    {file.status === 'error' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Error
                      </span>
                    )}
                  </div>
                </div>
                
                {/* File name */}
                <p className="mt-1 text-sm text-gray-500 truncate">
                  {file.displayName || 'Unnamed photo'}
                </p>
                
                {/* Remove button */}
                {showUploadControls && (
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.id)}
                    className="absolute top-2 left-2 bg-white rounded-full p-1 shadow-sm hover:bg-red-100"
                  >
                    <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                
                {/* Analysis indicator */}
                {file.analysis && (
                  <div className="absolute bottom-2 right-2 bg-white rounded-full p-1 shadow-sm">
                    <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoUploader; 