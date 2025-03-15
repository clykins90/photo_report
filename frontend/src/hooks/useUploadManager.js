import { useState, useRef, useCallback } from 'react';
import { uploadChunkedPhoto, uploadBatchPhotos } from '../services/photoService';

/**
 * Custom hook for managing chunked file uploads with queue management
 * @param {Object} options - Configuration options
 * @returns {Object} - Upload manager methods and state
 */
const useUploadManager = (options = {}) => {
  // Default options
  const defaultOptions = {
    maxConcurrentUploads: 3,
    chunkSize: 500 * 1024, // 500KB chunks
    concurrentChunks: 3,
    maxRetries: 3,
    retryDelay: 1000,
    autoStart: true,
  };

  const config = { ...defaultOptions, ...options };
  
  // Define threshold for chunked uploads
  const CHUNKED_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB
  
  // Upload queue and active uploads tracking
  const [queue, setQueue] = useState([]);
  const [activeUploads, setActiveUploads] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [failed, setFailed] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Use refs for values that shouldn't trigger re-renders when changed
  const queueRef = useRef([]);
  const activeUploadsRef = useRef([]);
  const completedRef = useRef([]);
  const failedRef = useRef([]);
  
  // Progress tracking
  const [progress, setProgress] = useState({});
  
  /**
   * Add files to the upload queue
   * @param {Array} files - Array of file objects to upload
   * @param {string} reportId - Report ID to associate files with
   * @param {Array} metadata - Optional metadata for each file
   * @returns {Array} - Array of queued file objects with IDs
   */
  const addToQueue = useCallback((files, reportId, metadata = []) => {
    if (!files || !files.length) return [];
    if (!reportId) {
      console.error('Report ID is required for uploads');
      return [];
    }
    
    const newQueueItems = files.map((file, index) => {
      // Generate a client ID if not provided in metadata
      const clientId = metadata[index]?.clientId || 
        `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${index}`;
      
      return {
        id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${index}`,
        file,
        reportId,
        clientId,
        status: 'queued',
        progress: 0,
        createdAt: new Date(),
        metadata: metadata[index] || {},
        error: null,
        result: null
      };
    });
    
    // Update state and refs
    setQueue(prev => [...prev, ...newQueueItems]);
    queueRef.current = [...queueRef.current, ...newQueueItems];
    
    // Initialize progress tracking for new items
    const newProgress = { ...progress };
    newQueueItems.forEach(item => {
      newProgress[item.id] = 0;
    });
    setProgress(newProgress);
    
    // Auto-start processing if enabled
    if (config.autoStart && !isProcessing) {
      processQueue();
    }
    
    return newQueueItems;
  }, [progress, isProcessing, config.autoStart]);
  
  /**
   * Process the upload queue
   */
  const processQueue = useCallback(async () => {
    if (isProcessing) return;
    if (queueRef.current.length === 0 && activeUploadsRef.current.length === 0) return;
    
    setIsProcessing(true);
    
    // Process multiple items concurrently
    const processItems = async () => {
      // Calculate how many new uploads we can start
      const availableSlots = Math.max(0, config.maxConcurrentUploads - activeUploadsRef.current.length);
      
      if (availableSlots > 0 && queueRef.current.length > 0) {
        // Get the next batch of items to process
        const itemsToProcess = queueRef.current.slice(0, availableSlots);
        
        // Remove these items from the queue
        queueRef.current = queueRef.current.slice(availableSlots);
        
        // Add them to active uploads
        activeUploadsRef.current = [...activeUploadsRef.current, ...itemsToProcess];
        
        // Update state
        setQueue([...queueRef.current]);
        setActiveUploads([...activeUploadsRef.current]);
        
        // Group files by size for batch processing
        const largeFiles = [];
        const smallFiles = [];
        
        itemsToProcess.forEach(item => {
          if (item.file.size > CHUNKED_UPLOAD_THRESHOLD) {
            largeFiles.push(item);
          } else {
            smallFiles.push(item);
          }
        });
        
        // Start uploads in parallel
        const uploadPromises = [];
        
        // Process large files with chunked upload
        largeFiles.forEach(item => {
          uploadPromises.push(processLargeFile(item));
        });
        
        // Process small files with batch upload if there are any
        if (smallFiles.length > 0) {
          uploadPromises.push(processSmallFiles(smallFiles));
        }
        
        // Wait for all uploads to complete
        await Promise.all(uploadPromises);
        
        // Check if we can process more items
        if (queueRef.current.length > 0) {
          return processItems();
        }
      }
      
      // If there are no more items to process and no active uploads, we're done
      if (activeUploadsRef.current.length === 0 && queueRef.current.length === 0) {
        setIsProcessing(false);
      } else if (activeUploadsRef.current.length > 0) {
        // If there are still active uploads, check again after a delay
        setTimeout(() => {
          if (activeUploadsRef.current.length > 0 || queueRef.current.length > 0) {
            processItems();
          } else {
            setIsProcessing(false);
          }
        }, 500);
      }
    };
    
    // Process a large file using chunked upload
    const processLargeFile = async (item) => {
      item.status = 'uploading';
      
      try {
        // Track progress for this specific upload
        const updateItemProgress = (itemProgress) => {
          // Update progress in state
          setProgress(prev => ({
            ...prev,
            [item.id]: itemProgress
          }));
          
          // Also update the item's progress property
          item.progress = itemProgress;
        };
        
        // Start the chunked upload
        const result = await uploadChunkedPhoto(
          item.file,
          item.reportId,
          item.clientId,
          updateItemProgress,
          {
            chunkSize: config.chunkSize,
            concurrentChunks: config.concurrentChunks,
            maxRetries: config.maxRetries,
            retryDelay: config.retryDelay
          }
        );
        
        // Upload completed successfully
        item.status = 'completed';
        item.result = result;
        item.completedAt = new Date();
        
        // Move from active to completed
        activeUploadsRef.current = activeUploadsRef.current.filter(i => i.id !== item.id);
        completedRef.current = [...completedRef.current, item];
        
        // Update state
        setActiveUploads([...activeUploadsRef.current]);
        setCompleted([...completedRef.current]);
        
      } catch (error) {
        // Upload failed
        item.status = 'failed';
        item.error = error.message || 'Upload failed';
        item.failedAt = new Date();
        
        // Move from active to failed
        activeUploadsRef.current = activeUploadsRef.current.filter(i => i.id !== item.id);
        failedRef.current = [...failedRef.current, item];
        
        // Update state
        setActiveUploads([...activeUploadsRef.current]);
        setFailed([...failedRef.current]);
        
        console.error('Upload failed:', item.file.name, error);
      }
    };
    
    // Process small files using batch upload
    const processSmallFiles = async (items) => {
      try {
        // Mark all items as uploading
        items.forEach(item => {
          item.status = 'uploading';
        });
        
        // Prepare files and metadata for batch upload
        const files = items.map(item => item.file);
        const reportId = items[0].reportId; // All items should have the same reportId
        const fileMetadata = items.map(item => ({
          clientId: item.clientId,
          ...item.metadata
        }));
        
        // Track progress for all items in this batch
        const updateBatchProgress = (batchProgress) => {
          // Update progress for each item
          items.forEach(item => {
            setProgress(prev => ({
              ...prev,
              [item.id]: batchProgress
            }));
            
            // Also update the item's progress property
            item.progress = batchProgress;
          });
        };
        
        // Start the batch upload
        const result = await uploadBatchPhotos(files, reportId, updateBatchProgress, fileMetadata);
        
        if (result.success) {
          // Process each item with its corresponding result
          items.forEach(item => {
            const photoId = result.idMapping[item.clientId];
            const photo = result.photos.find(p => p._id === photoId);
            
            if (photo) {
              // Upload completed successfully
              item.status = 'completed';
              item.result = { success: true, photo };
              item.completedAt = new Date();
              
              // Move from active to completed
              activeUploadsRef.current = activeUploadsRef.current.filter(i => i.id !== item.id);
              completedRef.current = [...completedRef.current, item];
            } else {
              // Photo not found in results
              item.status = 'failed';
              item.error = 'Photo not found in upload results';
              item.failedAt = new Date();
              
              // Move from active to failed
              activeUploadsRef.current = activeUploadsRef.current.filter(i => i.id !== item.id);
              failedRef.current = [...failedRef.current, item];
            }
          });
          
          // Update state
          setActiveUploads([...activeUploadsRef.current]);
          setCompleted([...completedRef.current]);
          setFailed([...failedRef.current]);
        } else {
          throw new Error(result.error || 'Batch upload failed');
        }
      } catch (error) {
        // All uploads in this batch failed
        items.forEach(item => {
          item.status = 'failed';
          item.error = error.message || 'Upload failed';
          item.failedAt = new Date();
          
          // Move from active to failed
          activeUploadsRef.current = activeUploadsRef.current.filter(i => i.id !== item.id);
          failedRef.current = [...failedRef.current, item];
        });
        
        // Update state
        setActiveUploads([...activeUploadsRef.current]);
        setFailed([...failedRef.current]);
        
        console.error('Batch upload failed:', error);
      }
    };
    
    // Start processing
    processItems();
  }, [isProcessing, config.chunkSize, config.concurrentChunks, config.maxRetries, config.retryDelay, config.maxConcurrentUploads]);
  
  /**
   * Retry failed uploads
   * @param {string|Array} ids - ID or array of IDs of failed uploads to retry
   */
  const retryFailedUploads = useCallback((ids) => {
    const idsToRetry = Array.isArray(ids) ? ids : [ids];
    
    // Find failed items to retry
    const itemsToRetry = failedRef.current.filter(item => idsToRetry.includes(item.id));
    
    if (itemsToRetry.length === 0) return;
    
    // Reset their status and add back to queue
    const resetItems = itemsToRetry.map(item => ({
      ...item,
      status: 'queued',
      progress: 0,
      error: null,
      result: null,
      retryCount: (item.retryCount || 0) + 1,
      retryAt: new Date()
    }));
    
    // Remove from failed list
    failedRef.current = failedRef.current.filter(item => !idsToRetry.includes(item.id));
    setFailed([...failedRef.current]);
    
    // Add back to queue
    queueRef.current = [...queueRef.current, ...resetItems];
    setQueue([...queueRef.current]);
    
    // Reset progress
    const newProgress = { ...progress };
    resetItems.forEach(item => {
      newProgress[item.id] = 0;
    });
    setProgress(newProgress);
    
    // Start processing if not already
    if (!isProcessing) {
      processQueue();
    }
  }, [isProcessing, progress, processQueue]);
  
  /**
   * Cancel uploads by ID
   * @param {string|Array} ids - ID or array of IDs to cancel
   */
  const cancelUploads = useCallback((ids) => {
    const idsToCancel = Array.isArray(ids) ? ids : [ids];
    
    // Remove from queue
    queueRef.current = queueRef.current.filter(item => !idsToCancel.includes(item.id));
    setQueue([...queueRef.current]);
    
    // Mark active uploads as cancelled
    // Note: We can't actually abort in-progress chunk uploads yet
    // This would require modifying the uploadChunkedPhoto function to accept an abort signal
    const cancelledItems = activeUploadsRef.current
      .filter(item => idsToCancel.includes(item.id))
      .map(item => ({
        ...item,
        status: 'cancelled',
        error: 'Upload cancelled by user',
        cancelledAt: new Date()
      }));
    
    // Remove from active uploads
    activeUploadsRef.current = activeUploadsRef.current.filter(item => !idsToCancel.includes(item.id));
    setActiveUploads([...activeUploadsRef.current]);
    
    // Add to failed list
    failedRef.current = [...failedRef.current, ...cancelledItems];
    setFailed([...failedRef.current]);
    
  }, []);
  
  /**
   * Clear completed uploads from the list
   */
  const clearCompleted = useCallback(() => {
    completedRef.current = [];
    setCompleted([]);
  }, []);
  
  /**
   * Clear failed uploads from the list
   */
  const clearFailed = useCallback(() => {
    failedRef.current = [];
    setFailed([]);
  }, []);
  
  /**
   * Get overall progress across all active uploads
   * @returns {number} - Overall progress percentage (0-100)
   */
  const getOverallProgress = useCallback(() => {
    if (activeUploads.length === 0 && queue.length === 0) {
      return completed.length > 0 ? 100 : 0;
    }
    
    const totalItems = activeUploads.length + queue.length + completed.length;
    if (totalItems === 0) return 0;
    
    // Calculate based on individual progress of active items plus completed items
    const activeProgress = activeUploads.reduce((sum, item) => sum + (progress[item.id] || 0), 0);
    const completedProgress = completed.length * 100;
    
    return Math.round((activeProgress + completedProgress) / totalItems);
  }, [activeUploads, queue, completed, progress]);
  
  return {
    // State
    queue,
    activeUploads,
    completed,
    failed,
    isProcessing,
    progress,
    
    // Methods
    addToQueue,
    processQueue,
    retryFailedUploads,
    cancelUploads,
    clearCompleted,
    clearFailed,
    getOverallProgress
  };
};

export default useUploadManager; 