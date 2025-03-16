import React, { useState, useEffect } from 'react';
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
  
  const { photos, resetPhotoState } = usePhotoContext();
  
  // Local state for loading
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState(null);
  
  // Load existing report if editing
  useEffect(() => {
    if (isEditing && reportId) {
      const fetchReport = async () => {
        try {
          setLoading(true);
          const response = await getReport(reportId);
          const reportData = response.data || response;
          
          // Load report data into context
          loadReport(reportData);
          setLoading(false);
        } catch (err) {
          console.error('Failed to load report:', err);
          setError('Failed to load report. Please try again.');
          setLoading(false);
        }
      };
      
      fetchReport();
    } else {
      // Reset states for a new report
      resetReport();
      resetPhotoState();
    }
  }, [isEditing, reportId, loadReport, resetReport, resetPhotoState]);
  
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
  
  // Render loading state
  const renderLoading = () => (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      <span className="ml-3 text-gray-700 dark:text-gray-300">Loading report...</span>
    </div>
  );
  
  // Render the current step
  const renderStep = () => {
    if (loading) {
      return renderLoading();
    }
    
    switch (step) {
      case 1:
        return <BasicInfoStep />;
      case 2:
        return <PhotoUploadAnalysisStep />;
      case 3:
        return <ReviewStep navigate={navigate} />;
      default:
        return <div>Unknown step</div>;
    }
  };
  
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
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">{pageTitle}</h1>
      
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
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        {renderStep()}
      </div>
    </div>
  );
};

export default ReportBuilder; 