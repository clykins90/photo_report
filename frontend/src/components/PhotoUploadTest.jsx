import React, { useState, useEffect } from 'react';
import PhotoSchema from '../../shared/schemas/photoSchema';
import { uploadPhotos, getPhotoUrl, analyzePhotos } from '../services/photoService';
import { getReports } from '../services/reportService';
import ProgressBar from './photo/components/ProgressBar';

const PhotoUploadTest = () => {
  const [files, setFiles] = useState([]);
  const [clientPhotos, setClientPhotos] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');

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

  // Create client photo objects when files are selected
  useEffect(() => {
    if (files.length > 0) {
      const newClientPhotos = Array.from(files).map(file => 
        PhotoSchema.createFromFile(file)
      );
      setClientPhotos(newClientPhotos);
    } else {
      setClientPhotos([]);
    }
  }, [files]);

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
      const result = await uploadPhotos(
        files, 
        selectedReportId,
        (updatedPhotos, progress) => {
          setClientPhotos(updatedPhotos);
          setUploadProgress(progress);
        }
      );

      if (result.success) {
        setUploadStatus(`Successfully uploaded ${result.photos.length} photos`);
        setUploadedPhotos(result.photos);
        setFiles([]);
        setClientPhotos([]);
      } else {
        setUploadStatus(`Upload failed: ${result.error}`);
      }
    } catch (error) {
      setUploadStatus(`Error: ${error.message}`);
      console.error('Upload error:', error);
    }
  };

  const handleAnalyze = async () => {
    if (uploadedPhotos.length === 0) {
      setAnalysisStatus('No photos to analyze');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStatus('Analyzing photos...');

    try {
      const photoIds = uploadedPhotos.map(photo => photo._id);
      const result = await analyzePhotos(selectedReportId, photoIds);

      if (result.success) {
        setUploadedPhotos(result.photos);
        setAnalysisStatus(`Successfully analyzed ${result.photos.length} photos`);
      } else {
        setAnalysisStatus(`Analysis failed: ${result.error}`);
      }
    } catch (error) {
      setAnalysisStatus(`Error: ${error.message}`);
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
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
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed mb-4"
      >
        Upload Photos
      </button>

      {/* Using the reusable ProgressBar component */}
      <ProgressBar 
        progress={uploadProgress} 
        isActive={uploadProgress > 0 && uploadProgress < 100} 
        label="Uploading photos" 
        color="blue"
      />

      {uploadStatus && (
        <div className="mt-4 p-3 bg-gray-100 rounded-md">
          <p>{uploadStatus}</p>
        </div>
      )}

      {uploadedPhotos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Uploaded Photos</h3>
          
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || uploadedPhotos.length === 0}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed mb-4"
          >
            Analyze Photos
          </button>
          
          {/* Analysis progress bar */}
          <ProgressBar 
            progress={isAnalyzing ? 50 : 0} 
            isActive={isAnalyzing} 
            label="Analyzing photos" 
            color="green"
          />
          
          {analysisStatus && (
            <div className="mt-4 p-3 bg-gray-100 rounded-md mb-4">
              <p>{analysisStatus}</p>
            </div>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {uploadedPhotos.map((photo) => (
              <div key={photo._id || photo.clientId} className="border rounded-md overflow-hidden">
                <img
                  src={photo.preview || getPhotoUrl(photo, 'thumbnail')}
                  alt={photo.originalName}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2">
                  <div className="text-xs truncate mb-1">
                    {photo.originalName}
                  </div>
                  <div className="text-xs text-gray-500">
                    Status: {photo.status}
                  </div>
                  {photo.analysis && (
                    <div className="text-xs text-green-600 mt-1">
                      Analysis: {photo.analysis.description || 'Completed'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Display client photos during upload */}
      {clientPhotos.length > 0 && uploadedPhotos.length === 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Client Photos</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {clientPhotos.map((photo) => (
              <div key={photo.clientId} className="border rounded-md overflow-hidden">
                <img
                  src={photo.preview}
                  alt={photo.originalName}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2">
                  <div className="text-xs truncate mb-1">
                    {photo.originalName}
                  </div>
                  <div className="text-xs text-gray-500">
                    Status: {photo.status}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full" 
                      style={{ width: `${photo.uploadProgress}%` }}
                    ></div>
                  </div>
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