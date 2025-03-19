import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReportContext } from '../context/ReportContext';
import { usePhotoContext } from '../context/PhotoContext';
import { useAuth } from '../context/AuthContext';
import { getReport } from '../services/reportService';

// Import the steps
import BasicInfoStep from '../components/report/BasicInfoStep';
import PhotoUploadAnalysisStep from '../components/report/PhotoUploadAnalysisStep';
import ReviewStep from '../components/report/ReviewStep';
import StepIndicator from '../components/report/StepIndicator';

// Import UI components
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';

const ReportBuilder = ({ isEditing = false }) => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Get context values
  const {
    report,
    step,
    error: reportError,
    loadReport,
    submitReport,
    resetReport,
    nextStep,
    prevStep,
    goToStep
  } = useReportContext();
  
  const { photos, clearPhotos } = usePhotoContext();
  
  // Local state for loading
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState(null);
  
  // Track initialization state
  const isInitialized = React.useRef(false);

  // Load existing report if editing
  useEffect(() => {
    // Prevent double initialization
    if (isInitialized.current) return;
    isInitialized.current = true;

    if (isEditing && reportId) {
      const fetchReport = async () => {
        try {
          setLoading(true);
          const response = await getReport(reportId);
          const reportData = response.data || response;
          
          // Only update if we have new data
          if (reportData && (!report._id || report._id !== reportData._id)) {
            loadReport(reportData);
          }
        } catch (err) {
          console.error('Failed to load report:', err);
          setError('Failed to load report. Please try again.');
        } finally {
          setLoading(false);
        }
      };
      
      fetchReport();
    } else if (!isEditing) {
      // Only reset if we're not already in the default state and not editing
      const needsReset = report.title !== '' || report.clientName !== '' || photos.length > 0;
      if (needsReset) {
        // Use Promise to ensure sequential execution
        Promise.resolve()
          .then(() => resetReport())
          .then(() => clearPhotos());
      }
    }
  }, []);  // Empty dependency array since we use ref for initialization
  
  // Handle form submission
  const handleSubmit = async () => {
    if (!user) return;
    
    try {
      // Submit the report
      const reportId = await submitReport(user);
      
      if (reportId) {
        // Navigate to the report viewer
        navigate(`/reports/${reportId}`);
      }
    } catch (err) {
      console.error('Failed to submit report:', err);
      setError('Failed to submit report. Please try again.');
    }
  };
  
  // Handle back button click
  const handleBack = () => {
    // If we're beyond the first step, use prevStep instead of navigating away
    if (step > 1) {
      prevStep();
    } else {
      navigate('/');
    }
  };
  
  // Render loading state
  const renderLoading = () => (
    <div className="flex justify-center items-center h-64">
      <Spinner />
      <span className="ml-3 text-gray-700 dark:text-gray-300">Loading report...</span>
    </div>
  );
  
  // Memoize the steps to prevent unnecessary re-renders
  const currentStep = useMemo(() => {
    if (loading) {
      return renderLoading();
    }
    
    // Use a stable key that doesn't change on every render
    // For new reports, use 'new-report' + step, for existing reports use report._id + step
    const stableKey = report?._id ? `${report._id}-step-${step}` : `new-report-step-${step}`;
    
    switch (step) {
      case 1:
        // Pass the user object to BasicInfoStep
        return <BasicInfoStep key={stableKey} />;
      case 2:
        return <PhotoUploadAnalysisStep key={stableKey} />;
      case 3:
        return <ReviewStep navigate={navigate} key={stableKey} />;
      default:
        return <div>Unknown step</div>;
    }
  }, [loading, step, navigate, renderLoading, report]);
  
  // Title based on editing mode
  const pageTitle = isEditing 
    ? `Edit Report: ${report.title || ''}` 
    : 'Create New Report';
  
  // Steps labels
  const steps = [
    { label: 'Basic Info', number: 1 },
    { label: 'Photos & Analysis', number: 2 },
    { label: 'Review & Submit', number: 3 }
  ];
  
  return (
    <div className="max-w-5xl mx-auto pb-10">
      <div className="flex items-center mb-6">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleBack}
          className="mr-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
          </svg>
          Back
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{pageTitle}</h1>
      </div>
      
      {(error || reportError) && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded">
          <p className="font-medium">{error || reportError}</p>
        </div>
      )}
      
      <div className="mb-8">
        <StepIndicator 
          steps={steps} 
          currentStep={step} 
          onStepClick={goToStep} 
        />
      </div>
      
      <Card className="p-6">
        {currentStep}
      </Card>
    </div>
  );
};

export default ReportBuilder; 