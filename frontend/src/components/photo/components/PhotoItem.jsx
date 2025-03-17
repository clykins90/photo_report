import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getPhotoUrl } from '../../../utils/photoUtils';

/**
 * Component for displaying individual photo with status and controls
 */
const PhotoItem = ({ 
  photo, 
  onRemove, 
  onAnalyze,
  maxRetries = 3
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showAnalysis, setShowAnalysis] = useState(false);
  
  // Get the appropriate URL for the photo using our utility
  const imageUrl = getPhotoUrl(photo);
  
  // Reset image states when photo changes
  useEffect(() => {
    setImageLoaded(false);
    setLoadError(false);
    setRetryCount(0);
  }, [photo._id, photo.url, photo.preview]);
  
  // Handle image load error with retry logic
  const handleImageError = () => {
    if (retryCount < maxRetries) {
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setLoadError(false);
      }, 1000 * (retryCount + 1)); // Increasing backoff
    } else {
      setLoadError(true);
    }
  };

  // Determine the status display based on photo.status
  const getStatusDisplay = () => {
    if (!photo.status) return null;
    
    switch(photo.status) {
      case 'analyzing':
        return <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Analyzing</span>;
      case 'analyzed':
        return (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded cursor-pointer" 
                onClick={() => setShowAnalysis(true)}>
            AI Analyzed ↗
          </span>
        );
      case 'uploading':
        return <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">{photo.uploadProgress ? `${photo.uploadProgress}%` : 'Uploading'}</span>;
      case 'error':
        return <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">Error</span>;
      default:
        return null;
    }
  };

  // Analysis results modal
  const renderAnalysisModal = () => {
    if (!showAnalysis) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center border-b p-4">
            <h3 className="text-lg font-semibold">Photo Analysis Results</h3>
            <button 
              onClick={() => setShowAnalysis(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="p-4 flex">
            <div className="w-1/3 flex-shrink-0">
              <img 
                src={imageUrl} 
                alt={photo.name || "Photo"} 
                className="w-full h-auto rounded"
              />
            </div>
            
            <div className="ml-4 flex-1">
              {photo.analysis ? (
                <div>
                  <h4 className="font-medium mb-2">AI Detection Results</h4>
                  
                  {photo.analysis.damageDetected ? (
                    <div className="mb-4">
                      <span className="inline-flex items-center bg-red-100 text-red-800 px-2 py-1 rounded text-sm mb-2">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Damage Detected
                      </span>
                      
                      <ul className="list-disc pl-5 text-sm">
                        {photo.analysis.damageTypes?.map((damage, idx) => (
                          <li key={idx}>{damage}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <span className="inline-flex items-center bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        No Damage Detected
                      </span>
                    </div>
                  )}
                  
                  {photo.analysis.description && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{photo.analysis.description}</p>
                    </div>
                  )}
                  
                  {photo.analysis.recommendations && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Recommendations</h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{photo.analysis.recommendations}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">No analysis data available</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="border-t p-4 flex justify-end">
            <button
              onClick={() => setShowAnalysis(false)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative group border rounded-lg p-2 bg-white overflow-hidden">
      <div className="relative aspect-video bg-gray-100 rounded overflow-hidden mb-2">
        {!imageLoaded && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300 animate-spin" viewBox="0 0 24 24">
              <circle 
                className="opacity-25" 
                cx="12" cy="12" r="10" 
                stroke="currentColor" 
                strokeWidth="4" 
                fill="none" 
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
              />
            </svg>
          </div>
        )}
        
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <svg className="w-10 h-10 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="mt-2 text-xs">Failed to load image</p>
            </div>
          </div>
        )}
        
        {/* Analysis badge overlay */}
        {photo.status === 'analyzed' && photo.analysis && (
          <div className="absolute top-2 right-2">
            <span className="bg-green-500 text-white rounded-full p-1" 
                  onClick={() => setShowAnalysis(true)}
                  title="View AI Analysis">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
          </div>
        )}
        
        <img
          src={imageUrl + (retryCount > 0 ? `?retry=${retryCount}` : '')}
          alt={photo.name || photo.originalName || "Photo"}
          className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={handleImageError}
        />
      </div>
      
      <div className="flex justify-between items-center">
        <div className="max-w-[70%] truncate text-sm">
          {photo.name || photo.originalName || "Unnamed photo"}
        </div>
        
        <div className="flex space-x-1">
          {getStatusDisplay()}
        </div>
      </div>
      
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex space-x-2">
          {/* Only show analyze button for uploaded photos without analysis */}
          {photo.status === 'uploaded' && (
            <button
              onClick={() => onAnalyze(photo)}
              className="bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              title="Analyze with AI"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
          )}
          
          {/* View analysis button for analyzed photos */}
          {photo.status === 'analyzed' && photo.analysis && (
            <button
              onClick={() => setShowAnalysis(true)}
              className="bg-green-600 text-white rounded-full p-2 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              title="View AI Analysis"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          )}
          
          <button
            onClick={() => onRemove(photo)}
            className="bg-red-600 text-white rounded-full p-2 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            title="Remove photo"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      
      {renderAnalysisModal()}
    </div>
  );
};

PhotoItem.propTypes = {
  photo: PropTypes.object.isRequired,
  onRemove: PropTypes.func.isRequired,
  onAnalyze: PropTypes.func.isRequired,
  maxRetries: PropTypes.number
};

export default PhotoItem; 