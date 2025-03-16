import React, { useState } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';

const ReviewStep = ({ user, navigate }) => {
  const { photos } = usePhotoContext();
  
  const {
    report,
    error,
    isSubmitting,
    generatingPdf,
    pdfUrl,
    handleChange,
    addDamage,
    updateDamage,
    removeDamage,
    generatePdf,
    submitReport,
    prevStep
  } = useReportContext();

  const { user: authUser } = useAuth();

  const [isEditing, setIsEditing] = useState({
    summary: false,
    recommendations: false,
    materials: false
  });

  // Toggle edit mode for a section
  const toggleEdit = (section) => {
    setIsEditing(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const reportId = await submitReport(user);
      if (reportId) {
        navigate(`/reports/${reportId}`);
      }
    } catch (err) {
      console.error('Error submitting report:', err);
    }
  };

  // Handle PDF generation
  const handleGeneratePdf = async () => {
    try {
      await generatePdf(user);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  // Format date for display
  const formattedDate = new Date(report.inspectionDate).toLocaleDateString();
  
  // Get photo statistics
  const totalPhotos = photos.length;
  const analyzedPhotos = photos.filter(p => p.analysis).length;
  const damagedPhotos = photos.filter(p => p.analysis && p.analysis.damageDetected).length;

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">Review & Submit</h3>
      
      {/* Error display */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
          <p>{error}</p>
        </div>
      )}
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Review your report before submission. You can go back to previous steps to make changes.
            </p>
          </div>
        </div>
      </div>
      
      {/* Report Summary */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Report Summary</h2>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Basic Info */}
          <div>
            <h3 className="text-md font-medium text-gray-900 dark:text-white mb-2">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Title</p>
                <p className="font-medium">{report.title}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Client</p>
                <p className="font-medium">{report.clientName}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Inspection Date</p>
                <p className="font-medium">{formattedDate}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Address</p>
                <p className="font-medium">
                  {report.propertyAddress.street}, {report.propertyAddress.city}, {report.propertyAddress.state} {report.propertyAddress.zipCode}
                </p>
              </div>
            </div>
          </div>
          
          {/* Photos */}
          <div>
            <h3 className="text-md font-medium text-gray-900 dark:text-white mb-2">Photos</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded text-center">
                <div className="text-xl font-bold">{totalPhotos}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Photos</div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded text-center">
                <div className="text-xl font-bold">{analyzedPhotos}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Analyzed</div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded text-center">
                <div className="text-xl font-bold">{damagedPhotos}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">With Damage</div>
              </div>
            </div>
          </div>
          
          {/* Summary */}
          {report.summary && (
            <div>
              <h3 className="text-md font-medium text-gray-900 dark:text-white mb-2">Summary</h3>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                {report.summary.length > 300 
                  ? `${report.summary.substring(0, 300)}...` 
                  : report.summary}
              </p>
            </div>
          )}
          
          {/* Damages */}
          {report.damages && report.damages.length > 0 && (
            <div>
              <h3 className="text-md font-medium text-gray-900 dark:text-white mb-2">
                Damages Identified ({report.damages.length})
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                {report.damages.map((damage, index) => (
                  <li key={index} className="text-gray-700 dark:text-gray-300">
                    {damage.type} ({damage.severity})
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Tags */}
          {report.tags && report.tags.length > 0 && (
            <div>
              <h3 className="text-md font-medium text-gray-900 dark:text-white mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {report.tags.map((tag, index) => (
                  <span key={index} className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex justify-between pt-4 mt-6 border-t">
        <button
          type="button"
          onClick={prevStep}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
        >
          Back
        </button>
        
        <button
          type="button"
          onClick={() => handleSubmit(authUser)}
          disabled={isSubmitting}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50 flex items-center"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Submitting...
            </>
          ) : 'Submit Report'}
        </button>
      </div>
    </div>
  );
};

export default ReviewStep; 