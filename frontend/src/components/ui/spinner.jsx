import * as React from "react";
import { cn } from "../../lib/utils";

const Spinner = React.forwardRef(({ size = 'md', className, ...props }, ref) => {
  // Define size classes
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };
  
  return (
    <div 
      ref={ref}
      className={cn("flex justify-center items-center", className)}
      {...props}
    >
      <div className={cn(
        "animate-spin rounded-full border-t-2 border-b-2 border-primary", 
        sizeClasses[size]
      )}></div>
    </div>
  );
});

Spinner.displayName = "Spinner";

export { Spinner }; 