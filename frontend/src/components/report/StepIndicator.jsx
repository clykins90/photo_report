import React from 'react';

const StepIndicator = ({ currentStep, totalSteps = 4, onStepClick = null }) => {
  const stepLabels = [
    'Basic Info',
    'Upload Photos',
    'AI Analysis',
    'Review & Finalize',
  ];

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center">
        {[...Array(totalSteps).keys()].map((stepIndex) => {
          const stepNumber = stepIndex + 1;
          const isCompleted = stepNumber < currentStep;
          const isActive = stepNumber === currentStep;
          const isClickable = onStepClick !== null;

          return (
            <div 
              key={stepNumber}
              className={`flex flex-col items-center ${
                isCompleted ? 'text-green-500' : isActive ? 'text-blue-500' : 'text-muted-foreground'
              } ${isClickable ? 'cursor-pointer' : ''}`}
              onClick={isClickable ? () => onStepClick(stepNumber) : undefined}
              title={isClickable ? `Go to ${stepLabels[stepIndex]} step` : ''}
            >
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 ${
                  isCompleted 
                    ? 'bg-green-100 dark:bg-green-900/30 border-green-500' 
                    : isActive 
                      ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500' 
                      : 'bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-600'
                } border-2 ${isClickable ? 'hover:opacity-80' : ''}`}
              >
                {isCompleted ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              <span className="text-xs text-center">
                {stepLabels[stepIndex]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StepIndicator; 