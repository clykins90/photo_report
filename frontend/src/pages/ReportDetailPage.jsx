import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport, deleteReport } from '../services/reportService';
import ReportDetail from '../components/report/ReportDetail';

const ReportDetailPage = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { id } = useParams();
  const navigate = useNavigate();
  
  useEffect(() => {
    fetchReport();
  }, [id]);
  
  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await getReport(id);
      setReport(response.data);
    } catch (err) {
      setError('Failed to load report. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async (reportId) => {
    try {
      await deleteReport(reportId);
      navigate('/dashboard');
    } catch (err) {
      setError('Failed to delete report. Please try again.');
      console.error(err);
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <svg className="animate-spin h-8 w-8 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="ml-2 text-gray-500">Loading report...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-primary/90 hover:bg-primary/80 text-primary-foreground font-medium py-2 px-4 rounded focus:outline-none focus:shadow-outline border border-primary/20"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-blue-500 hover:text-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
          </svg>
          Back to Dashboard
        </button>
      </div>
      
      <ReportDetail report={report} onDelete={handleDelete} />
    </div>
  );
};

export default ReportDetailPage; 