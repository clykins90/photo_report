import PropTypes from 'prop-types';

/**
 * Component for displaying photo upload progress
 */
const PhotoUploadProgress = ({ progress, isUploading }) => {
  // Calculate progress percentage for display
  const progressPercentage = Math.min(Math.round(progress), 100);
  
  if (!isUploading) {
    return null;
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-blue-700">
          Uploading photos... {progressPercentage}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
};

PhotoUploadProgress.propTypes = {
  progress: PropTypes.number.isRequired,
  isUploading: PropTypes.bool.isRequired
};

export default PhotoUploadProgress; 