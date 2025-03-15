import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadBatchPhotos, analyzePhotos, getPhotoUrl } from '../../services/photoService';
import useUploadManager from '../../hooks/useUploadManager';
import { isBlobUrlValid, createAndTrackBlobUrl, safelyRevokeBlobUrl, cleanupAllBlobUrls } from '../../utils/blobUrlManager';
import { isValidObjectId, filterPhotosWithValidIds } from '../../utils/mongoUtil';

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
  
  // Initialize the upload manager
  const uploadManager = useUploadManager({
    maxConcurrentUploads: 3,
    chunkSize: 500 * 1024, // 500KB chunks
    concurrentChunks: 3,
    autoStart: false // We'll start manually after preparing the files
  });

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      cleanupAllBlobUrls();
    };
  }, []);
  
  // Initialize with any photos passed in
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) {
      setFiles(initialPhotos.map(photo => ({
        id: photo._id || photo.id || `photo_${Math.random().toString(36).substring(2, 9)}`,
        name: photo.filename || extractFilename(photo),
        size: photo.size || 0,
        type: photo.contentType || photo.type || 'image/jpeg',
        preview: getPhotoUrl(photo._id || photo.id, 'thumbnail'),
        status: 'uploaded',
        progress: 100,
        analysis: photo.analysis || null,
        originalFile: photo,
        clientId: photo.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      })));
    }
  }, [initialPhotos]);
  
  // Auto-upload when reportId becomes available
  useEffect(() => {
    if (reportId && files.length > 0 && showUploadControls) {
      const pendingFiles = files.filter(file => file.status === 'pending');
      
      if (pendingFiles.length > 0) {
        uploadFilesToServer(pendingFiles);
      }
    }
  }, [files, reportId, showUploadControls]);

  // Handle file drops
  const onDrop = useCallback(async (acceptedFiles) => {
    if (!showUploadControls) return; // Don't allow new files if in analyze-only mode
    
    // Add preview to each file
    const newFiles = acceptedFiles.map(file => {
      // Generate a client ID for reliable tracking
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Create a preview URL
      const previewUrl = createAndTrackBlobUrl(file);
      
      // Create a new object with the file properties we need
      return {
        id: clientId,
        name: file.name || extractFilename(file),
        size: file.size,
        type: file.type,
        preview: previewUrl,
        status: 'pending', // Mark as pending until uploaded to server
        progress: 0,
        analysis: null,
        originalFile: file,
        clientId: clientId
      };
    });
    
    // Add new files to state
    setFiles(prev => [...prev, ...newFiles]);
    
    // If reportId is available, upload to server
    if (reportId && newFiles.length > 0) {
      await uploadFilesToServer(newFiles);
    }
  }, [reportId, showUploadControls]);

  // Separate function to upload files to server when reportId is available
  const uploadFilesToServer = async (filesToUpload) => {
    setUploading(true);
    setError(null);
    setUploadProgress(0);
    
    try {
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
      
      // Prepare metadata with client IDs
      const fileMetadata = filesToUpload.map(file => ({
        clientId: file.clientId
      }));
      
      // Add files to the upload manager queue
      uploadManager.addToQueue(
        filesToUpload.map(file => file.originalFile),
        reportId,
        fileMetadata
      );
      
      // Start the upload process
      uploadManager.processQueue();
      
      // Set up a progress tracking interval
      const progressInterval = setInterval(() => {
        const overallProgress = uploadManager.getOverallProgress();
        setUploadProgress(overallProgress);
        
        // Check if all uploads are complete
        if (overallProgress === 100 && 
            uploadManager.queue.length === 0 && 
            uploadManager.activeUploads.length === 0) {
          clearInterval(progressInterval);
          
          // Process completed uploads
          const completedUploads = uploadManager.completed;
          if (completedUploads.length > 0) {
            // Update file statuses based on completed uploads
            setFiles(prev => prev.map(file => {
              const completedUpload = completedUploads.find(
                upload => upload.clientId === file.clientId
              );
              
              if (completedUpload) {
                return {
                  ...file,
                  status: 'uploaded',
                  progress: 100,
                  // Update with server data if available
                  ...(completedUpload.result?.photo ? {
                    id: completedUpload.result.photo._id,
                    serverId: completedUpload.result.photo._id,
                    analysis: completedUpload.result.photo.analysis || null
                  } : {})
                };
              }
              return file;
            }));
            
            // Collect all uploaded photos for the callback
            const uploadedPhotos = completedUploads
              .filter(upload => upload.result?.photo)
              .map(upload => upload.result.photo);
            
            // Call the completion callback with the uploaded photos
            if (onUploadComplete && uploadedPhotos.length > 0) {
              onUploadComplete(uploadedPhotos);
            }
          }
          
          // Handle any failed uploads
          const failedUploads = uploadManager.failed;
          if (failedUploads.length > 0) {
            // Update file statuses for failed uploads
            setFiles(prev => prev.map(file => {
              const failedUpload = failedUploads.find(
                upload => upload.clientId === file.clientId
              );
              
              if (failedUpload) {
                return {
                  ...file,
                  status: 'error',
                  error: failedUpload.error || 'Upload failed'
                };
              }
              return file;
            }));
            
            // Set an error message if any uploads failed
            setError(`Failed to upload ${failedUploads.length} file(s). Please try again.`);
          }
          
          setUploading(false);
        }
      }, 500);
      
      // Clean up interval on component unmount
      return () => clearInterval(progressInterval);
      
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload files');
      setUploading(false);
      
      // Update status of files that were being uploaded
      setFiles(prev => prev.map(file => {
        if (filesToUpload.some(newFile => newFile.id === file.id)) {
          return {
            ...file,
            status: 'error',
            error: err.message || 'Upload failed'
          };
        }
        return file;
      }));
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
        isValidObjectId(file._id)
      );
      
      if (photosWithValidIds.length === 0) {
        throw new Error('No valid MongoDB ObjectIDs found in the photos. Make sure photos are properly uploaded first.');
      }
      
      setAnalyzing(true);
      setError(null);
      setAnalysisProgress(0);
      
      // Process all photos in batches
      let remainingPhotos = [...photosWithValidIds];
      let processedCount = 0;
      const totalToProcess = photosWithValidIds.length;
      
      console.log(`Starting analysis of ${totalToProcess} photos in batches`);
      
      // Track failed photos for retry
      const failedPhotos = [];
      
      while (remainingPhotos.length > 0) {
        // Update status of current batch to analyzing
        setFiles(prev => {
          const updatedFiles = [...prev];
          const currentBatchIds = remainingPhotos.slice(0, 1).map(file => file._id);
          
          for (let i = 0; i < updatedFiles.length; i++) {
            if (currentBatchIds.includes(updatedFiles[i]._id)) {
              updatedFiles[i] = {
                ...updatedFiles[i],
                status: 'analyzing',
              };
            }
          }
          return updatedFiles;
        });
        
        try {
          // Call the analyze endpoint with just one photo at a time to avoid timeouts
          const currentBatch = remainingPhotos.slice(0, 1);
          const response = await analyzeBatchPhotos(currentBatch, reportId);
          
          if (!response.success) {
            console.error(`Batch analysis failed:`, response.error);
            // Add to failed photos for retry
            failedPhotos.push(...currentBatch);
            throw new Error(response.error || 'Analysis failed');
          }
          
          // Update the files with analysis results from this batch
          setFiles(prev => {
            const updatedFiles = [...prev];
            
            if (response.data && response.data.length > 0) {
              for (const result of response.data) {
                const fileIndex = updatedFiles.findIndex(file => file._id === result.fileId);
                if (fileIndex !== -1) {
                  updatedFiles[fileIndex] = {
                    ...updatedFiles[fileIndex],
                    status: 'complete',
                    analysis: result.data,
                  };
                }
              }
            }
            
            return updatedFiles;
          });
          
          // Update progress
          processedCount += response.data.length;
          const progress = Math.round((processedCount / totalToProcess) * 100);
          setAnalysisProgress(progress);
          
          console.log(`Processed batch: ${response.data.length} photos. Progress: ${progress}%`);
          
          // Remove processed photos from remaining list
          remainingPhotos = remainingPhotos.slice(1);
        } catch (batchError) {
          console.error(`Error processing batch:`, batchError);
          // Skip this batch and continue with the next one
          remainingPhotos = remainingPhotos.slice(1);
        }
        
        // Add a small delay between batches to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Try to retry failed photos once
      if (failedPhotos.length > 0) {
        console.log(`Retrying ${failedPhotos.length} failed photos...`);
        
        for (const photo of failedPhotos) {
          try {
            // Update status to retrying
            setFiles(prev => {
              const updatedFiles = [...prev];
              const fileIndex = updatedFiles.findIndex(file => file._id === photo._id);
              if (fileIndex !== -1) {
                updatedFiles[fileIndex] = {
                  ...updatedFiles[fileIndex],
                  status: 'analyzing',
                };
              }
              return updatedFiles;
            });
            
            // Try to analyze this photo again
            const response = await analyzeBatchPhotos([photo], reportId);
            
            if (response.success && response.data && response.data.length > 0) {
              // Update the file with analysis results
              setFiles(prev => {
                const updatedFiles = [...prev];
                const result = response.data[0];
                const fileIndex = updatedFiles.findIndex(file => file._id === result.fileId);
                if (fileIndex !== -1) {
                  updatedFiles[fileIndex] = {
                    ...updatedFiles[fileIndex],
                    status: 'complete',
                    analysis: result.data,
                  };
                }
                return updatedFiles;
              });
              
              // Update progress
              processedCount += 1;
              const progress = Math.round((processedCount / totalToProcess) * 100);
              setAnalysisProgress(progress);
            }
          } catch (retryError) {
            console.error(`Retry failed for photo ${photo._id}:`, retryError);
            // Mark as error in the UI
            setFiles(prev => {
              const updatedFiles = [...prev];
              const fileIndex = updatedFiles.findIndex(file => file._id === photo._id);
              if (fileIndex !== -1) {
                updatedFiles[fileIndex] = {
                  ...updatedFiles[fileIndex],
                  status: 'error',
                  error: 'Analysis failed after retry',
                };
              }
              return updatedFiles;
            });
          }
          
          // Add a small delay between retries
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`AI analysis completed for ${processedCount} out of ${totalToProcess} photos`);
      setAnalysisProgress(100);
    } catch (error) {
      console.error('Error analyzing photos:', error);
      setError(error.message || 'Failed to analyze photos');
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
                            const newUrl = createAndTrackBlobUrl(file.originalFile);
                            if (newUrl) {
                              e.target.src = newUrl;
                            } else {
                              e.target.src = `/placeholder-image.png`;
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