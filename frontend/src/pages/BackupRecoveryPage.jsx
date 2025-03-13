import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackupReportData, clearBackupReportData } from '../utils/reportBackup';

const BackupRecoveryPage = () => {
  const [backupData, setBackupData] = useState(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const backup = getBackupReportData();
    setBackupData(backup);
  }, []);

  // Copy backup data to clipboard
  const handleCopyToClipboard = () => {
    if (!backupData) return;
    
    try {
      const dataStr = JSON.stringify(backupData, null, 2);
      navigator.clipboard.writeText(dataStr);
      setCopied(true);
      
      // Reset "copied" status after 3 seconds
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Clear backup data
  const handleClearBackup = () => {
    if (window.confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
      clearBackupReportData();
      setBackupData(null);
    }
  };

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };

  // Navigate back to create report page
  const handleCreateNewReport = () => {
    navigate('/reports/new');
  };

  if (!backupData) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Backup Recovery</h1>
        <div className="bg-gray-100 p-8 rounded-lg shadow">
          <p className="text-lg mb-4">No backup report data found.</p>
          <p className="mb-6">There is no saved report data to recover. Backups are automatically created when you submit a report or generate an AI summary.</p>
          <button
            onClick={() => navigate('/reports')}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Return to Reports
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Backup Recovery</h1>
      
      <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-6">
        <h2 className="font-bold">Backup Found</h2>
        <p>Created: {formatDate(backupData.timestamp)}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Report Information</h2>
          {backupData.reportData && (
            <div>
              <p><strong>Title:</strong> {backupData.reportData.title || 'Not specified'}</p>
              <p><strong>Client:</strong> {backupData.reportData.clientName || 'Not specified'}</p>
              <p><strong>Date:</strong> {backupData.reportData.inspectionDate || 'Not specified'}</p>
              <p>
                <strong>Photos:</strong> {
                  (backupData.photos && backupData.photos.length) || 0
                } uploaded
              </p>
              <p className="mt-2">
                <strong>Summary:</strong> {
                  backupData.reportData.summary 
                    ? `${backupData.reportData.summary.substring(0, 100)}...` 
                    : 'Not available'
                }
              </p>
            </div>
          )}
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Recovery Options</h2>
          <div className="flex flex-col space-y-4">
            <button
              onClick={handleCopyToClipboard}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
            >
              {copied ? '✓ Copied!' : 'Copy Data to Clipboard'}
            </button>
            
            <button
              onClick={handleCreateNewReport}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Go to Report Form
            </button>
            
            <button
              onClick={handleClearBackup}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
            >
              Delete Backup
            </button>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-bold mb-4">Raw Backup Data</h2>
        <div className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
          <pre className="text-xs whitespace-pre-wrap">
            {JSON.stringify(backupData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default BackupRecoveryPage; 