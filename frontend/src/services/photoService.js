import api from './api';

/**
 * Utility function to control logging verbosity
 * @param {string} message - Message to log
 * @param {any} data - Optional data to log
 * @param {boolean} isError - Whether this is an error log
 */
const photoLogger = (message, data = null, isError = false) => {
  // Get environment variable or localStorage setting for verbose logging
  const verboseLogging = import.meta.env.VITE_VERBOSE_PHOTO_LOGGING === 'true' || 
                         localStorage.getItem('verbosePhotoLogging') === 'true';
  
  // Always log errors, or if verbose logging is enabled
  if (isError || verboseLogging) {
    if (isError) {
      if (data) {
        console.error(message, data);
      } else {
        console.error(message);
      }
    } else {
      if (data) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    }
  }
};

/**
 * Uploads a file in chunks to the server
 * @param {File} file - The file to upload
 * @param {string} reportId - Report ID to associate the photo with
 * @param {string} clientId - Client-generated ID to track the file
 * @param {Function} progressCallback - Callback for upload progress
 * @param {Object} options - Additional options
 * @returns {Promise} - Promise resolving to the server response
 */
export const uploadChunkedPhoto = async (file, reportId, clientId, progressCallback = null, options = {}) => {
  try {
    if (!file) {
      throw new Error('No file provided for upload');
    }

    if (!reportId) {
      throw new Error('Report ID is required for photo upload');
    }

    // Default options
    const defaultOptions = {
      chunkSize: 500 * 1024, // 500KB chunks by default
      concurrentChunks: 3,   // Number of chunks to upload concurrently
      maxRetries: 3,         // Maximum number of retries per chunk
      retryDelay: 1000,      // Delay between retries in ms
    };

    const config = { ...defaultOptions, ...options };
    photoLogger(`Uploading chunked file: ${file.name} (${file.size} bytes) with chunk size: ${config.chunkSize} bytes`);

    // Calculate total chunks
    const totalChunks = Math.ceil(file.size / config.chunkSize);
    photoLogger(`Total chunks to upload: ${totalChunks}`);

    // Initialize upload session
    const initResponse = await api.post('/photos/upload-chunk/init', {
      filename: file.name,
      fileSize: file.size,
      fileType: file.type,
      reportId,
      clientId,
      totalChunks
    });

    if (!initResponse.data.success) {
      throw new Error(initResponse.data.error || 'Failed to initialize chunked upload');
    }

    const { uploadId } = initResponse.data;
    photoLogger(`Upload session initialized with ID: ${uploadId}`);

    // Track uploaded chunks
    const uploadedChunks = new Set();
    let totalProgress = 0;

    // Function to upload a single chunk
    const uploadChunk = async (chunkIndex) => {
      if (uploadedChunks.has(chunkIndex)) {
        return; // Skip already uploaded chunks
      }

      let retries = 0;
      let success = false;

      while (!success && retries <= config.maxRetries) {
        try {
          // Calculate chunk boundaries
          const start = chunkIndex * config.chunkSize;
          const end = Math.min(start + config.chunkSize, file.size);
          const chunk = file.slice(start, end);

          // Create form data for this chunk
          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('uploadId', uploadId);
          formData.append('chunkIndex', chunkIndex);
          formData.append('totalChunks', totalChunks);

          // Upload the chunk
          const response = await api.post('/photos/upload-chunk', formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });

          if (response.data.success) {
            uploadedChunks.add(chunkIndex);
            
            // Update progress
            totalProgress = (uploadedChunks.size / totalChunks) * 100;
            if (progressCallback) {
              progressCallback(Math.round(totalProgress));
            }
            
            success = true;
            photoLogger(`Chunk ${chunkIndex + 1}/${totalChunks} uploaded successfully`);
          } else {
            throw new Error(response.data.error || `Failed to upload chunk ${chunkIndex}`);
          }
        } catch (error) {
          retries++;
          photoLogger(`Error uploading chunk ${chunkIndex}, retry ${retries}/${config.maxRetries}`, error, true);
          
          if (retries <= config.maxRetries) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, config.retryDelay));
          } else {
            throw new Error(`Failed to upload chunk ${chunkIndex} after ${config.maxRetries} retries`);
          }
        }
      }
    };

    // Upload chunks with concurrency control
    const uploadAllChunks = async () => {
      for (let i = 0; i < totalChunks; i += config.concurrentChunks) {
        const chunkPromises = [];
        
        // Create a batch of concurrent uploads
        for (let j = 0; j < config.concurrentChunks && i + j < totalChunks; j++) {
          chunkPromises.push(uploadChunk(i + j));
        }
        
        // Wait for this batch to complete before starting the next batch
        await Promise.all(chunkPromises);
      }
    };

    // Start uploading all chunks
    await uploadAllChunks();

    // Complete the upload
    const completeResponse = await api.post('/photos/complete-upload', {
      uploadId,
      reportId,
      clientId,
      filename: file.name,
      fileType: file.type,
      totalChunks
    });

    if (!completeResponse.data.success) {
      throw new Error(completeResponse.data.error || 'Failed to complete chunked upload');
    }

    photoLogger('Chunked upload completed successfully', completeResponse.data);
    return completeResponse.data;
  } catch (error) {
    photoLogger('Error in chunked upload', error, true);
    throw error;
  }
};

