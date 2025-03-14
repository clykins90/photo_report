import React, { useState, useEffect } from 'react';
import { uploadBatchPhotos, getPhotoUrl } from '../services/photoService';
import { getReports } from '../services/reportService';

const PhotoUploadTest = () => {
  const [files, setFiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch reports on component mount
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const response = await getReports();
        if (response.success) {
          setReports(response.data);
          if (response.data.length > 0) {
            setSelectedReportId(response.data[0]._id);
          }
        } else {
          console.error('Failed to fetch reports:', response.error);
        }
      } catch (error) {
        console.error('Error fetching reports:', error);
      }
    };

    fetchReports();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleReportChange = (e) => {
    setSelectedReportId(e.target.value);
  };

  const handleUpload = async () => {
    if (!selectedReportId) {
      setUploadStatus('Please select a report');
      return;
    }

    if (files.length === 0) {
      setUploadStatus('Please select files to upload');
      return;
    }

    setUploadStatus('Uploading...');
    setUploadProgress(0);

    try {
      const result = await uploadBatchPhotos(
        files, 
        selectedReportId,
        (progress) => setUploadProgress(progress)
      );

      if (result.success) {
        setUploadStatus(`Successfully uploaded ${result.photos.length} photos`);
        setUploadedPhotos(result.photos);
        setFiles([]);
      } else {
        setUploadStatus(`Upload failed: ${result.error}`);
      }
    } catch (error) {
      setUploadStatus(`Error: ${error.message}`);
      console.error('Upload error:', error);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Photo Upload Test</h2>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Report
        </label>
        <select
          value={selectedReportId}
          onChange={handleReportChange}
          className="w-full p-2 border border-gray-300 rounded-md"
        >
          <option value="">-- Select a Report --</option>
          {reports.map((report) => (
            <option key={report._id} value={report._id}>
              {report.title || report._id}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Photos
        </label>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileChange}
          className="w-full p-2 border border-gray-300 rounded-md"
        />
        <div className="mt-2 text-sm text-gray-500">
          Selected files: {files.length}
        </div>
      </div>

      <button
        onClick={handleUpload}
        disabled={!selectedReportId || files.length === 0}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        Upload Photos
      </button>

      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-1">{uploadProgress}% uploaded</p>
        </div>
      )}

      {uploadStatus && (
        <div className="mt-4 p-3 bg-gray-100 rounded-md">
          <p>{uploadStatus}</p>
        </div>
      )}

      {uploadedPhotos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Uploaded Photos</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {uploadedPhotos.map((photo) => (
              <div key={photo._id} className="border rounded-md overflow-hidden">
                <img
                  src={getPhotoUrl(photo, 'thumbnail')}
                  alt={photo.originalName}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2 text-xs truncate">
                  {photo.originalName}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoUploadTest; 