import React, { useState, useCallback, useRef, useEffect } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';

const PhotoUploadAnalysisStep = () => {
  const { user } = useAuth();
  
  // Get photo context
  const { 
    photos, 
    isUploading, 
    uploadProgress, 
    isAnalyzing, 
    analysisProgress, 
    error: photoError, 
    addPhotosFromFiles, 
    uploadPhotosToServer, 
    analyzePhotos,
    removePhoto,
    setError: setPhotoError
  } = usePhotoContext();

  // Get report context
  const {
    report,
    error: reportError,
    generateSummary,
    generatingSummary,
    prevStep,
    nextStep
  } = useReportContext();

  // Local state for the dropzone and analysis UI
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [batchAnalysisMode, setBatchAnalysisMode] = useState(true);
  const fileInputRef = useRef(null);

  // Handle file drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    // Get files from event
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    // Add files to context - the context will handle creating blob URLs
    addPhotosFromFiles(files, report._id);
  }, [addPhotosFromFiles, report._id]);

  // Handle drag events
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle file input change
  const handleFileInputChange = useCallback((e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Add files to context - the context will handle creating blob URLs
    addPhotosFromFiles(files, report._id);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addPhotosFromFiles, report._id]);

  // Handle "Select Files" button click
  const handleSelectFilesClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // Handle analyze all photos
  const handleAnalyzeAllPhotos = useCallback(() => {
    if (!report._id) {
      setPhotoError('Report ID is missing. Please save basic information first.');
      return;
    }
    
    // Get photos that need analysis
    const photosToAnalyze = photos.filter(p => p._id && (!p.analysis || p.status !== 'analyzed'));
    
    if (photosToAnalyze.length === 0) {
      setPhotoError('No photos to analyze. Please upload photos first.');
      return;
    }
    
    // Analyze photos - the PhotoContext will handle the API calls and state updates
    analyzePhotos(report._id);
  }, [analyzePhotos, photos, report._id, setPhotoError]);

  // Handle analyze one photo
  const handleAnalyzePhoto = useCallback((photo) => {
    if (!report._id || !photo._id) {
      setPhotoError('Report or photo ID is missing.');
      return;
    }
    
    // Analyze a single photo
    analyzePhotos(report._id, [photo._id]);
  }, [analyzePhotos, report._id, setPhotoError]);

  // Handle generate report summary
  const handleGenerateSummary = useCallback(() => {
    if (photos.filter(p => p.analysis).length === 0) {
      setPhotoError('Please analyze at least one photo before generating a summary.');
      return;
    }
    
    generateSummary();
  }, [generateSummary, photos, setPhotoError]);

  // Handle photo selection for detail view
  const handlePhotoSelect = useCallback((photo) => {
    setSelectedPhoto(photo);
  }, []);

  // Close photo detail view
  const handleCloseDetail = useCallback(() => {
    setSelectedPhoto(null);
  }, []);

  // Handle next button click - delegate to ReportContext
  const handleNextClick = useCallback(() => {
    if (photos.length === 0) {
      setPhotoError('Please upload at least one photo before proceeding.');
      return;
    }
    
    nextStep(user);
  }, [nextStep, photos, setPhotoError, user]);

  // Render progress bar with improved visual feedback
  const renderProgressBar = (progress, label) => (
    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
      <div 
        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(Math.round(progress), 100)}%` }}
      />
      <div className="text-xs text-gray-500 mt-1">{label} {Math.round(progress)}%</div>
    </div>
  );

  // Render photo card
  const renderPhotoCard = (photo) => {
    // Determine status display
    const getStatusDisplay = () => {
      if (photo.status === 'error') {
        return <span className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl">Error</span>;
      } else if (photo.status === 'analyzing') {
        return <span className="absolute top-0 right-0 bg-yellow-500 text-white text-xs px-2 py-1 rounded-bl">Analyzing</span>;
      } else if (photo.analysis) {
        return <span className="absolute top-0 right-0 bg-green-500 text-white text-xs px-2 py-1 rounded-bl">Analyzed</span>;
      } else if (photo._id) {
        return <span className="absolute top-0 right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-bl">Uploaded</span>;
      } else if (photo.uploadProgress > 0 && photo.uploadProgress < 100) {
        return <span className="absolute top-0 right-0 bg-blue-400 text-white text-xs px-2 py-1 rounded-bl">Uploading {photo.uploadProgress}%</span>;
      }
      return <span className="absolute top-0 right-0 bg-gray-500 text-white text-xs px-2 py-1 rounded-bl">Pending</span>;
    };

    return (
      <div 
        key={photo._id || photo.id} 
        className="relative group border border-gray-300 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => handlePhotoSelect(photo)}
      >
        {getStatusDisplay()}
        
        <div className="aspect-w-3 aspect-h-2">
          <img 
            src={photo.url || photo.preview} 
            alt={photo.name || 'Photo'} 
            className="object-cover w-full h-full"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = 'https://via.placeholder.com/300x200?text=Image+Not+Available';
            }}
          />
        </div>
        
        <div className="p-2 bg-gray-50">
          <p className="text-sm font-medium truncate">{photo.name || 'Unnamed photo'}</p>
          {photo.analysis && (
            <p className="text-xs text-gray-500 truncate">
              {photo.analysis.damageDetected ? 'Damage detected' : 'No damage detected'}
            </p>
          )}
        </div>
        
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex space-x-2">
            {!photo.analysis && photo._id && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnalyzePhoto(photo);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-xs"
                disabled={isAnalyzing}
              >
                Analyze
              </button>
            )}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                removePhoto(photo);
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render photo detail modal
  const renderPhotoDetail = () => {
    if (!selectedPhoto) return null;

    const damageLevel = selectedPhoto.analysis?.severity || 'Unknown';
    const damageColor = {
      'critical': 'text-red-600',
      'severe': 'text-orange-600',
      'moderate': 'text-yellow-600',
      'minor': 'text-green-600',
      'none': 'text-blue-600',
      'Unknown': 'text-gray-600'
    }[damageLevel] || 'text-gray-600';

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-75 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-semibold">{selectedPhoto.name || 'Photo Details'}</h3>
            <button 
              onClick={handleCloseDetail}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex-grow overflow-auto">
            <div className="flex flex-col md:flex-row">
              <div className="md:w-1/2 p-4">
                <img 
                  src={selectedPhoto.url || selectedPhoto.preview} 
                  alt={selectedPhoto.name || 'Photo'} 
                  className="object-contain max-h-[50vh] w-full"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://via.placeholder.com/300x200?text=Image+Not+Available';
                  }}
                />
              </div>
              
              <div className="md:w-1/2 p-4 overflow-y-auto">
                <h4 className="text-lg font-medium mb-2">Analysis Results</h4>
                {selectedPhoto.analysis ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold">Damage Detected:</p>
                      <p className="text-sm">{selectedPhoto.analysis.damageDetected ? 'Yes' : 'No'}</p>
                    </div>
                    
                    {selectedPhoto.analysis.description && (
                      <div>
                        <p className="text-sm font-semibold">Description:</p>
                        <p className="text-sm">{selectedPhoto.analysis.description}</p>
                      </div>
                    )}
                    
                    {selectedPhoto.analysis.severity && (
                      <div>
                        <p className="text-sm font-semibold">Severity:</p>
                        <p className={`text-sm ${damageColor} font-semibold`}>{selectedPhoto.analysis.severity}</p>
                      </div>
                    )}
                    
                    {selectedPhoto.analysis.recommendedAction && (
                      <div>
                        <p className="text-sm font-semibold">Recommended Action:</p>
                        <p className="text-sm">{selectedPhoto.analysis.recommendedAction}</p>
                      </div>
                    )}
                    
                    {selectedPhoto.analysis.damageType && (
                      <div>
                        <p className="text-sm font-semibold">Damage Type:</p>
                        <p className="text-sm">{selectedPhoto.analysis.damageType}</p>
                      </div>
                    )}
                    
                    {selectedPhoto.analysis.estimatedRepairCost && (
                      <div>
                        <p className="text-sm font-semibold">Estimated Repair Cost:</p>
                        <p className="text-sm">${selectedPhoto.analysis.estimatedRepairCost}</p>
                      </div>
                    )}
                    
                    {selectedPhoto.analysis.tags && selectedPhoto.analysis.tags.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold">Tags:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedPhoto.analysis.tags.map((tag, index) => (
                            <span 
                              key={index}
                              className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500">
                      {selectedPhoto._id 
                        ? 'Photo has not been analyzed yet. Click "Analyze" to generate results.'
                        : 'Photo must be uploaded to the server before analysis.'}
                    </p>
                    
                    {selectedPhoto._id && !isAnalyzing && (
                      <button 
                        onClick={() => handleAnalyzePhoto(selectedPhoto)}
                        className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm"
                      >
                        Analyze Now
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Photos & Analysis</h2>
        <div className="flex items-center space-x-2 mt-2 sm:mt-0">
          <span className="text-sm text-gray-600">
            {photos.filter(p => p._id).length} uploaded / {photos.length} total
          </span>
        </div>
      </div>
      
      {/* Error messages */}
      {(photoError || reportError) && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{photoError || reportError}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Upload area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          className="hidden"
          multiple
        />
        
        <div className="space-y-3">
          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4h-12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          
          <div className="flex flex-col items-center text-sm text-gray-600">
            <p>Drag and drop image files here, or</p>
            <button
              type="button"
              onClick={handleSelectFilesClick}
              className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Select Files
            </button>
          </div>
        </div>
      </div>
      
      {/* Upload progress */}
      {isUploading && (
        <div className="my-4">
          {renderProgressBar(uploadProgress, 'Uploading')}
        </div>
      )}
      
      {/* Analysis progress */}
      {isAnalyzing && (
        <div className="my-4">
          {renderProgressBar(analysisProgress, 'Analyzing')}
        </div>
      )}
      
      {/* Photos grid */}
      {photos.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Photos ({photos.length})</h3>
            <div className="flex space-x-2">
              <button
                onClick={handleAnalyzeAllPhotos}
                disabled={isAnalyzing || photos.filter(p => p._id && !p.analysis).length === 0}
                className={`px-3 py-1 rounded text-sm ${
                  isAnalyzing || photos.filter(p => p._id && !p.analysis).length === 0
                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze All'}
              </button>
              
              <button
                onClick={handleGenerateSummary}
                disabled={generatingSummary || photos.filter(p => p.analysis).length === 0}
                className={`px-3 py-1 rounded text-sm ${
                  generatingSummary || photos.filter(p => p.analysis).length === 0
                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {generatingSummary ? 'Generating...' : 'Generate Summary'}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => renderPhotoCard(photo))}
          </div>
        </div>
      )}
      
      {/* Photo details modal */}
      {renderPhotoDetail()}
      
      {/* Navigation buttons */}
      <div className="flex justify-between pt-6">
        <button
          type="button"
          onClick={prevStep}
          className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Back
        </button>
        
        <button
          type="button"
          onClick={handleNextClick}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Next: Review
        </button>
      </div>
    </div>
  );
};

export default PhotoUploadAnalysisStep; 