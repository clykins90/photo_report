import PropTypes from 'prop-types';
import ProgressBar from './ProgressBar';

/**
 * Component for displaying photo analysis progress
 */
const PhotoAnalysisProgress = ({ progress, isAnalyzing }) => {
  return (
    <ProgressBar
      progress={progress}
      isActive={isAnalyzing}
      label="Analyzing photos with AI"
      color="indigo"
    />
  );
};

PhotoAnalysisProgress.propTypes = {
  progress: PropTypes.number.isRequired,
  isAnalyzing: PropTypes.bool.isRequired
};

export default PhotoAnalysisProgress; 