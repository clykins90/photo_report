import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadBatchPhotos, analyzePhoto } from '../../services/photoService';
import AIDescriptionEditor from './AIDescriptionEditor';

const PhotoUploader = ({ 
  onUploadComplete, 
  initialPhotos = [], 
  showUploadControls = true 
}) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Track image loading attempts to prevent infinite retries
  const imageRetryCounters = useRef({});

  // Initialize with any provided photos
  useEffect(() => {
    if (initialPhotos.length > 0) {
      setFiles(initialPhotos);
    }
  }, [initialPhotos]);

  const onDrop = useCallback((acceptedFiles) => {
    if (!showUploadControls) return; // Don't allow new files if in analyze-only mode
    
    // Add preview to each file
    const newFiles = acceptedFiles.map(file => 
      Object.assign(file, {
        id: Date.now() + Math.random().toString(36).substring(2, 9), // Generate a unique ID
        preview: URL.createObjectURL(file),
        status: 'pending', // pending, uploading, analyzing, complete, error
        analysis: null,
        originalFile: file, // Store the original File object
      })
    );
    
    setFiles(prev => [...prev, ...newFiles]);
  }, [showUploadControls]);

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

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;
    
    try {
      setUploading(true);
      setError(null);
      setUploadProgress(0);
      
      // Update status of all files to uploading
      setFiles(prev => 
        prev.map(file => ({
          ...file,
          status: 'uploading',
        }))
      );
      
      // For large numbers of files, we'll track all the processed files here
      const processedFiles = [];
      
      // Determine batch size - for large uploads, process in smaller batches
      const batchSize = files.length > 10 ? 10 : files.length;
      const totalBatches = Math.ceil(files.length / batchSize);
      
      console.log(`Uploading ${files.length} files in ${totalBatches} batches of up to ${batchSize} files each`);
      
      // Process files in batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Create a new FormData for this batch
        const formData = new FormData();
        
        // Calculate start and end indices for this batch
        const startIdx = batchIndex * batchSize;
        const endIdx = Math.min((batchIndex + 1) * batchSize, files.length);
        const batchFiles = files.slice(startIdx, endIdx);
        
        console.log(`Processing batch ${batchIndex + 1}/${totalBatches} with ${batchFiles.length} files`);
        
        // Add files to this batch's FormData
        batchFiles.forEach((file, index) => {
          const actualFile = file.originalFile || file;
          console.log(`Adding file ${startIdx + index + 1}/${files.length} to batch:`, actualFile.name);
          formData.append('photos', actualFile);
        });
        
        // Debug log for this batch
        let fieldNames = new Set();
        for (const pair of formData.entries()) {
          fieldNames.add(pair[0]);
        }
        console.log(`Batch ${batchIndex + 1} field names:`, Array.from(fieldNames));
        
        try {
          // Upload this batch
          const batchResult = await uploadBatchPhotos(formData);
          
          if (!batchResult.success) {
            throw new Error(batchResult.error || `Batch ${batchIndex + 1} upload failed`);
          }
          
          // Add successful results to our processed files array
          const batchProcessedFiles = batchResult.data.map((uploadedFile, index) => {
            return {
              ...batchFiles[index],
              status: 'complete',
              uploadedData: uploadedFile,
            };
          });
          
          processedFiles.push(...batchProcessedFiles);
          
          // Update the UI with progress
          const progressPercent = Math.round(((batchIndex + 1) / totalBatches) * 100);
          setUploadProgress(progressPercent);
          
          // Update the overall files array with current progress
          setFiles(prev => {
            const updatedFiles = [...prev];
            batchFiles.forEach((file, index) => {
              const fileIndex = prev.findIndex(f => f.id === file.id);
              if (fileIndex !== -1) {
                updatedFiles[fileIndex] = batchProcessedFiles[index];
              }
            });
            return updatedFiles;
          });
          
          console.log(`Completed batch ${batchIndex + 1}/${totalBatches}`);
        } catch (error) {
          console.error(`Error in batch ${batchIndex + 1}:`, error);
          
          // Mark files in this batch as failed
          batchFiles.forEach(file => {
            processedFiles.push({
              ...file,
              status: 'error',
              error: error.message || 'Upload failed',
            });
          });
          
          // Continue with next batch instead of failing everything
          console.log('Continuing with next batch...');
        }
      }
      
      // Final update of all files
      setFiles(processedFiles);
      setUploadProgress(100);
      
      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete(processedFiles);
      }
    } catch (err) {
      console.error('Overall upload error:', err);
      setError(err.message || 'Upload failed. Please try again.');
      
      // Reset file status on error
      setFiles(prev => 
        prev.map(file => ({
          ...file,
          status: 'error',
          error: err.message || 'Upload failed',
        }))
      );
    } finally {
      setUploading(false);
    }
  };

  // Function to analyze all uploaded photos using AI
  const analyzeAllPhotos = async () => {
    if (files.length === 0 || analyzing) return;
    
    try {
      setAnalyzing(true);
      setError(null);
      setAnalysisProgress(0);
      
      // Get files ready for analysis using the helper function
      const uploadedFiles = getAnalyzableFiles();
      
      if (uploadedFiles.length === 0) {
        throw new Error('No photos available to analyze');
      }
      
      console.log(`Starting AI analysis for ${uploadedFiles.length} photos`);
      
      // Update status of all files to analyzing
      setFiles(prev => 
        prev.map(file => {
          if (uploadedFiles.includes(file)) {
            return {
              ...file,
              status: 'analyzing',
            };
          }
          return file;
        })
      );
      
      // Process each file sequentially
      const analyzedFiles = [...files];
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const filename = file.uploadedData.filename;
        
        try {
          console.log(`Analyzing file ${i + 1}/${uploadedFiles.length}: ${filename}`);
          
          // Call the API to analyze the photo
          const result = await analyzePhoto(filename);
          
          // Update the file in the array
          const fileIndex = analyzedFiles.findIndex(f => f.id === file.id);
          if (fileIndex !== -1) {
            analyzedFiles[fileIndex] = {
              ...analyzedFiles[fileIndex],
              status: 'complete',
              analysis: result.data,
            };
          }
          
          // Update progress
          const progress = Math.round(((i + 1) / uploadedFiles.length) * 100);
          setAnalysisProgress(progress);
          setFiles([...analyzedFiles]);
          
        } catch (err) {
          console.error(`Error analyzing file ${filename}:`, err);
          
          // Mark this file as error but continue with others
          const fileIndex = analyzedFiles.findIndex(f => f.id === file.id);
          if (fileIndex !== -1) {
            analyzedFiles[fileIndex] = {
              ...analyzedFiles[fileIndex],
              status: 'error',
              error: `Analysis failed: ${err.message || 'Unknown error'}`,
            };
          }
          setFiles([...analyzedFiles]);
        }
      }
      
      // Update parent component with the analyzed files
      if (onUploadComplete) {
        onUploadComplete(analyzedFiles);
      }
      
      console.log('AI analysis completed for all photos');
    } catch (err) {
      console.error('Overall analysis error:', err);
      setError(err.message || 'Photo analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const removeFile = (index) => {
    if (!showUploadControls) return; // Don't allow file removal in analyze-only mode
    
    const newFiles = [...files];
    
    // Revoke the preview URL to avoid memory leaks
    URL.revokeObjectURL(newFiles[index].preview);
    
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const updatePhotoAnalysis = (photoId, updatedAnalysis) => {
    setFiles(prev => 
      prev.map(file => 
        file.id === photoId 
          ? { ...file, analysis: updatedAnalysis } 
          : file
      )
    );
    
    // If the files have already been processed and sent to the parent,
    // update the parent with the new analysis
    if (onUploadComplete && files.every(file => file.status === 'complete' || file.status === 'error')) {
      onUploadComplete(files);
    }
  };

  // Function to check if files are ready to be analyzed
  const getAnalyzableFiles = () => {
    return files.filter(file => 
      (file.status === 'complete' && file.uploadedData) || 
      // Handle pre-uploaded files from initialPhotos
      (file.uploadedData && !file.analysis)
    );
  };

  // Clean up all created object URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach(file => {
        if (file.preview && typeof file.preview === 'string' && file.preview.startsWith('blob:')) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  return (
    <div className="space-y-6">
      {showUploadControls && (
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <div className="space-y-2">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path 
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4h-12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" 
                strokeWidth={2} 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            </svg>
            <div className="text-gray-600">
              <p className="text-base">
                Drag and drop files here, or <span className="text-blue-500">browse</span>
              </p>
              <p className="text-sm">
                Supports JPEG, PNG, and HEIC (max 10MB per file)
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Upload button and progress */}
      {showUploadControls && files.length > 0 && (
        <div className="flex flex-col space-y-2">
          <button
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className={`w-full py-2 rounded-md text-white font-medium ${
              uploading || files.length === 0 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {uploading ? `Uploading... ${uploadProgress}%` : 'Upload Photos'}
          </button>
          
          {uploading && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}
      
      {/* Analyze button and progress - only show when not in upload step */}
      {!showUploadControls && files.length > 0 && (
        <div className="flex flex-col space-y-2">
          <button
            onClick={analyzeAllPhotos}
            disabled={analyzing || files.length === 0}
            className={`w-full py-2 rounded-md text-white font-medium ${
              analyzing || files.length === 0 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {analyzing 
              ? `Analyzing... ${analysisProgress}%` 
              : 'Analyze All Photos with AI'}
          </button>
          
          {analyzing && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full" 
                style={{ width: `${analysisProgress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
      
      {/* Photo Preview Grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
          {files.map((file, index) => {
            // Create different URL options to try
            const baseApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
            const filename = file.filename || (file.path ? file.path.split('/').pop() : null);
            
            // Initialize retry counter for this image if it doesn't exist
            if (!imageRetryCounters.current[file.id]) {
              imageRetryCounters.current[file.id] = 0;
            }
            
            // Determine if the file has been uploaded to the server
            const isUploaded = file.status === 'complete' && file.uploadedData;
            
            // Try multiple possible image sources with a more selective approach
            let imageUrl = null;
            
            // For non-uploaded files, prefer preview blob
            if (!isUploaded && file.preview) {
              imageUrl = file.preview;
              console.log(`Using preview blob for non-uploaded photo ${index}: ${imageUrl}`);
            }
            // For uploaded files, use the server paths
            else if (isUploaded) {
              // First preference: Use direct thumbnail URL if provided in response
              if (file.uploadedData.thumbnailUrl) {
                imageUrl = file.uploadedData.thumbnailUrl;
                console.log(`Using direct thumbnailUrl for photo ${index}: ${imageUrl}`);
              }
              // Second preference: Use direct optimized URL if provided in response
              else if (file.uploadedData.optimizedUrl) {
                imageUrl = file.uploadedData.optimizedUrl;
                console.log(`Using direct optimizedUrl for photo ${index}: ${imageUrl}`);
              }
              // Third preference: Try to construct thumbnail URL from thumbnailFilename
              else if (file.uploadedData.thumbnailFilename) {
                imageUrl = `${baseApiUrl}/api/photos/${file.uploadedData.thumbnailFilename}`;
                console.log(`Using thumbnailFilename URL for photo ${index}: ${imageUrl}`);
              }
              // Fourth preference: Try to construct URL from thumbnailPath
              else if (file.thumbnailPath || file.uploadedData.thumbnailPath) {
                const thumbPath = file.thumbnailPath || file.uploadedData.thumbnailPath;
                const thumbFilename = thumbPath.split('/').pop();
                imageUrl = `${baseApiUrl}/api/photos/${thumbFilename}`;
                console.log(`Using thumbnail path URL for photo ${index}: ${imageUrl}`);
              } 
              // Fifth preference: Use optimized version if available
              else if (file.optimizedPath || file.uploadedData.optimizedPath) {
                const optPath = file.optimizedPath || file.uploadedData.optimizedPath;
                const optimizedFilename = optPath.split('/').pop();
                imageUrl = `${baseApiUrl}/api/photos/${optimizedFilename}`;
                console.log(`Using optimized URL for photo ${index}: ${imageUrl}`);
              }
              // Sixth preference: Use original filename
              else if (filename) {
                imageUrl = `${baseApiUrl}/api/photos/${filename}`;
                console.log(`Using standard URL for photo ${index}: ${imageUrl}`);
              }
            }
            // Fallback to preview blob or placeholder
            else {
              imageUrl = file.preview || '/placeholder-image.png';
              console.log(`Using fallback for photo ${index}: ${imageUrl}`);
            }
            
            // Create direct link URLs as backups - BUT ONLY FOR UPLOADED FILES
            let directThumbLinkUrl = null;
            let directOptimizedLinkUrl = null;
            let directLinkUrl = null;
            
            if (isUploaded) {
              if (file.uploadedData.thumbnailFilename) {
                directThumbLinkUrl = `${baseApiUrl}/api/photos/${file.uploadedData.thumbnailFilename}`;
              } else if (file.uploadedData.thumbnailPath) {
                const thumbFilename = file.uploadedData.thumbnailPath.split('/').pop();
                directThumbLinkUrl = `${baseApiUrl}/api/photos/${thumbFilename}`;
              }
              
              if (file.uploadedData.optimizedFilename) {
                directOptimizedLinkUrl = `${baseApiUrl}/api/photos/${file.uploadedData.optimizedFilename}`;
              } else if (file.uploadedData.optimizedPath) {
                const optFilename = file.uploadedData.optimizedPath.split('/').pop();
                directOptimizedLinkUrl = `${baseApiUrl}/api/photos/${optFilename}`;
              }
              
              directLinkUrl = filename ? `${baseApiUrl}/api/photos/${filename}` : null;
            }

            return (
              <div 
                key={index}
                className="relative border rounded p-2 hover:bg-gray-50 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors"
                  aria-label="Remove file"
                >
                  <span className="sr-only">Remove</span>
                  <span aria-hidden="true">&times;</span>
                </button>
                
                <div className="h-32 overflow-hidden rounded mb-2">
                  <img
                    src={imageUrl}
                    alt={file.name || `Uploaded image ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Get the current retry count and increment it
                      const retryCount = imageRetryCounters.current[file.id] || 0;
                      imageRetryCounters.current[file.id] = retryCount + 1;
                      
                      // Only attempt fallbacks if we haven't tried too many times
                      const MAX_RETRIES = 3;
                      if (retryCount >= MAX_RETRIES) {
                        console.log(`Max retries (${MAX_RETRIES}) reached for image ${index}, using placeholder`);
                        e.target.src = '/placeholder-image.png';
                        return;
                      }
                      
                      console.log(`Image load error for ${index}, trying fallback sources (retry ${retryCount + 1}/${MAX_RETRIES})`);
                      const currentSrc = e.target.src;
                      
                      // For uploads in progress, just use the preview or placeholder
                      if (!isUploaded) {
                        if (file.preview && currentSrc !== file.preview) {
                          console.log(`Non-uploaded file: using preview blob for photo ${index}`);
                          e.target.src = file.preview;
                        } else {
                          console.log(`Non-uploaded file: using placeholder for photo ${index}`);
                          e.target.src = '/placeholder-image.png';
                        }
                        return;
                      }
                      
                      // For uploaded files, try the API fallbacks
                      if (directThumbLinkUrl && currentSrc !== directThumbLinkUrl) {
                        console.log(`Trying direct thumbnail link for photo ${index}`);
                        e.target.src = directThumbLinkUrl;
                      } else if (directOptimizedLinkUrl && currentSrc !== directOptimizedLinkUrl) {
                        console.log(`Trying direct optimized link for photo ${index}`);
                        e.target.src = directOptimizedLinkUrl;
                      } else if (directLinkUrl && currentSrc !== directLinkUrl) {
                        console.log(`Trying direct link for photo ${index}`);
                        e.target.src = directLinkUrl;
                      } else if (file.preview && currentSrc !== file.preview) {
                        console.log(`Trying preview blob for photo ${index}`);
                        e.target.src = file.preview;
                      } else {
                        console.log(`All fallbacks failed for photo ${index}, using placeholder`);
                        e.target.src = '/placeholder-image.png';
                      }
                    }}
                  />
                </div>
                
                <div className="text-xs truncate" title={file.name || `Photo ${index + 1}`}>
                  {file.name || `Photo ${index + 1}`}
                </div>
                
                {file.error && (
                  <div className="text-red-500 text-xs mt-1">{file.error}</div>
                )}
                
                {file.status === 'analyzing' && (
                  <div className="text-xs text-blue-500 mt-1">Analyzing...</div>
                )}
                
                {file.analysis && (
                  <div className="text-xs text-green-500 mt-1">Analyzed</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PhotoUploader; 