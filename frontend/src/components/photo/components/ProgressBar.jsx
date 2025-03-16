import PropTypes from 'prop-types';

/**
 * Reusable progress bar component for various operations
 */
const ProgressBar = ({ 
  progress, 
  isActive, 
  label, 
  color = 'blue'
}) => {
  // Calculate progress percentage for display
  const progressPercentage = Math.min(Math.round(progress), 100);
  
  if (!isActive) {
    return null;
  }

  // Determine color classes based on the color prop
  const colorClasses = {
    blue: {
      text: 'text-blue-700',
      bg: 'bg-blue-600'
    },
    indigo: {
      text: 'text-indigo-700',
      bg: 'bg-indigo-600'
    },
    green: {
      text: 'text-green-700',
      bg: 'bg-green-600'
    },
    red: {
      text: 'text-red-700',
      bg: 'bg-red-600'
    }
  };

  const colorClass = colorClasses[color] || colorClasses.blue;

  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <span className={`text-sm font-medium ${colorClass.text}`}>
          {label}... {progressPercentage}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className={`${colorClass.bg} h-2.5 rounded-full transition-all duration-300 ease-in-out`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
};

ProgressBar.propTypes = {
  progress: PropTypes.number.isRequired,
  isActive: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
  color: PropTypes.oneOf(['blue', 'indigo', 'green', 'red'])
};

export default ProgressBar; 