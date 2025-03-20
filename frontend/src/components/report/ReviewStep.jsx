import React, { useState } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Spinner } from '../ui/spinner';
import { Textarea } from '../ui/textarea';

const ReviewStep = ({ navigate }) => {
  const { photos } = usePhotoContext();
  
  const {
    report,
    error,
    isSubmitting,
    generatingPdf,
    pdfUrl,
    handleChange,
    submitReport,
    generatePdf,
    prevStep
  } = useReportContext();

  const { user } = useAuth();
  
  const [isEditing, setIsEditing] = useState({
    summary: false,
    recommendations: false
  });

  // Toggle edit mode for a section
  const toggleEdit = (section) => {
    setIsEditing(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const reportId = await submitReport(user);
      if (reportId) {
        // Generate PDF automatically after submitting
        await generatePdf();
        navigate(`/reports/${reportId}`);
      }
    } catch (err) {
      console.error('Error submitting report:', err);
    }
  };

  // Handle manual PDF generation
  const handleGeneratePdf = async () => {
    try {
      // First ensure the report is submitted
      const reportId = await submitReport(user);
      
      if (reportId) {
        // Then generate the PDF
        await generatePdf();
      }
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Review Your Report</h2>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-red-700">
          <p>{error}</p>
        </div>
      )}
      
      {/* Basic Info Section */}
      <section>
        <Card className="p-5">
          <h3 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">Basic Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-500">Report Title</p>
              <p className="text-gray-900 dark:text-gray-100">{report.title}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500">Client Name</p>
              <p className="text-gray-900 dark:text-gray-100">{report.clientName}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500">Inspection Date</p>
              <p className="text-gray-900 dark:text-gray-100">{new Date(report.inspectionDate).toLocaleDateString()}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500">Property Address</p>
              <p className="text-gray-900 dark:text-gray-100">
                {report.propertyAddress?.street}, {report.propertyAddress?.city}, {report.propertyAddress?.state} {report.propertyAddress?.zipCode}
              </p>
            </div>
          </div>
        </Card>
      </section>
      
      {/* Photos Section */}
      <section>
        <Card className="p-5">
          <h3 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Photos
            <span className="ml-2 text-sm font-medium text-gray-500">{photos.length} photos</span>
          </h3>
          
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photos.map((photo, index) => (
                <div key={photo.id || photo._id || index} className="relative group">
                  <img 
                    src={photo.url || photo.preview} 
                    alt={`Photo ${index + 1}`} 
                    className="w-full h-32 object-cover rounded-md" 
                  />
                  {photo.analysis && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate">
                      {photo.analysis.description?.substring(0, 50)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No photos attached to this report.</p>
          )}
        </Card>
      </section>
      
      {/* AI Analysis Summary */}
      <section>
        <Card className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Report Summary</h3>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => toggleEdit('summary')}
            >
              {isEditing.summary ? 'Save' : 'Edit'}
            </Button>
          </div>
          
          {isEditing.summary ? (
            <Textarea
              name="summary"
              value={report.summary}
              onChange={handleChange}
              rows={6}
              className="w-full mb-4"
              placeholder="Enter or edit the report summary..."
            />
          ) : (
            <div className="prose dark:prose-invert max-w-none">
              {report.summary ? (
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{report.summary}</p>
              ) : (
                <p className="text-gray-500 italic">No summary available. Edit to add a summary.</p>
              )}
            </div>
          )}
          
          <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-medium text-gray-700 dark:text-gray-300">Recommendations</h4>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => toggleEdit('recommendations')}
              >
                {isEditing.recommendations ? 'Save' : 'Edit'}
              </Button>
            </div>
            
            {isEditing.recommendations ? (
              <Textarea
                name="recommendations"
                value={report.recommendations}
                onChange={handleChange}
                rows={4}
                className="w-full"
                placeholder="Enter recommendations..."
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                {report.recommendations ? (
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{report.recommendations}</p>
                ) : (
                  <p className="text-gray-500 italic">No recommendations available. Edit to add recommendations.</p>
                )}
              </div>
            )}
          </div>
        </Card>
      </section>
      
      {/* Navigation and Actions */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4">
        <Button 
          variant="outline" 
          onClick={prevStep}
        >
          Back
        </Button>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={handleGeneratePdf}
            disabled={isSubmitting || generatingPdf}
          >
            {generatingPdf ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Generating PDF...
              </>
            ) : (
              'Generate PDF'
            )}
          </Button>
          
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Submitting...
              </>
            ) : (
              'Submit Report'
            )}
          </Button>
        </div>
      </div>
      
      {/* PDF Download Link */}
      {pdfUrl && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded mt-4">
          <p className="text-green-700 mb-2">PDF Generated Successfully!</p>
          <a 
            href={pdfUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF Report
          </a>
        </div>
      )}
    </div>
  );
};

export default ReviewStep; 