/**
 * Get the proper URL for a photo file
 * @param {Object|string} fileOrId - The photo object or ID
 * @param {string} size - Size of the photo (original or thumbnail)
 * @returns {string} - The URL to access the photo
 */
export const getPhotoUrl = (fileOrId, size = 'thumbnail') => {
  // If given a string ID, validate it looks like a MongoDB ObjectId
  if (typeof fileOrId === 'string') {
    // Basic validation for MongoDB ObjectId format (24 hex chars)
    if (/^[0-9a-fA-F]{24}$/.test(fileOrId)) {
      return `/api/photos/${fileOrId}?size=${size}`;
    } else {
      photoLogger(`Invalid photo ID format: ${fileOrId}`, null, true);
      return '/placeholder-image.png';
    }
  }
  
  // If file has no data, return placeholder
  if (!fileOrId) {
    return '/placeholder-image.png';
  }
  
  // PRIORITY 1: Always use preview URL if available and it's a blob URL
  if (fileOrId.preview && fileOrId.preview.startsWith('blob:')) {
    return fileOrId.preview;
  }
  
  // PRIORITY 2: Use URL property if it exists and is valid
  if (fileOrId.url && (fileOrId.url.startsWith('http') || fileOrId.url.startsWith('/api/'))) {
    return fileOrId.url;
  }
  
  // PRIORITY 3: If we have a MongoDB ObjectId, validate and use that
  if (fileOrId._id) {
    // Basic validation for MongoDB ObjectId format
    if (typeof fileOrId._id === 'string' && /^[0-9a-fA-F]{24}$/.test(fileOrId._id)) {
      return `/api/photos/${fileOrId._id}?size=${size}`;
    } else {
      photoLogger(`Invalid photo _id format: ${fileOrId._id}`, fileOrId, true);
    }
  }
  
  // PRIORITY 4: If we have a filename, use that
  if (fileOrId.filename) {
    return `/api/photos/${fileOrId.filename}?size=${size}`;
  }
  
  // PRIORITY 5: For local files that aren't uploaded yet, use the preview URL
  if (fileOrId.preview) {
    return fileOrId.preview;
  }
  
  // Fallback to placeholder - only log in development to reduce noise
  if (process.env.NODE_ENV === 'development') {
    photoLogger('Unable to determine photo URL from object:', fileOrId, true);
  }
  return '/placeholder-image.png';
};

/**
 * Upload multiple photos to the server
 * @param {File[]} files - Array of file objects to upload
 * @param {string|null} reportId - Report ID to associate photos with
 * @param {Function} progressCallback - Optional callback for upload progress
 * @param {Object[]} fileMetadata - Optional array of metadata for each file, including clientIds
 * @returns {Promise} - Promise resolving to the server response
 */
