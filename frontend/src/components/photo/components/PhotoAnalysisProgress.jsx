import PropTypes from 'prop-types';

/**
 * Component for displaying photo analysis progress
 */
const PhotoAnalysisProgress = ({ progress, isAnalyzing }) => {
  // Calculate progress percentage for display
  const progressPercentage = Math.min(Math.round(progress), 100);
  
  if (!isAnalyzing) {
    return null;
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-indigo-700">
          Analyzing photos with AI... {progressPercentage}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
};

PhotoAnalysisProgress.propTypes = {
  progress: PropTypes.number.isRequired,
  isAnalyzing: PropTypes.bool.isRequired
};

export default PhotoAnalysisProgress; 