import { useState } from 'react';
import { shareReport, revokeReportShare } from '../../services/reportService';

const ReportSharing = ({ reportId, existingShareUrl = null, existingExpiry = null }) => {
  const [shareUrl, setShareUrl] = useState(existingShareUrl);
  const [expiry, setExpiry] = useState(existingExpiry ? new Date(existingExpiry) : null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showConfirmRevoke, setShowConfirmRevoke] = useState(false);

  const handleGenerateLink = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await shareReport(reportId);
      
      setShareUrl(response.data.shareUrl);
      setExpiry(new Date(response.data.shareExpiry));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate sharing link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeLink = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await revokeReportShare(reportId);
      
      setShareUrl(null);
      setExpiry(null);
      setShowConfirmRevoke(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to revoke sharing link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  const formatExpiryDate = (date) => {
    if (!date) return '';
    
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return new Date(date).toLocaleDateString(undefined, options);
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold mb-4">Share Report</h3>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {!shareUrl ? (
        <div>
          <p className="text-gray-600 mb-4">
            Generate a link to share this report with clients or colleagues.
            The link will be valid for 30 days.
          </p>
          
          <button
            onClick={handleGenerateLink}
            disabled={isLoading}
            className={`w-full px-4 py-2 rounded font-medium ${
              isLoading
                ? 'bg-gray-300 text-gray-700 cursor-not-allowed'
                : 'bg-primary/90 hover:bg-primary/80 text-primary-foreground border border-primary/20'
            }`}
          >
            {isLoading ? 'Generating...' : 'Generate Sharing Link'}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Sharing Link:</span>
          </div>
          
          <div className="flex mb-4">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-grow p-2 border border-gray-300 rounded-l-md bg-gray-50"
            />
            
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-r-md"
            >
              {copied ? (
                <span className="text-green-600">Copied!</span>
              ) : (
                <span>Copy</span>
              )}
            </button>
          </div>
          
          {expiry && (
            <p className="text-sm text-gray-600 mb-4">
              This link will expire on {formatExpiryDate(expiry)}
            </p>
          )}
          
          {!showConfirmRevoke ? (
            <button
              onClick={() => setShowConfirmRevoke(true)}
              className="w-full px-4 py-2 border border-red-300 text-red-600 rounded font-medium hover:bg-red-50"
            >
              Revoke Sharing Link
            </button>
          ) : (
            <div className="border border-red-200 rounded-md p-3 bg-red-50">
              <p className="text-red-600 mb-3">
                Are you sure you want to revoke this sharing link? 
                Anyone with the link will no longer be able to access the report.
              </p>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowConfirmRevoke(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  Cancel
                </button>
                
                <button
                  onClick={handleRevokeLink}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  {isLoading ? 'Revoking...' : 'Confirm Revoke'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportSharing; 