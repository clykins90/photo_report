import { useNavigate } from 'react-router-dom';
import ReportForm from '../components/report/ReportForm';

const CreateReportPage = () => {
  const navigate = useNavigate();
  
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
      
      <h1 className="text-2xl font-bold mb-6">Create New Report</h1>
      
      <ReportForm />
    </div>
  );
};

export default CreateReportPage; 