export const uploadBatchPhotos = async (files, reportId, progressCallback = null, fileMetadata = []) => {
  try {
    if (!files || files.length === 0) {
      throw new Error('No files provided for upload');
    }

    if (!reportId) {
      throw new Error('Report ID is required for photo upload');
    }

    photoLogger(`Uploading ${files.length} photos for report: ${reportId}`);
    
    // Log file names for debugging
    photoLogger('Files being uploaded:', files.map(f => f.name));

    // Determine which files should use chunked upload based on size
    const CHUNKED_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB
    const largeFiles = [];
    const smallFiles = [];
    
    files.forEach((file, index) => {
      if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
        largeFiles.push({ file, index });
      } else {
        smallFiles.push({ file, index });
      }
    });
    
    photoLogger(`Using chunked upload for ${largeFiles.length} large files and regular upload for ${smallFiles.length} small files`);
    
    // Track overall progress
    let totalProgress = 0;
    let completedFiles = 0;
    const totalFiles = files.length;
    
    // Function to update progress
    const updateProgress = (fileProgress, isComplete = false) => {
      if (isComplete) {
        completedFiles++;
      }
      
      // Calculate overall progress
      const overallProgress = Math.round(
        ((completedFiles / totalFiles) * 100) + 
        (fileProgress / totalFiles)
      );
      
      totalProgress = Math.min(99, overallProgress); // Cap at 99% until fully complete
      
      if (progressCallback) {
        progressCallback(totalProgress);
      }
    };
    
    // Results containers
    const results = {
      success: true,
      photos: [],
      idMapping: {}
    };
    
    // Upload large files using chunked upload
    if (largeFiles.length > 0) {
      photoLogger(`Starting chunked upload for ${largeFiles.length} large files`);
      
      // Upload large files sequentially to avoid overwhelming the server
      for (const { file, index } of largeFiles) {
        try {
          // Get client ID for this file
          const clientId = fileMetadata[index]?.clientId || 
            `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${index}`;
          
          // Upload the file with chunked upload
          const response = await uploadChunkedPhoto(
            file,
            reportId,
            clientId,
            (progress) => {
              // Scale the progress to the file's portion of the total
              updateProgress(progress / totalFiles);
            }
          );
          
          if (response.success && response.photo) {
            results.photos.push(response.photo);
            results.idMapping[clientId] = response.photo._id;
            updateProgress(0, true); // Mark this file as complete
          } else {
            throw new Error(response.error || `Failed to upload file ${file.name}`);
          }
        } catch (error) {
          photoLogger(`Error uploading large file ${file.name}:`, error, true);
          throw error;
        }
      }
    }
    
    // Upload small files using the traditional method with concurrency
    if (smallFiles.length > 0) {
      photoLogger(`Starting regular upload for ${smallFiles.length} small files with concurrency`);
      
      // Configuration for concurrent uploads
      const CONCURRENT_UPLOADS = 3; // Number of concurrent uploads
      const BATCH_SIZE = 5; // Number of files per batch
      
      // Split small files into batches for concurrent processing
      const batches = [];
      for (let i = 0; i < smallFiles.length; i += BATCH_SIZE) {
        batches.push(smallFiles.slice(i, i + BATCH_SIZE));
      }
      
      photoLogger(`Created ${batches.length} batches of small files for concurrent upload`);
      
      // Process batches with concurrency
      for (let i = 0; i < batches.length; i += CONCURRENT_UPLOADS) {
        const currentBatches = batches.slice(i, i + CONCURRENT_UPLOADS);
        const uploadPromises = currentBatches.map(async (batch) => {
          const formData = new FormData();
          
          // Add each file in this batch to the form data
          batch.forEach(({ file, index }) => {
            formData.append('photos', file);
            
            // If we have metadata with clientId for this file, add it
            if (fileMetadata[index] && fileMetadata[index].clientId) {
              formData.append('clientIds', fileMetadata[index].clientId);
              photoLogger(`Adding clientId ${fileMetadata[index].clientId} for file ${file.name}`);
            } else {
              // Generate a client ID if not provided
              const generatedClientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${index}`;
              formData.append('clientIds', generatedClientId);
              photoLogger(`Generated clientId ${generatedClientId} for file ${file.name}`);
              
              // Add to metadata array for reference
              if (!fileMetadata[index]) {
                fileMetadata[index] = {};
              }
              fileMetadata[index].clientId = generatedClientId;
            }
          });
          
          // Add reportId
          formData.append('reportId', reportId);
          
          // Create config with progress tracking if callback provided
          const config = {};
          if (progressCallback) {
            config.onUploadProgress = (progressEvent) => {
              const batchProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              // Scale the progress to this batch's portion of the total
              updateProgress((batchProgress * batch.length) / totalFiles);
            };
          }
          
          // Make the API call for this batch
          const response = await api.post('/photos/upload', formData, config);
          
          if (response.data.success) {
            // Return the results from this batch
            return {
              photos: response.data.photos || [],
              idMapping: response.data.idMapping || {}
            };
          } else {
            throw new Error(response.data.error || `Failed to upload batch of ${batch.length} files`);
          }
        });
        
        // Wait for all concurrent batch uploads to complete
        const batchResults = await Promise.all(uploadPromises);
        
        // Combine results from all batches
        batchResults.forEach(result => {
          results.photos = [...results.photos, ...result.photos];
          Object.assign(results.idMapping, result.idMapping);
        });
        
        // Mark these batches as complete
        const completedInThisRound = currentBatches.reduce((sum, batch) => sum + batch.length, 0);
        for (let j = 0; j < completedInThisRound; j++) {
          updateProgress(0, true);
        }
      }
    }
    
    // Set progress to 100% when all uploads are complete
    if (progressCallback) {
      progressCallback(100);
    }
    
    photoLogger('All uploads completed successfully', results);
    return results;
  } catch (error) {
    photoLogger('Error in uploadBatchPhotos:', error, true);
    return {
      success: false,
      error: error.message || 'An unknown error occurred during upload'
    };
  }
};

/**
 * Analyze photos for a report using AI
 * @param {string} reportId - ID of the report containing photos to analyze
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzePhotos = async (reportId) => {
  try {
    if (!reportId) {
      throw new Error('Report ID is required for photo analysis');
    }

    photoLogger(`Analyzing all photos for report: ${reportId}`);

    // Don't include any query parameters
    const response = await api.post(`/photos/analyze/${reportId}`);
    
    photoLogger(`Analysis complete: ${response.data.results?.length || 0} photos analyzed`);
    
    return {
      success: true,
      results: response.data.results?.map(result => ({
        photoId: result.photoId,
        status: result.status,
        analysis: result.analysis,
        error: result.error
      })) || []
    };
  } catch (error) {
    photoLogger('Error analyzing photos:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to analyze photos'
    };
  }
};

/**
 * Delete a photo
 * @param {string} photoId - ID of the photo to delete
 * @returns {Promise} - Promise resolving to the server response
 */
export const deletePhoto = async (photoId) => {
  try {
    if (!photoId) {
      throw new Error('Photo ID is required for deletion');
    }

    photoLogger(`Deleting photo: ${photoId}`);

    const response = await api.delete(`/photos/${photoId}`);
    
    photoLogger('Photo deleted successfully');
    
    return {
      success: true,
      message: response.data.message
    };
  } catch (error) {
    photoLogger('Error deleting photo:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to delete photo'
    };
  }
};

/**
 * Analyze a single photo using AI
 * @param {Object} photo - Photo object to analyze
 * @param {string} reportId - ID of the report containing the photo
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzePhoto = async (photo, reportId) => {
  try {
    if (!photo) {
      throw new Error('Valid photo object is required for analysis');
    }

    if (!reportId) {
      throw new Error('Report ID is required for photo analysis');
    }

    // Only use MongoDB ObjectID (24 hex chars)
    if (!photo._id || typeof photo._id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(photo._id)) {
      throw new Error('Photo must have a valid MongoDB ObjectID (_id). Make sure the photo is properly uploaded first.');
    }

    const photoId = photo._id;
    
    photoLogger(`Analyzing single photo with MongoDB ObjectID: ${photoId} for report: ${reportId}`);

    // Use URL parameter for reportId without any query parameters
    const response = await api.post(`/photos/analyze/${reportId}`, { 
      photoId: photoId
    });
    
    photoLogger(`Analysis complete for photo: ${photoId}`);
    
    // Extract the result for this specific photo
    const result = response.data.results?.find(r => r.photoId === photoId);
    
    if (!result) {
      throw new Error('No analysis result returned for this photo');
    }
    
    return {
      success: result.status === 'success',
      data: result.analysis,
      error: result.error
    };
  } catch (error) {
    photoLogger('Error analyzing photo:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to analyze photo'
    };
  }
};

/**
 * Analyze a batch of photos using AI
 * @param {Object[]} photos - Array of photo objects to analyze
 * @param {string} reportId - ID of the report containing the photos
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzeBatchPhotos = async (photos, reportId) => {
  const startTime = Date.now();
  try {
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      throw new Error('Valid array of photos is required for batch analysis');
    }

    if (!reportId) {
      throw new Error('Report ID is required for batch photo analysis');
    }

    photoLogger(`[TIMING] Starting batch analysis at ${new Date().toISOString()}`);
    photoLogger(`Analyzing batch of ${photos.length} photos for report: ${reportId}`);

    // Extract ONLY MongoDB ObjectIDs (24 hex chars)
    // This is the simplest solution - only send valid MongoDB IDs to the backend
    const photoIds = photos
      .filter(photo => photo._id && typeof photo._id === 'string' && /^[0-9a-fA-F]{24}$/.test(photo._id))
      .map(photo => photo._id);
    
    if (photoIds.length === 0) {
      throw new Error('No valid MongoDB ObjectIDs found in the photos. Make sure photos are properly uploaded first.');
    }
    
    photoLogger(`Extracted ${photoIds.length} MongoDB ObjectIDs for analysis:`, photoIds);
    photoLogger(`[TIMING] Making API request - elapsed: ${(Date.now() - startTime)/1000}s`);
    
    // Use URL parameter for reportId and send photoIds in the request body
    // Don't include any query parameters
    const apiCallStartTime = Date.now();
    const response = await api.post(`/photos/analyze/${reportId}`, { 
      photoIds: photoIds
    });
    const apiCallDuration = (Date.now() - apiCallStartTime)/1000;
    
    photoLogger(`[TIMING] API request completed in ${apiCallDuration}s - total elapsed: ${(Date.now() - startTime)/1000}s`);
    photoLogger(`Batch analysis complete for ${response.data.results?.length || 0} photos`);
    
    if (response.data.executionTime) {
      photoLogger(`[TIMING] Server reported execution time: ${response.data.executionTime}s`);
    }
    
    // Map the results to the expected format
    const results = response.data.results?.map(result => ({
      success: result.status === 'success',
      fileId: result.photoId,
      data: result.analysis,
      error: result.error
    })) || [];
    
    // Check if there are remaining photos to process
    const totalRemaining = response.data.totalPhotosRemaining || 0;
    
    const totalTime = (Date.now() - startTime)/1000;
    photoLogger(`[TIMING] Total client-side processing time: ${totalTime}s`);
    
    return {
      success: true,
      data: results,
      complete: totalRemaining === 0,
      totalRemaining: totalRemaining,
      processedIds: response.data.results?.map(r => r.photoId) || [],
      timing: {
        total: totalTime,
        apiCall: apiCallDuration,
        serverExecution: response.data.executionTime || 'unknown'
      }
    };
  } catch (error) {
    const errorTime = (Date.now() - startTime)/1000;
    photoLogger(`[TIMING] Error occurred at elapsed time: ${errorTime}s`);
    photoLogger('Error analyzing batch of photos:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to analyze photos',
      timing: {
        total: errorTime,
        error: true
      }
    };
  }
};

export default {
  uploadBatchPhotos,
  analyzePhotos,
  analyzePhoto,
  analyzeBatchPhotos,
  deletePhoto,
  getPhotoUrl,
  uploadChunkedPhoto
}; 