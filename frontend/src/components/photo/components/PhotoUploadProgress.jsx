import PropTypes from 'prop-types';
import ProgressBar from './ProgressBar';

/**
 * Component for displaying photo upload progress
 */
const PhotoUploadProgress = ({ progress, isUploading }) => {
  return (
    <ProgressBar
      progress={progress}
      isActive={isUploading}
      label="Uploading photos"
      color="blue"
    />
  );
};

PhotoUploadProgress.propTypes = {
  progress: PropTypes.number.isRequired,
  isUploading: PropTypes.bool.isRequired
};

export default PhotoUploadProgress; 