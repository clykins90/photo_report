import React, { useState, useCallback } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import PhotoDropzone from '../photo/components/PhotoDropzone';
import PhotoGrid from '../photo/components/PhotoGrid';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';

const PhotoUploadAnalysisStep = () => {
  const { 
    photos, 
    status,
    add: addPhotos,
    upload: uploadPhotos,
    analyze: analyzePhotos,
    remove: removePhoto,
    canAnalyzePhoto
  } = usePhotoContext();

  const {
    report,
    error: reportError,
    generateSummary,
    prevStep,
    nextStep,
    submitReport
  } = useReportContext();

  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Simplified handlers
  const handleDrop = useCallback((files) => {
    if (files?.length) addPhotos(files);
  }, [addPhotos]);

  const handleUpload = useCallback(async () => {
    const reportId = report._id || await submitReport();
    if (reportId) {
      await uploadPhotos(reportId);
    }
  }, [report._id, uploadPhotos, submitReport]);

  const handleAnalyze = useCallback(async () => {
    // Ensure reportId exists
    if (report?._id) { 
      // Call the context analyze function with only the reportId
      const result = await analyzePhotos(report._id);
      
      // Check the success flag in the returned object
      if (result.success) {
        // Optionally check if any photos were actually returned/updated
        if (result.data?.photos?.length > 0) {
           console.log(`Successfully analyzed ${result.data.photos.length} photos.`);
        } else {
           console.log("Analysis request sent, but no photos were returned (possibly none needed analysis or analysis failed server-side).");
        }
        // Proceed to generate summary if analysis call was successful
        await generateSummary(); 
      } else {
         // Handle analysis failure (e.g., show error message)
         // The service function already logs the error, but you might want UI feedback
         console.error("Analysis failed:", result.error);
         // Example: setStatus({ type: 'error', error: result.error }); 
      }
    } else {
       console.log("Analysis skipped: No report ID available.");
    }
    // Removed 'photos' from dependency array as it's implicitly handled by context
  }, [report?._id, analyzePhotos, generateSummary]);

  const handleRemove = useCallback((photo) => {
    removePhoto(photo);
    if (selectedPhoto?.clientId === photo.clientId) {
      setSelectedPhoto(null);
    }
  }, [removePhoto, selectedPhoto]);

  // Render helpers
  const renderStatus = () => {
    if (!status.type) return null;
    
    return (
      <div className="mb-4">
        <div className="flex items-center mb-1">
          <Spinner size="sm" className="mr-2" />
          <span>
            {status.type === 'uploading' ? `Uploading photos... ${Math.round(status.progress)}%` :
             status.type === 'analyzing' ? 'Analyzing photos...' :
             status.type === 'error' ? status.error : ''}
          </span>
        </div>
        {status.type === 'uploading' && (
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${status.progress}%` }}
            ></div>
          </div>
        )}
      </div>
    );
  };

  const renderError = () => {
    const error = status.error || reportError;
    if (!error) return null;
    
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
        <p className="text-red-700">{error}</p>
      </div>
    );
  };

  // Use the context's helper function to determine eligibility
  const canUpload = photos.some(p => p.status === 'pending');
  const canAnalyze = photos.some(canAnalyzePhoto);
  const isComplete = photos.every(p => p.status === 'analyzed');

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Photos & Analysis</h2>
      
      {renderError()}
      {renderStatus()}
      
      <div className="space-y-6">
        <PhotoDropzone onDrop={handleDrop} />
        
        {photos.length > 0 && (
          <>
            <PhotoGrid 
              photos={photos}
              onRemove={handleRemove}
              onSelect={setSelectedPhoto}
              selectedPhoto={selectedPhoto}
            />
            
            <div className="flex flex-wrap gap-2 mt-4">
              <Button 
                variant="outline" 
                onClick={handleUpload}
                disabled={status.type === 'uploading' || !canUpload}
              >
                {canUpload ? "Upload Photos" : "Photos Uploaded"}
              </Button>
              
              <Button 
                variant="outline"
                onClick={handleAnalyze}
                disabled={status.type === 'analyzing' || !canAnalyze || isComplete}
              >
                {isComplete ? "Analysis Complete" : "Analyze Photos"}
              </Button>
            </div>
          </>
        )}
      </div>
      
      <div className="flex justify-between pt-6">
        <Button variant="outline" onClick={prevStep}>Back</Button>
        <Button 
          onClick={nextStep}
          disabled={status.type === 'uploading' || status.type === 'analyzing'}
        >
          {photos.length > 0 ? "Next: Review Report" : "Skip Photos"}
        </Button>
      </div>
    </div>
  );
};

export default PhotoUploadAnalysisStep; 