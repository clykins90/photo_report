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

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!showUploadControls) return; // Don't allow new files if in analyze-only mode
    
    // Add preview to each file
    const newFiles = acceptedFiles.map(file => 
      Object.assign(file, {
        // Use a prefix to ensure this is never confused with a MongoDB ObjectId
        id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        preview: URL.createObjectURL(file),
        status: 'pending', // pending, uploading, analyzing, complete, error
        analysis: null,
        originalFile: file, // Store the original File object
      })
    );
    
    // Add new files to state
    setFiles(prev => [...prev, ...newFiles]);
    
    // Automatically upload the files immediately
    if (newFiles.length > 0) {
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
          reportId, // Pass the reportId if available
          (progress) => {
            setUploadProgress(progress);
            
            // Update file status based on progress
            if (progress < 100) {
              // Files are still uploading
              setFiles(prev => prev.map(file => {
                if (newFiles.some(newFile => newFile.id === file.id) && file.status !== 'uploading') {
                  return {
                    ...file,
                    status: 'uploading'
                  };
                }
                return file;
              }));
            }
          }
        );
        
        if (!response.success) {
          throw new Error(response.error || 'Upload failed');
        }
        
        // Update the status of uploaded files
        const updatedFiles = [...files, ...newFiles].map(file => {
          // Check if this file was part of the uploaded batch
          const matchingUploadedFile = response.files?.find(uploaded => 
            uploaded.originalname === file.name || uploaded.filename === file.name
          );
          
          if (matchingUploadedFile) {
            return {
              ...file,
              status: 'complete',
              uploadedData: matchingUploadedFile
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
      
      // Only log this information if verbose logging is enabled
      const verboseLogging = import.meta.env.VITE_VERBOSE_PHOTO_LOGGING === 'true' || 
                            localStorage.getItem('verbosePhotoLogging') === 'true';
      if (verboseLogging) {
        console.log(`Uploading ${filesToUpload.length} files...`);
        console.log(`Report ID for photo association: ${reportId}`);
      }
      
      // Upload files in batch
      const response = await uploadBatchPhotos(
        filesToUpload, 
        reportId, // Pass the reportId if available
        (progress) => setUploadProgress(progress)
      );
      
      if (!response.success) {
        throw new Error(response.error || 'Upload failed');
      }
      
      // Update the status of uploaded files
      const updatedFiles = files.map(file => {
        // Check if this file was part of the uploaded batch
        const matchingUploadedFile = response.files?.find(uploaded => 
          uploaded.originalname === file.name || uploaded.filename === file.name
        );
        
        if (matchingUploadedFile) {
          // Update the file with uploaded data
          console.log(`File ${file.name} was uploaded successfully:`, matchingUploadedFile);
          
          return {
            ...file,
            status: 'uploaded',
            uploadedData: {
              _id: matchingUploadedFile._id,
              filename: matchingUploadedFile.filename || file.name,
              thumbnailFilename: matchingUploadedFile.thumbnailFilename,
              optimizedFilename: matchingUploadedFile.optimizedFilename,
              thumbnailUrl: matchingUploadedFile.thumbnailUrl,
              optimizedUrl: matchingUploadedFile.optimizedUrl,
              originalUrl: matchingUploadedFile.originalUrl,
              gridfsId: matchingUploadedFile.gridfsId || matchingUploadedFile._id
            }
          };
        }
        
        return file;
      });
      
      setFiles(updatedFiles);
      setUploading(false);
      
      // Call the onUploadComplete callback with updated files
      if (onUploadComplete) {
        onUploadComplete(updatedFiles);
      }
      
    } catch (error) {
      console.error('Upload failed:', error);
      setError(`Upload failed: ${error.message}`);
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
        
        try {
          console.log(`Analyzing file ${i + 1}/${uploadedFiles.length}`);
          
          // Analyze the photo
          const result = await analyzePhoto(file);
          
          if (!result.success) {
            throw new Error(result.error || 'Analysis failed');
          }
          
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
          console.error(`Error analyzing file:`, err);
          
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

  const handleRemoveFile = (id) => {
    if (!showUploadControls) return; // Don't allow file removal in analyze-only mode
    
    const newFiles = [...files];
    
    // Find the file to remove
    const fileIndex = newFiles.findIndex(file => file.id === id);
    if (fileIndex !== -1) {
      // Revoke the preview URL to avoid memory leaks
      URL.revokeObjectURL(newFiles[fileIndex].preview);
      
      newFiles.splice(fileIndex, 1);
      setFiles(newFiles);
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

  // Function to check if files are ready to be analyzed
  const getAnalyzableFiles = () => {
    return files.filter(file => 
      (file.status === 'uploaded' && file.uploadedData) || 
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
      
      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4">
          <h4 className="text-lg font-medium mb-2">Uploaded Photos ({files.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {files.map((file) => (
              <div key={file.id} className="relative">
                <div className="relative pb-[100%] overflow-hidden rounded-lg border border-gray-200">
                  <img
                    src={file.preview || getPhotoUrl(file)}
                    alt={file.name || 'Uploaded photo'}
                    className="absolute inset-0 w-full h-full object-cover"
                    onLoad={() => {
                      // Reset retry counter on successful load
                      if (imageRetryCounters.current[file.id]) {
                        delete imageRetryCounters.current[file.id];
                      }
                    }}
                    onError={(e) => {
                      // Initialize retry counter if it doesn't exist
                      if (!imageRetryCounters.current[file.id]) {
                        imageRetryCounters.current[file.id] = 0;
                      }
                      
                      // Only retry a limited number of times
                      if (imageRetryCounters.current[file.id] < 3) {
                        // Increment retry counter
                        imageRetryCounters.current[file.id]++;
                        
                        // Add a timestamp to bust cache
                        e.target.src = `${getPhotoUrl(file)}?retry=${Date.now()}`;
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
                  {file.name || 'Unnamed photo'}
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoUploader; 