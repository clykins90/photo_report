import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadBatchPhotos, analyzePhoto, getPhotoUrl } from '../../services/photoService';
import AIDescriptionEditor from './AIDescriptionEditor';

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
    if (files.length === 0) {
      setError('Please select at least one photo to upload');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);
    
    try {
      // Get files that need uploading (have not been uploaded yet)
      const filesToUpload = files.filter(file => file.status === 'pending')
                               .map(file => file.originalFile);
      
      if (filesToUpload.length === 0) {
        setUploading(false);
        setError('All files have already been uploaded');
        return;
      }
      
      console.log(`Uploading ${filesToUpload.length} files...`);
      
      // Upload files in batch
      const response = await uploadBatchPhotos(
        filesToUpload, 
        reportId, // Pass the reportId if available
        (progress) => setUploadProgress(progress)
      );
      
      if (!response.success) {
        throw new Error(response.error || 'Upload failed');
      }
      
      // Create a map to identify updated files by name
      const fileNameMap = {};
      files.forEach(file => {
        fileNameMap[file.name] = file.id;
      });
      
      // Merge the server response with existing files
      const updatedFiles = files.map(file => {
        // If this file was just uploaded, find the corresponding server data
        if (file.status === 'pending') {
          const serverData = response.data.find(data => data.originalName === file.name);
          if (serverData) {
            // Success - update file with server data
            // But DON'T keep the blob URL preview after upload - it will be invalid
            return {
              ...file,
              ...serverData,
              status: 'complete',
              uploadedData: serverData,
              // Explicitly set preview to null - we'll use server URLs instead
              preview: null
            };
          }
        }
        // Keep unchanged files as they were
        return file;
      });
      
      // Update files state
      setFiles(updatedFiles);
      setUploadProgress(100);
      
      // Clean up blob URLs for uploaded files
      cleanupUploadedFiles(updatedFiles);
      
      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete(updatedFiles);
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
        
        // Ensure we have a valid filename before calling the API
        let filename;
        if (file.uploadedData && file.uploadedData.filename) {
          filename = file.uploadedData.filename;
        } else if (file.filename) {
          filename = file.filename;
        } else if (file.name) {
          filename = file.name;
        } else {
          console.error('File is missing filename information', file);
          // Skip this file or mark as error
          const fileIndex = analyzedFiles.findIndex(f => f.id === file.id);
          if (fileIndex !== -1) {
            analyzedFiles[fileIndex] = {
              ...analyzedFiles[fileIndex],
              status: 'error',
              error: 'File is missing filename information',
            };
          }
          continue; // Skip to next file
        }
        
        try {
          console.log(`Analyzing file ${i + 1}/${uploadedFiles.length}`);
          
          // Pass the entire file object to analyzePhoto instead of just the filename
          const result = await analyzePhoto(file);
          
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
      // Only revoke URLs for non-uploaded (pending) files
      files.forEach(file => {
        if (file.preview && file.status === 'pending') {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  // Clean up blob URLs for files after they're uploaded
  const cleanupUploadedFiles = useCallback((updatedFiles) => {
    // Find files that were previously pending but are now uploaded
    files.forEach(oldFile => {
      const updatedFile = updatedFiles.find(f => f.id === oldFile.id);
      if (oldFile.status === 'pending' && updatedFile?.status === 'complete' && oldFile.preview) {
        // Revoke the blob URL as we don't need it anymore
        URL.revokeObjectURL(oldFile.preview);
        console.log(`Revoked blob URL for uploaded file: ${oldFile.name}`);
      }
    });
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
            
            // Get the image URL - with debug logging to help identify issues
            let imageUrl = getPhotoUrl(file);
            console.log(`Photo ${index} (${file.name || 'unnamed'}):`, {
              status: file.status,
              isUploaded,
              url: imageUrl,
              hasPreview: !!file.preview,
              hasUploadedData: !!file.uploadedData,
              dataUrls: file.uploadedData ? {
                thumbnailUrl: file.uploadedData.thumbnailUrl,
                optimizedUrl: file.uploadedData.optimizedUrl
              } : 'none'
            });
            
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
                      // Simple error handler - just use placeholder if image fails to load
                      console.log(`Image failed to load for photo ${index}, using placeholder`);
                      e.target.src = '/placeholder-image.png';
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