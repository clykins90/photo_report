import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { getPhotoUrl } from '../../../utils/photoUtils';

/**
 * Component for displaying individual photo with status and controls
 */
const PhotoItem = ({ 
  photo, 
  onRemove, 
  onSelect,
  isSelected = false,
  selectedPhoto = null
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showAnalysis, setShowAnalysis] = useState(false);
  
  // Get the appropriate URL for the photo
  const imageUrl = photo.url || photo.preview;
  
  // Reset image states when photo changes
  useEffect(() => {
    setImageLoaded(false);
    setLoadError(false);
    setRetryCount(0);
  }, [photo._id, photo.url, photo.preview]);
  
  // Handle image load error
  const handleImageError = () => {
    setRetryCount(prev => prev + 1);
    if (retryCount < 3) {
      // Retry loading after a delay
      setTimeout(() => {
        setLoadError(false);
      }, 1000);
    } else {
      setLoadError(true);
    }
  };

  const handleRemovePhoto = useCallback((photo) => {
    onRemove(photo);
    if (isSelected && selectedPhoto && selectedPhoto._id === photo._id) {
      onSelect(null);
    }
  }, [onRemove, isSelected, selectedPhoto, onSelect]);

  // Render the status badge
  const renderStatus = () => {
    if (!photo.status) return null;
    
    const statusMap = {
      'uploading': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Uploading' },
      'uploaded': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Uploaded' },
      'analyzing': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Analyzing' },
      'analyzed': { bg: 'bg-green-100', text: 'text-green-800', label: 'Analyzed' },
      'error': { bg: 'bg-red-100', text: 'text-red-800', label: 'Error' }
    };
    
    const status = statusMap[photo.status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: photo.status };
    
    // Check for valid MongoDB ObjectId
    const isValidMongoId = photo._id && typeof photo._id === 'string' && /^[0-9a-f]{24}$/i.test(photo._id);
    let label = status.label;
    if (photo.status === 'uploaded' && !isValidMongoId) {
      label += ' (pending server ID)';
    }
    
    return (
      <span className={`absolute top-2 left-2 text-xs ${status.bg} ${status.text} px-2 py-0.5 rounded-full`}>
        {label}
      </span>
    );
  };

  // Handle click events
  const handleClick = () => {
    if (onSelect) {
      onSelect(photo);
    }
  };

  return (
    <div className={`relative group overflow-hidden rounded-lg ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
      {/* Image */}
      <div 
        className="aspect-square bg-gray-100 overflow-hidden cursor-pointer"
        onClick={handleClick}
      >
        {!loadError && imageUrl ? (
          <img
            src={imageUrl}
            alt={photo.name || 'Photo'}
            className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={handleImageError}
            style={{ minHeight: '100%' }}
          />
        ) : (
          <div className="flex items-center justify-center h-full w-full bg-gray-200 text-gray-500">
            {loadError ? 'Failed to load' : 'Loading...'}
          </div>
        )}
      </div>
      
      {/* Status badge */}
      {renderStatus()}
      
      {/* Overlay actions */}
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex space-x-2">
          {/* Remove button */}
          {onRemove && (
            <button
              onClick={() => handleRemovePhoto(photo)}
              className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full"
              aria-label="Remove photo"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {/* Photo details or caption */}
      {photo.description && (
        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 text-sm truncate">
          {photo.description}
        </div>
      )}
      
      {/* Analysis badge */}
      {photo.analysis && (
        <div 
          className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full cursor-pointer"
          onClick={() => setShowAnalysis(true)}
        >
          AI Analysis
        </div>
      )}
      
      {/* Analysis modal */}
      {showAnalysis && photo.analysis && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">AI Analysis</h3>
              <button 
                onClick={() => setShowAnalysis(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <img 
                    src={imageUrl} 
                    alt={photo.name || 'Photo'} 
                    className="w-full h-auto rounded-lg object-cover"
                  />
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-700">Summary</h4>
                    <p className="text-gray-600">{photo.analysis.description || 'No summary available'}</p>
                  </div>
                  
                  {photo.analysis.tags && photo.analysis.tags.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-700">Tags</h4>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {photo.analysis.tags.map((tag, index) => (
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
                  
                  {photo.analysis.damageDetected && (
                    <div>
                      <h4 className="font-medium text-gray-700">Damage Assessment</h4>
                      <div className="mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          photo.analysis.severity === 'severe' ? 'bg-red-100 text-red-800' :
                          photo.analysis.severity === 'moderate' ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {photo.analysis.severity?.toUpperCase()}
                        </span>
                        {photo.analysis.confidence && (
                          <span className="ml-2 text-xs text-gray-600">
                            Confidence: {Math.round(photo.analysis.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t flex justify-end">
              <button
                onClick={() => setShowAnalysis(false)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

PhotoItem.propTypes = {
  photo: PropTypes.object.isRequired,
  onRemove: PropTypes.func,
  onSelect: PropTypes.func,
  isSelected: PropTypes.bool,
  selectedPhoto: PropTypes.object
};

export default PhotoItem; 