import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { generateReportPdf } from '../../services/reportService';
import ReportSharing from './ReportSharing';

const ReportDetail = ({ report, onDelete }) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(report?.pdfUrl || null);
  const [error, setError] = useState(null);
  
  const navigate = useNavigate();
  
  // Clean up blob URL when component unmounts or when pdfUrl changes
  useEffect(() => {
    // Store the current URL to revoke later
    const currentUrl = pdfUrl;
    
    // Cleanup function
    return () => {
      if (currentUrl && currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [pdfUrl]);
  
  const handleGeneratePdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setError(null);
      
      // Revoke previous blob URL if it exists
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
      
      // Need to modify the service call to get the binary data
      const response = await generateReportPdf(report._id);
      
      // Create a blob from the PDF data
      const blob = new Blob([response], { type: 'application/pdf' });
      // Create a URL for the blob
      const blobUrl = URL.createObjectURL(blob);
      
      setPdfUrl(blobUrl);
    } catch (err) {
      setError('Failed to generate PDF. Please try again.');
      console.error(err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };
  
  const handleEdit = () => {
    navigate(`/reports/${report._id}/edit`);
  };
  
  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this report?')) {
      onDelete(report._id);
    }
  };
  
  if (!report) {
    return <div className="text-center py-8 text-foreground">Loading report...</div>;
  }
  
  return (
    <div className="bg-card text-card-foreground rounded-lg shadow-md overflow-hidden">
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold text-foreground">{report.title}</h2>
          
          <div className="flex space-x-2">
            <button
              onClick={handleEdit}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Edit
            </button>
            
            <button
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Delete
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">Client Information</h3>
            <p><span className="font-medium text-foreground">Client:</span> <span className="text-foreground">{report.clientName}</span></p>
            
            {report.propertyAddress && (
              <p className="mt-1">
                <span className="font-medium text-foreground">Property:</span>{' '}
                <span className="text-foreground">
                {report.propertyAddress.street && (
                  <>
                    {report.propertyAddress.street}, {report.propertyAddress.city},{' '}
                    {report.propertyAddress.state} {report.propertyAddress.zipCode}
                  </>
                )}
                </span>
              </p>
            )}
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">Inspection Details</h3>
            <p>
              <span className="font-medium text-foreground">Date:</span>{' '}
              {new Date(report.inspectionDate).toLocaleDateString()}
            </p>
            
            {report.weather && report.weather.conditions && (
              <p className="mt-1">
                <span className="font-medium text-foreground">Weather:</span>{' '}
                {report.weather.conditions}
                {report.weather.temperature && ` (${report.weather.temperature}°F)`}
                {report.weather.windSpeed && `, Wind: ${report.weather.windSpeed} mph`}
              </p>
            )}
          </div>
        </div>
        
        {report.summary && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2 text-foreground">Summary</h3>
            <p className="whitespace-pre-line text-foreground">{report.summary}</p>
          </div>
        )}
        
        {report.damages && report.damages.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2 text-foreground">Damages Identified</h3>
            
            <div className="space-y-4">
              {report.damages.map((damage, index) => (
                <div 
                  key={index} 
                  className="border-l-4 pl-4 py-2" 
                  style={{ 
                    borderColor: damage.severity === 'severe' 
                      ? '#EF4444' 
                      : damage.severity === 'moderate' 
                        ? '#F59E0B' 
                        : '#10B981' 
                  }}
                >
                  <h4 className="font-medium text-foreground">
                    {damage.type} - <span className="capitalize text-foreground">{damage.severity}</span>
                  </h4>
                  {damage.description && <p className="mt-1 text-foreground">{damage.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {report.photos && report.photos.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-medium text-foreground">Photos ({report.photos.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {report.photos.map((photo, index) => {
                // Base API URL from environment or default
                const baseApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
                
                // Get filename or extract from path
                const originalFilename = photo.filename || 
                  (photo.path ? photo.path.split('/').pop() : `photo-${index}`);
                
                // Try to determine thumbnail filename - check if it already has thumb suffix
                const isThumbnail = originalFilename.includes('_thumb');
                
                // Generate thumbnail filename if it's not already a thumbnail
                const thumbnailFilename = isThumbnail ? 
                  originalFilename : 
                  originalFilename.replace(/\.(\w+)$/, '_thumb.$1');
                
                // Also try optimized version as a fallback
                const optimizedFilename = originalFilename.replace(/\.(\w+)$/, '_optimized.$1');
                
                // Build URLs with proper error handling
                const photoThumbUrl = `${baseApiUrl}/api/photos/${thumbnailFilename}`;
                const photoOptimizedUrl = `${baseApiUrl}/api/photos/${optimizedFilename}`;
                const photoOriginalUrl = `${baseApiUrl}/api/photos/${originalFilename}`;
                
                // Direct temp folder URLs as fallbacks
                const directThumbUrl = `${baseApiUrl}/temp/${thumbnailFilename}`;
                const directOptimizedUrl = `${baseApiUrl}/temp/${optimizedFilename}`;
                const directOriginalUrl = `${baseApiUrl}/temp/${originalFilename}`;
                
                // Add debugging
                console.log(`Photo ${index}:`, { 
                  originalFilename, 
                  thumbnailFilename,
                  optimizedFilename,
                  path: photo.path,
                  photoThumbUrl,
                  directThumbUrl,
                  aiAnalysis: photo.aiAnalysis // Log aiAnalysis to verify we have it
                });
                
                return (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <img 
                      src={photoThumbUrl}
                      alt={`Property photo ${index + 1}`}
                      className="w-full h-48 object-cover"
                      onError={(e) => {
                        // First fallback: Try direct temp URL for thumbnail
                        console.error(`Failed to load thumbnail: ${photoThumbUrl}`);
                        console.log(`Attempting to load from direct thumbnail URL: ${directThumbUrl}`);
                        e.target.onerror = (e2) => {
                          // Second fallback: Try optimized version from API
                          console.error(`Failed to load from direct thumbnail URL: ${directThumbUrl}`);
                          console.log(`Attempting to load optimized version: ${photoOptimizedUrl}`);
                          e2.target.onerror = (e3) => {
                            // Third fallback: Try direct optimized URL
                            console.error(`Failed to load optimized version: ${photoOptimizedUrl}`);
                            console.log(`Attempting to load from direct optimized URL: ${directOptimizedUrl}`);
                            e3.target.onerror = (e4) => {
                              // Fourth fallback: Try original version from API
                              console.error(`Failed to load from direct optimized URL: ${directOptimizedUrl}`);
                              console.log(`Attempting to load original version: ${photoOriginalUrl}`);
                              e4.target.onerror = (e5) => {
                                // Fifth fallback: Try direct original URL
                                console.error(`Failed to load original version: ${photoOriginalUrl}`);
                                console.log(`Attempting to load from direct original URL: ${directOriginalUrl}`);
                                e5.target.onerror = (e6) => {
                                  // Final fallback: Use placeholder
                                  console.error(`Failed to load from direct original URL: ${directOriginalUrl}`);
                                  e6.target.onerror = null;
                                  e6.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
                                };
                                e5.target.src = directOriginalUrl;
                              };
                              e4.target.src = photoOriginalUrl;
                            };
                            e3.target.src = directOptimizedUrl;
                          };
                          e2.target.src = photoOptimizedUrl;
                        };
                        e.target.src = directThumbUrl;
                      }}
                    />
                    <div className="p-3">
                      <p className="text-sm text-foreground">{photo.description || photo.userDescription || 'No description'}</p>
                      
                      {/* Display AI Analysis if available */}
                      {photo.aiAnalysis && (
                        <div className="mt-2 border-t pt-2">
                          <p className="text-xs font-medium text-blue-600 text-foreground">AI Analysis:</p>
                          {photo.aiAnalysis.damageDetected && (
                            <div className="mt-1">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                photo.aiAnalysis.severity === 'severe' ? 'bg-red-100 text-red-800' :
                                photo.aiAnalysis.severity === 'moderate' ? 'bg-orange-100 text-orange-800' :
                                'bg-green-100 text-green-800'
                              } text-foreground`}>
                                {photo.aiAnalysis.severity?.toUpperCase()}
                              </span>
                              {photo.aiAnalysis.damageType && (
                                <span className="ml-2 text-xs text-foreground">
                                  {photo.aiAnalysis.damageType}
                                </span>
                              )}
                            </div>
                          )}
                          {photo.aiAnalysis.description && (
                            <p className="text-xs text-foreground mt-1 line-clamp-2">
                              {photo.aiAnalysis.description}
                            </p>
                          )}
                        </div>
                      )}
                      
                      <p className="text-xs text-foreground mt-1">Filename: {originalFilename}</p>
                      <div className="mt-1 text-xs text-blue-500">
                        <a href={directThumbUrl} target="_blank" rel="noopener noreferrer">Direct Link</a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {report.recommendations && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2 text-foreground">Recommendations</h3>
            <p className="whitespace-pre-line text-foreground">{report.recommendations}</p>
          </div>
        )}
        
        <div className="mt-8 border-t pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-foreground">
                <span className="font-medium text-foreground">Status:</span>{' '}
                <span className={`capitalize ${
                  report.status === 'complete' 
                    ? 'text-green-600' 
                    : report.status === 'submitted' 
                      ? 'text-blue-600' 
                      : 'text-yellow-600'
                } text-foreground`}>
                  {report.status}
                </span>
              </p>
              
              <p className="text-foreground text-sm mt-1">
                Created: {new Date(report.createdAt).toLocaleDateString()}
              </p>
            </div>
            
            <div className="flex flex-col items-center md:items-end">
              {error && (
                <div className="text-red-500 mb-2 text-sm text-foreground">{error}</div>
              )}
              
              {pdfUrl ? (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </a>
              ) : (
                <button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  className={`${
                    isGeneratingPdf 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-blue-500 hover:bg-blue-700'
                  } text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline flex items-center`}
                >
                  {isGeneratingPdf ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Generate PDF
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
        
        {report && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Share Report</h2>
            <ReportSharing 
              reportId={report._id} 
              existingShareUrl={report.shareUrl} 
              existingExpiry={report.shareExpiry} 
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportDetail; 