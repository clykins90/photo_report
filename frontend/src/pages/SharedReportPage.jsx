import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSharedReport } from '../services/reportService';

const SharedReportPage = () => {
  const { token } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSharedReport = async () => {
      try {
        setLoading(true);
        const response = await getSharedReport(token);
        setReport(response.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load shared report');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedReport();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-red-500 text-center mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-center mb-4">Error Loading Report</h1>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <p className="text-gray-600 text-center mb-6">
            This link may have expired or been revoked by the owner.
          </p>
          <div className="text-center">
            <Link to="/" className="text-blue-500 hover:underline">
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h1 className="text-2xl font-bold text-center mb-4">Report Not Found</h1>
          <p className="text-gray-600 text-center mb-6">
            The report you're looking for doesn't exist or has been removed.
          </p>
          <div className="text-center">
            <Link to="/" className="text-blue-500 hover:underline">
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Company Header */}
          {report.company && (
            <div className="bg-gray-800 text-white p-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold">{report.company.name}</h1>
                  <p className="text-gray-300">{report.company.phone} | {report.company.email}</p>
                </div>
                {report.company.logoUrl && (
                  <img 
                    src={`${import.meta.env.VITE_API_URL}/${report.company.logoUrl}`} 
                    alt={`${report.company.name} logo`}
                    className="h-16 w-auto"
                  />
                )}
              </div>
            </div>
          )}
          
          {/* Report Header */}
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold mb-4">{report.title}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Client Information</h3>
                <p><span className="font-medium">Client:</span> {report.clientName}</p>
                
                {report.propertyAddress && (
                  <p>
                    <span className="font-medium">Property Address:</span> 
                    {report.propertyAddress.street}, {report.propertyAddress.city}, {report.propertyAddress.state} {report.propertyAddress.zipCode}
                  </p>
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Inspection Details</h3>
                <p>
                  <span className="font-medium">Date:</span> 
                  {new Date(report.inspectionDate).toLocaleDateString()}
                </p>
                
                {report.weather && report.weather.conditions && (
                  <p>
                    <span className="font-medium">Weather:</span> 
                    {report.weather.conditions}
                    {report.weather.temperature && `, ${report.weather.temperature}°`}
                    {report.weather.windSpeed && `, Wind: ${report.weather.windSpeed}`}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {/* Summary */}
          {report.summary && (
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold mb-2">Summary</h3>
              <p className="text-gray-700">{report.summary}</p>
            </div>
          )}
          
          {/* Damages */}
          {report.damages && report.damages.length > 0 && (
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold mb-4">Damages Identified</h3>
              
              <div className="space-y-4">
                {report.damages.map((damage, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center mb-2">
                      <h4 className="text-md font-semibold">{damage.type}</h4>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                        damage.severity === 'severe' ? 'bg-red-100 text-red-800' :
                        damage.severity === 'moderate' ? 'bg-orange-100 text-orange-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {damage.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-700">{damage.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Photos */}
          {report.photos && report.photos.length > 0 && (
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold mb-4">Photo Documentation</h3>
              
              {/* Group photos by section */}
              {Object.entries(
                report.photos.reduce((acc, photo) => {
                  const section = photo.section || 'Uncategorized';
                  if (!acc[section]) acc[section] = [];
                  acc[section].push(photo);
                  return acc;
                }, {})
              ).map(([section, photos]) => (
                <div key={section} className="mb-6">
                  <h4 className="text-md font-semibold mb-3">{section}</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {photos.map((photo, photoIndex) => (
                      <div key={photoIndex} className="border rounded-lg overflow-hidden">
                        <img 
                          src={`${import.meta.env.VITE_API_URL}/${photo.path}`} 
                          alt={`Photo ${photoIndex + 1}`}
                          className="w-full h-48 object-cover"
                        />
                        
                        <div className="p-3">
                          {photo.aiAnalysis && (
                            <div className="mb-2">
                              {photo.aiAnalysis.damageDetected ? (
                                <div>
                                  <div className="flex items-center">
                                    <span className="font-medium">Damage Type:</span>
                                    <span className="ml-1">{photo.aiAnalysis.damageType || 'Unknown'}</span>
                                    
                                    {photo.aiAnalysis.severity && (
                                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                        photo.aiAnalysis.severity === 'severe' ? 'bg-red-100 text-red-800' :
                                        photo.aiAnalysis.severity === 'moderate' ? 'bg-orange-100 text-orange-800' :
                                        'bg-yellow-100 text-yellow-800'
                                      }`}>
                                        {photo.aiAnalysis.severity.toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <p className="text-sm text-gray-700 mt-1">
                                    {photo.aiAnalysis.description}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-sm text-green-600">No damage detected</p>
                              )}
                              
                              {photo.aiAnalysis.tags && photo.aiAnalysis.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {photo.aiAnalysis.tags.map((tag, tagIndex) => (
                                    <span key={tagIndex} className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          
                          {photo.userDescription && (
                            <div className="mt-2">
                              <span className="font-medium text-sm">Note:</span>
                              <p className="text-sm text-gray-700 italic">{photo.userDescription}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Recommendations */}
          {report.recommendations && (
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Recommendations</h3>
              <p className="text-gray-700">{report.recommendations}</p>
            </div>
          )}
          
          {/* PDF Download */}
          {report.pdfPath && (
            <div className="p-6 bg-gray-50 border-t">
              <a 
                href={`${import.meta.env.VITE_API_URL}/${report.pdfPath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                Download PDF Report
              </a>
            </div>
          )}
        </div>
        
        <div className="mt-6 text-center text-gray-500 text-sm">
          This report was shared with you via a secure link. For questions, please contact the report owner.
        </div>
      </div>
    </div>
  );
};

export default SharedReportPage; 