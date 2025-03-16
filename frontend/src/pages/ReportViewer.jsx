import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getReport, generateReportPdf } from '../services/reportService';

// Import UI components
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';

const ReportViewer = () => {
  const { reportId } = useParams();
  const { user } = useAuth();
  
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  
  // Fetch report data
  useEffect(() => {
    const fetchReport = async () => {
      if (!reportId) return;
      
      try {
        setLoading(true);
        const response = await getReport(reportId);
        const reportData = response.data || response;
        setReport(reportData);
      } catch (err) {
        console.error('Failed to load report:', err);
        setError('Failed to load report. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchReport();
  }, [reportId]);
  
  // Generate PDF handler
  const handleGeneratePdf = async () => {
    if (!reportId || !user) return;
    
    try {
      setGeneratingPdf(true);
      setError(null);
      
      const response = await generateReportPdf(reportId);
      
      // Get the PDF URL from the response
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const pdfUrl = response.data.pdfUrl.startsWith('http') 
        ? response.data.pdfUrl 
        : `${baseURL}${response.data.pdfUrl}`;
      
      setPdfUrl(pdfUrl);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
          <p>{error}</p>
        </div>
      </div>
    );
  }
  
  if (!report) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-xl font-semibold mb-4">Report not found</h2>
        <Button asChild>
          <Link to="/">
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }
  
  // Format inspection date
  const formattedDate = new Date(report.inspectionDate).toLocaleDateString();
  
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{report.title}</h1>
        
        <div className="flex space-x-2">
          <Button variant="secondary" asChild>
            <Link to={`/reports/edit/${reportId}`}>
              Edit Report
            </Link>
          </Button>
          
          <Button
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
          >
            {generatingPdf ? 'Generating PDF...' : 'Generate PDF'}
          </Button>
          
          {pdfUrl && (
            <Button variant="success" asChild>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                Download PDF
              </a>
            </Button>
          )}
        </div>
      </div>
      
      {/* Report Content */}
      <Card>
        <CardContent className="p-6">
          {/* Basic Information */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Basic Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Client</p>
                <p className="font-medium">{report.clientName}</p>
              </div>
              
              <div>
                <p className="text-gray-600 dark:text-gray-400">Inspection Date</p>
                <p className="font-medium">{formattedDate}</p>
              </div>
              
              <div className="md:col-span-2">
                <p className="text-gray-600 dark:text-gray-400">Property Address</p>
                <p className="font-medium">
                  {report.propertyAddress?.street}, {report.propertyAddress?.city}, {report.propertyAddress?.state} {report.propertyAddress?.zipCode}
                </p>
              </div>
              
              {report.description && (
                <div className="md:col-span-2">
                  <p className="text-gray-600 dark:text-gray-400">Description</p>
                  <p>{report.description}</p>
                </div>
              )}
            </div>
          </section>
          
          {/* Photos Section */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Photos & Analysis</h2>
            
            {report.photos && report.photos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {report.photos.map((photo, index) => (
                  <Card key={photo._id || index} className="overflow-hidden">
                    <img 
                      src={photo.url} 
                      alt={`Photo ${index + 1}`} 
                      className="w-full h-48 object-cover"
                    />
                    <CardContent className="p-3">
                      <h3 className="font-medium mb-1">
                        {photo.title || `Photo ${index + 1}`}
                      </h3>
                      
                      {photo.analysisResults && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <p>Condition: {photo.analysisResults.condition || 'N/A'}</p>
                          <p>Issues: {photo.analysisResults.issues?.join(', ') || 'None detected'}</p>
                        </div>
                      )}
                      
                      {photo.notes && (
                        <p className="text-sm mt-2 italic">
                          "{photo.notes}"
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">No photos available for this report.</p>
            )}
          </section>
          
          {/* Findings & Recommendations */}
          {(report.findings || report.recommendations) && (
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 border-b pb-2">Findings & Recommendations</h2>
              
              {report.findings && (
                <div className="mb-4">
                  <h3 className="font-medium mb-2">Findings</h3>
                  <p>{report.findings}</p>
                </div>
              )}
              
              {report.recommendations && (
                <div>
                  <h3 className="font-medium mb-2">Recommendations</h3>
                  <p>{report.recommendations}</p>
                </div>
              )}
            </section>
          )}
          
          {/* Additional Information */}
          {report.additionalInfo && (
            <section>
              <h2 className="text-xl font-semibold mb-4 border-b pb-2">Additional Information</h2>
              <p>{report.additionalInfo}</p>
            </section>
          )}
        </CardContent>
      </Card>
      
      <div className="mt-6 flex justify-between">
        <Button variant="outline" asChild>
          <Link to="/">
            Back to Dashboard
          </Link>
        </Button>
        
        {!pdfUrl && (
          <Button 
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
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
        )}
      </div>
    </div>
  );
};

export default ReportViewer; 