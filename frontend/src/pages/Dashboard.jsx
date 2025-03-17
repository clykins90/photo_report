import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getReports, deleteReport } from '../services/reportService';

// Import from ui component library instead of using inline components
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Spinner } from '../components/ui/spinner';

// Report card component
const ReportCard = ({ report, onDelete }) => {
  // Format the date
  const formattedDate = new Date(report.inspectionDate).toLocaleDateString();
  
  // Get photo count
  const photoCount = report.photos?.length || 0;
  
  // Get status badge class
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'complete':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };
  
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
      <CardContent className="p-5">
        <CardTitle className="text-lg mb-2 truncate">
          {report.title}
        </CardTitle>
        
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Client: {report.clientName}
        </p>
        
        <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-4">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {formattedDate}
          
          <span className="mx-2">•</span>
          
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {photoCount} photos
        </div>
        
        <div className="flex flex-wrap gap-1 mb-4">
          {report.status && (
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(report.status)}`}>
              {report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1) : 'Unknown'}
            </span>
          )}
          {report.tags && report.tags.slice(0, 3).map((tag, index) => (
            <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
              {tag}
            </span>
          ))}
          {report.tags && report.tags.length > 3 && (
            <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
              +{report.tags.length - 3} more
            </span>
          )}
        </div>
        
        <div className="flex justify-between items-center">
          <div className="space-x-2">
            <Button 
              variant="outline"
              size="sm"
              asChild
            >
              <Link to={`/reports/edit/${report._id}`}>
                Edit
              </Link>
            </Button>
            <Button 
              variant="destructive"
              size="sm"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this report?')) {
                  onDelete(report._id);
                }
              }}
            >
              Delete
            </Button>
          </div>
          
          <Button 
            variant="default"
            size="sm"
            asChild
          >
            <Link to={`/reports/${report._id}`}>
              View
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Fetch reports on component mount
  useEffect(() => {
    fetchReports();
  }, []);
  
  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await getReports();
      const data = response.data || response;
      
      // Sort by date (newest first)
      const sortedReports = data.sort((a, b) => 
        new Date(b.createdAt || b.inspectionDate) - new Date(a.createdAt || a.inspectionDate)
      );
      
      setReports(sortedReports);
      setFilteredReports(sortedReports);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
      setError('Failed to load reports. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (id) => {
    try {
      await deleteReport(id);
      const updatedReports = reports.filter(report => report._id !== id);
      setReports(updatedReports);
      setFilteredReports(filteredReports.filter(report => report._id !== id));
    } catch (err) {
      console.error('Failed to delete report:', err);
      setError('Failed to delete report. Please try again later.');
    }
  };
  
  // Filter reports when search term or filter status changes
  useEffect(() => {
    let results = reports;
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter(report => 
        report.title?.toLowerCase().includes(term) ||
        report.clientName?.toLowerCase().includes(term) ||
        (report.propertyAddress?.street && report.propertyAddress.street.toLowerCase().includes(term)) ||
        (report.tags && report.tags.some(tag => tag.toLowerCase().includes(term)))
      );
    }
    
    // Apply status filter
    if (filterStatus !== 'all') {
      results = results.filter(report => {
        if (filterStatus === 'complete' || filterStatus === 'completed') {
          return report.status === 'complete' || (!report.isDraft && !report.status);
        } else if (filterStatus === 'draft') {
          return report.status === 'draft' || report.isDraft;
        } else if (filterStatus === 'submitted') {
          return report.status === 'submitted';
        }
        return true;
      });
    }
    
    setFilteredReports(results);
  }, [searchTerm, filterStatus, reports]);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Reports</h1>
        
        <Button asChild>
          <Link to="/reports/new">
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Report
          </Link>
        </Button>
      </div>
      
      {/* Search and filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-grow relative">
          <Input
            type="text"
            placeholder="Search reports..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10"
          />
          <svg className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <div className="w-full sm:w-48">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="all">All Reports</option>
            <option value="complete">Completed</option>
            <option value="draft">Drafts</option>
            <option value="submitted">Submitted</option>
          </select>
        </div>
        
        <Button variant="secondary" onClick={fetchReports}>
          Refresh
        </Button>
      </div>
      
      {/* Reports list */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
          <p>{error}</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <Card className="p-8 text-center">
          {searchTerm || filterStatus !== 'all' ? (
            <>
              <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-white">No matching reports found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Try changing your search or filter criteria.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-white">No reports yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first report to get started.</p>
              <Button asChild>
                <Link to="/reports/new">
                  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Report
                </Link>
              </Button>
            </>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map(report => (
            <ReportCard 
              key={report._id} 
              report={report} 
              onDelete={handleDeleteReport} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard; 