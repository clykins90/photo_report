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

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!showUploadControls) return; // Don't allow new files if in analyze-only mode
    
    // Add preview to each file
    const newFiles = acceptedFiles.map(file => {
      // Create a new object with the file properties we need
      return {
        // Original file reference
        originalFile: file,
        // Use a prefix to ensure this is never confused with a MongoDB ObjectId
        id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        // Create a blob URL for preview
        preview: URL.createObjectURL(file),
        // Set initial status
        status: 'pending', // pending, uploading, analyzing, complete, error
        analysis: null,
        // Store the name in a separate property
        displayName: file.name || extractFilename(file)
      };
    });
    
    // Add new files to state
    setFiles(prev => [...prev, ...newFiles]);
    
    // Automatically upload the files immediately
    if (newFiles.length > 0 && reportId) {
      setUploading(true);
      setError(null);
      setUploadProgress(0);
      
      try {
        // Get files that need uploading
        const filesToUpload = newFiles.map(file => file.originalFile);
        
        // Update all new files to 'uploading' status
        setFiles(prev => prev.map(file => {
          if (newFiles.some(newFile => newFile.id === file.id)) {
            return {
              ...file,
              status: 'uploading'
            };
          }
          return file;
        }));
        
        // Upload files in batch
        const response = await uploadBatchPhotos(
          filesToUpload, 
          reportId,
          (progress) => {
            setUploadProgress(progress);
          }
        );
        
        if (!response.success) {
          throw new Error(response.error || 'Upload failed');
        }
        
        // Update the status of uploaded files
        const updatedFiles = [...files, ...newFiles].map(file => {
          // Check if this file was part of the uploaded batch
          const matchingUploadedFile = response.photos?.find(uploaded => {
            // Match by name from the original file
            const fileName = file.originalFile ? file.originalFile.name : file.displayName;
            return uploaded.filename === fileName;
          });
          
          if (matchingUploadedFile) {
            // Revoke the blob URL to prevent memory leaks
            if (file.preview) {
              URL.revokeObjectURL(file.preview);
            }
            
            // Return updated file with server data
            return {
              ...file,
              status: 'complete',
              // Store the MongoDB ID
              _id: matchingUploadedFile._id,
              // Store the filename
              filename: matchingUploadedFile.filename,
              // Clear the blob preview
              preview: null,
              // Store the displayName
              displayName: file.displayName || matchingUploadedFile.filename,
              // Store the section if available
              section: matchingUploadedFile.section || file.section || 'Uncategorized'
            };
          }
          return file;
        });
        
        setFiles(updatedFiles);
        
        // Notify parent component
        if (onUploadComplete) {
          onUploadComplete(updatedFiles);
        }
      } catch (err) {
        console.error('Upload failed:', err);
        setError(err.message || 'Failed to upload photos');
        
        // Update status of failed files
        const updatedFiles = [...files, ...newFiles].map(file => {
          if (newFiles.some(newFile => newFile.id === file.id)) {
            return {
              ...file,
              status: 'error',
              error: err.message || 'Upload failed'
            };
          }
          return file;
        });
        
        setFiles(updatedFiles);
        
        // Notify parent component of the error state
        if (onUploadComplete) {
          onUploadComplete(updatedFiles);
        }
      } finally {
        setUploading(false);
      }
    }
  }, [files, onUploadComplete, reportId, showUploadControls]);

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
      setAnalyzing(true);
      setError(null);
      setAnalysisProgress(0);
      
      // Update status of all files to analyzing
      setFiles(prev => 
        prev.map(file => {
          if (file.status === 'complete' && !file.analysis) {
            return {
              ...file,
              status: 'analyzing',
            };
          }
          return file;
        })
      );
      
      // Call the analyze endpoint with the report ID
      const response = await analyzePhotos(reportId);
      
      if (!response.success) {
        throw new Error(response.error || 'Analysis failed');
      }
      
      // Update the files with analysis results
      const updatedFiles = [...files];
      
      // Set analysis progress to 100%
      setAnalysisProgress(100);
      
      if (response.results && response.results.length > 0) {
        response.results.forEach(result => {
          if (!result.photoId) return;
          
          const fileIndex = updatedFiles.findIndex(f => 
            f._id && f._id.toString() === result.photoId.toString()
          );
          
          if (fileIndex !== -1) {
            updatedFiles[fileIndex] = {
              ...updatedFiles[fileIndex],
              status: 'complete',
              analysis: result.analysis,
            };
          }
        });
        
        setFiles(updatedFiles);
        
        // Notify parent component with the analyzed files
        if (onUploadComplete) {
          onUploadComplete(updatedFiles);
        }
        
        console.log(`AI analysis completed for ${response.results.length} photos`);
      } else {
        console.log('No analysis results returned from the server');
      }
    } catch (err) {
      console.error('Overall analysis error:', err);
      setError(err.message || 'Photo analysis failed. Please try again.');
      
      // Reset status of files that were being analyzed
      setFiles(prev => 
        prev.map(file => {
          if (file.status === 'analyzing') {
            return {
              ...file,
              status: 'complete',
            };
          }
          return file;
        })
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRemoveFile = (id) => {
    if (!showUploadControls) return; // Don't allow file removal in analyze-only mode
    
    const newFiles = [...files];
    
    // Find the file to remove
    const fileIndex = newFiles.findIndex(file => file.id === id);
    if (fileIndex !== -1) {
      // Revoke the preview URL to avoid memory leaks
      if (newFiles[fileIndex].preview) {
        URL.revokeObjectURL(newFiles[fileIndex].preview);
      }
      
      // If the file has been uploaded to the server, delete it
      if (newFiles[fileIndex]._id) {
        // Note: We could call deletePhoto here, but that would require updating the Report model
        // For now, we'll just remove it from the local state
        console.log(`File ${newFiles[fileIndex]._id} should be deleted from the server`);
      }
      
      newFiles.splice(fileIndex, 1);
      setFiles(newFiles);
      
      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete(newFiles);
      }
    }
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

  // Clean up all created object URLs on unmount
  useEffect(() => {
    return () => {
      // Only revoke URLs for non-uploaded (pending) files
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

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
      {files.length > 0 && !analyzing && files.some(file => file.status === 'complete' && !file.analysis) && (
        <div className="mt-4">
          <button
            type="button"
            onClick={analyzeAllPhotos}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            disabled={analyzing}
          >
            Analyze Photos with AI
          </button>
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
                    src={getPhotoUrl(file)}
                    alt={file.displayName || 'Uploaded photo'}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      // Simple fallback - try with size=original parameter or use placeholder
                      if (!e.target.src.includes('size=original') && file._id) {
                        e.target.src = `/api/photos/${file._id}?size=original`;
                      } else {
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