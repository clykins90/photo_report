import React, { useState } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Spinner } from '../ui/spinner';

const ReviewStep = ({ navigate }) => {
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
      const reportId = await submitReport(authUser);
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
      await generatePdf(report._id);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Review Your Report</h2>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-red-700">
          <p>{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        {/* Basic Info Section */}
        <section className="mb-8">
          <Card className="p-5">
            <h3 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">Basic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Report Title</p>
                <p className="text-gray-900 dark:text-gray-100">{report.title}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Client Name</p>
                <p className="text-gray-900 dark:text-gray-100">{report.clientName}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Inspection Date</p>
                <p className="text-gray-900 dark:text-gray-100">{new Date(report.inspectionDate).toLocaleDateString()}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Property Address</p>
                <p className="text-gray-900 dark:text-gray-100">
                  {report.propertyAddress?.street}, {report.propertyAddress?.city}, {report.propertyAddress?.state} {report.propertyAddress?.zipCode}
                </p>
              </div>
              
              {report.weather?.conditions && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Weather Conditions</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {report.weather.conditions}, {report.weather.temperature ? `${report.weather.temperature}, ` : ''}
                    {report.weather.windSpeed ? `Wind: ${report.weather.windSpeed}` : ''}
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-4">
              <Button 
                variant="outline" 
                size="sm" 
                type="button" 
                onClick={() => prevStep()}
              >
                Edit Basic Info
              </Button>
            </div>
          </Card>
        </section>
        
        {/* Photos Section */}
        <section className="mb-8">
          <Card className="p-5">
            <h3 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">
              Photos & Analysis
              <span className="ml-2 text-sm font-medium text-gray-500">{photos.length} photos</span>
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photos.map((photo, index) => (
                <div key={photo.id || index} className="relative group">
                  <img 
                    src={photo.url || photo.preview} 
                    alt={`Photo ${index + 1}`} 
                    className="w-full h-32 object-cover rounded-md" 
                  />
                  {photo.analysis && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate">
                      {photo.analysis.summary}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4">
              <Button 
                variant="outline" 
                size="sm" 
                type="button" 
                onClick={() => prevStep()}
              >
                Edit Photos & Analysis
              </Button>
            </div>
          </Card>
        </section>
        
        {/* Summary Section */}
        <section className="mb-8">
          <Card className="p-5">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Report Summary</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                type="button" 
                onClick={() => toggleEdit('summary')}
              >
                {isEditing.summary ? 'Done' : 'Edit'}
              </Button>
            </div>
            
            {isEditing.summary ? (
              <textarea
                name="summary"
                value={report.summary}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-background"
                rows={6}
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <p className="whitespace-pre-line text-gray-700 dark:text-gray-300">{report.summary || 'No summary provided.'}</p>
              </div>
            )}
          </Card>
        </section>
        
        {/* Damages Section */}
        {report.damages && report.damages.length > 0 && (
          <section className="mb-8">
            <Card className="p-5">
              <h3 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">Damage Findings</h3>
              
              <div className="space-y-4">
                {report.damages.map((damage, index) => (
                  <div key={index} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0 last:pb-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{damage.location}</p>
                    <p className="text-gray-700 dark:text-gray-300">{damage.description}</p>
                    {damage.severity && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Severity: <span className="font-medium">{damage.severity}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}
        
        {/* Materials Section */}
        <section className="mb-8">
          <Card className="p-5">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Materials & Methods</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                type="button" 
                onClick={() => toggleEdit('materials')}
              >
                {isEditing.materials ? 'Done' : 'Edit'}
              </Button>
            </div>
            
            {isEditing.materials ? (
              <textarea
                name="materials"
                value={report.materials}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-background"
                rows={4}
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <p className="whitespace-pre-line text-gray-700 dark:text-gray-300">{report.materials || 'No materials information provided.'}</p>
              </div>
            )}
          </Card>
        </section>
        
        {/* Recommendations Section */}
        <section className="mb-8">
          <Card className="p-5">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Recommendations</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                type="button" 
                onClick={() => toggleEdit('recommendations')}
              >
                {isEditing.recommendations ? 'Done' : 'Edit'}
              </Button>
            </div>
            
            {isEditing.recommendations ? (
              <textarea
                name="recommendations"
                value={report.recommendations}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-background"
                rows={4}
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <p className="whitespace-pre-line text-gray-700 dark:text-gray-300">{report.recommendations || 'No recommendations provided.'}</p>
              </div>
            )}
          </Card>
        </section>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mt-8">
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => prevStep()}
            >
              Previous Step
            </Button>
            
            <Button
              type="button"
              variant="secondary"
              onClick={handleGeneratePdf}
              disabled={generatingPdf || !report._id}
            >
              {generatingPdf ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating PDF...
                </>
              ) : 'Preview PDF'}
            </Button>
          </div>
          
          <Button
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Submitting...
              </>
            ) : 'Submit Report'}
          </Button>
        </div>
        
        {pdfUrl && (
          <div className="mt-4">
            <Card className="p-4">
              <p className="mb-2 text-gray-700 dark:text-gray-300">Your PDF is ready:</p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(pdfUrl, '_blank')}
                >
                  Open PDF
                </Button>
              </div>
            </Card>
          </div>
        )}
      </form>
    </div>
  );
};

export default ReviewStep; 