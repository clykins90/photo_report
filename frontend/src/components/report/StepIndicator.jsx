import React from 'react';

const StepIndicator = ({ steps, currentStep, onStepClick }) => {
  // Default steps if not provided
  const defaultSteps = [
    { number: 1, label: 'Basic Info' },
    { number: 2, label: 'Photos & Analysis' },
    { number: 3, label: 'Review & Submit' }
  ];

  // Use provided steps or fallback to default
  const displaySteps = steps || defaultSteps;
  
  return (
    <div className="flex items-center justify-between w-full">
      {displaySteps.map((step, index) => {
        // Determine if this step is active, completed, or upcoming
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;
        const isClickable = onStepClick && (isCompleted || step.number === currentStep);
        
        // Determine the styling based on step status
        const circleClasses = `
          h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium
          ${isActive ? 'bg-blue-600 text-white' : ''}
          ${isCompleted ? 'bg-green-500 text-white' : ''}
          ${!isActive && !isCompleted ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : ''}
          ${isClickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}
        `;
        
        // Line that connects steps
        const lineClasses = `
          flex-1 h-0.5 mx-2
          ${index < displaySteps.length - 1 ? 'block' : 'hidden'}
          ${isCompleted && displaySteps[index + 1] && displaySteps[index + 1].number <= currentStep 
            ? 'bg-green-500' 
            : 'bg-gray-300 dark:bg-gray-600'}
        `;
        
        return (
          <React.Fragment key={step.number}>
            <div className="flex flex-col items-center">
              <div 
                className={circleClasses}
                onClick={() => isClickable ? onStepClick(step.number) : null}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
              >
                {isCompleted ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span className="mt-2 text-xs text-gray-600 dark:text-gray-400 font-medium">
                {step.label}
              </span>
            </div>
            
            <div className={lineClasses}></div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default StepIndicator; 