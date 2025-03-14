import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { generateReportPdf } from '../../services/reportService';
import { getPhotoUrl } from '../../services/photoService';

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
              className="bg-primary/90 hover:bg-primary/80 text-primary-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline border border-primary/20"
            >
              Edit
            </button>
            
            <button
              onClick={handleDelete}
              className="bg-destructive/90 hover:bg-destructive/80 text-destructive-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline border border-destructive/20"
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
                // Use the getPhotoUrl helper to get the correct URL
                const photoUrl = getPhotoUrl(photo);
                
                // Log for debugging
                console.log(`Photo ${index}:`, { 
                  photo,
                  photoUrl,
                  aiAnalysis: photo.aiAnalysis // Log aiAnalysis to verify we have it
                });
                
                return (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <img 
                      src={photoUrl}
                      alt={`Property photo ${index + 1}`}
                      className="w-full h-48 object-cover"
                      onError={(e) => {
                        console.error(`Failed to load photo: ${photoUrl}`);
                        // Fallback to placeholder
                        e.target.src = '/placeholder-image.png';
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
                      
                      <p className="text-xs text-foreground mt-1">Filename: {photo.filename || 'Unknown'}</p>
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
            
            <div>
              {!pdfUrl ? (
                <button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  className={`bg-primary/90 hover:bg-primary/80 text-primary-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline border border-primary/20 ${
                    isGeneratingPdf ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isGeneratingPdf ? 'Generating PDF...' : 'Generate PDF'}
                </button>
              ) : (
                <a
                  href={pdfUrl}
                  download={`${report.title.replace(/\s+/g, '_')}_Report.pdf`}
                  className="bg-primary/90 hover:bg-primary/80 text-primary-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline border border-primary/20"
                >
                  Download PDF
                </a>
              )}
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportDetail; 