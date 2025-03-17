import React from 'react';
import { cn } from '../../lib/utils';

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
        const circleClasses = cn(
          "h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200",
          isActive ? "bg-primary text-primary-foreground" : "",
          isCompleted ? "bg-green-500 text-white" : "",
          !isActive && !isCompleted ? "bg-muted text-muted-foreground" : "",
          isClickable ? "cursor-pointer hover:opacity-90" : "cursor-default"
        );
        
        // Line that connects steps
        const lineClasses = cn(
          "flex-1 h-0.5 mx-2 transition-colors",
          index < displaySteps.length - 1 ? "block" : "hidden",
          isCompleted && displaySteps[index + 1] && displaySteps[index + 1].number <= currentStep 
            ? "bg-green-500" 
            : "bg-muted"
        );
        
        return (
          <React.Fragment key={step.number}>
            <div className="flex flex-col items-center">
              <div 
                className={circleClasses}
                onClick={() => isClickable ? onStepClick(step.number) : null}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                aria-label={`Step ${step.number}: ${step.label}`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span className={cn(
                "mt-2 text-xs font-medium",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
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