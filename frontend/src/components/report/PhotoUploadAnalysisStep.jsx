import React, { useState, useCallback, useEffect } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';
import PhotoDropzone from '../photo/components/PhotoDropzone';
import PhotoGrid from '../photo/components/PhotoGrid';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { PhotoState } from '../../utils/photoStateMachine';

const PhotoUploadAnalysisStep = () => {
  const { user } = useAuth();
  
  // Get photo context with state machine helpers
  const { 
    photos, 
    isUploading, 
    uploadProgress, 
    isAnalyzing, 
    error: photoError, 
    addPhotosFromFiles, 
    uploadPhotosToServer,
    analyzePhotos,
    removePhoto,
    setError: setPhotoError,
    canUploadPhoto,
    canAnalyzePhoto,
    isPhotoInState
  } = usePhotoContext();

  // Get report context
  const {
    report,
    error: reportError,
    generateSummary,
    generatingSummary,
    prevStep,
    nextStep,
    submitReport
  } = useReportContext();

  // Local state
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [analyzeComplete, setAnalyzeComplete] = useState(false);
  
  // Determine if there are photos ready for analysis using state machine
  const uploadedPhotosExist = photos.some(photo => 
    canAnalyzePhoto(photo) && photo._id?.match(/^[0-9a-f]{24}$/i)
  );

  // Handle file drop
  const handleDrop = useCallback((files) => {
    if (!files || files.length === 0) return;
    addPhotosFromFiles(files);
  }, [addPhotosFromFiles]);

  // Handle photo removal
  const handleRemovePhoto = useCallback((photo) => {
    removePhoto(photo);
    if (selectedPhoto && (selectedPhoto.id === photo.id || selectedPhoto._id === photo._id)) {
      setSelectedPhoto(null);
    }
  }, [removePhoto, selectedPhoto]);

  // Upload photos
  const handleUploadPhotos = useCallback(async () => {
    if (!report._id) {
      try {
        const currentUser = user || {};
        const reportId = await submitReport(currentUser);
        if (!reportId) {
          setPhotoError("Could not create a report. Please go back and fill in the basic information.");
          return;
        }
      } catch (error) {
        console.error("Error creating report:", error);
        setPhotoError("Failed to create report. Please go back to the first step and try again.");
        return;
      }
    }
    
    if (photos.length === 0) {
      setPhotoError("Please add photos before uploading");
      return;
    }
    
    // Get photos that can be uploaded according to state machine
    const photosToUpload = photos.filter(photo => canUploadPhoto(photo));
    
    if (photosToUpload.length === 0) {
      console.log('No new photos to upload');
      return;
    }
    
    const uploadResult = await uploadPhotosToServer(photosToUpload, report._id);
    
    // If upload was successful, automatically trigger analysis
    if (uploadResult.success) {
      // Wait a short moment to ensure the server has processed the upload
      setTimeout(() => {
        handleAnalyzePhotos();
      }, 1000);
    }
  }, [report._id, photos, uploadPhotosToServer, submitReport, user, setPhotoError, canUploadPhoto, handleAnalyzePhotos]);

  // Analyze photos
  const handleAnalyzePhotos = useCallback(async () => {
    if (!report._id) {
      setPhotoError("Report ID is missing. Please upload photos first.");
      return;
    }
    
    if (photos.length === 0) {
      setPhotoError("Please add and upload photos before analyzing");
      return;
    }
    
    try {
      // Pass the full photo objects for analysis
      const photosToAnalyze = photos.map(photo => ({
        ...photo,
        file: photo.file,  // Ensure file object is included
        preview: photo.preview,
        localDataUrl: photo.localDataUrl,
        _id: photo._id,
        path: photo.path
      }));
      
      await analyzePhotos(report._id, photosToAnalyze);
      setAnalyzeComplete(true);
      
      // Auto-generate summary when analysis is complete
      try {
        await generateSummary();
      } catch (error) {
        console.error("Error generating summary:", error);
        // Don't block the flow if summary generation fails
      }
    } catch (error) {
      console.error("Error analyzing photos:", error);
      setPhotoError("Failed to analyze photos. Please try again.");
    }
  }, [report._id, photos, analyzePhotos, generateSummary, setPhotoError]);

  // Handle next step
  const handleNext = useCallback(() => {
    if (photos.length === 0) {
      setPhotoError("Please add at least one photo before continuing");
      return;
    }
    
    // Allow proceeding even if photos aren't analyzed
    nextStep();
  }, [photos, nextStep, setPhotoError]);

  // Render error messages
  const renderErrors = () => {
    if (!photoError && !reportError) return null;
    
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
        <p className="text-red-700">{photoError || reportError}</p>
      </div>
    );
  };

  // Render upload progress
  const renderUploadProgress = () => {
    if (!isUploading) return null;
    
    return (
      <div className="mb-4">
        <div className="flex items-center mb-1">
          <Spinner size="sm" className="mr-2" />
          <span>Uploading photos... {Math.round(uploadProgress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full" 
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
      </div>
    );
  };

  // Render loading overlay
  const renderLoading = () => {
    if (!isAnalyzing && !generatingSummary) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg text-center">
          <Spinner size="lg" className="mb-4" />
          <p className="text-lg font-medium">
            {isAnalyzing ? "Analyzing photos..." : "Generating summary..."}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            This may take a minute or two.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Photos & Analysis</h2>
      
      {renderErrors()}
      {renderLoading()}
      
      <div className="space-y-6">
        <PhotoDropzone onDrop={handleDrop} />
        
        {photos.length > 0 && (
          <>
            <PhotoGrid 
              photos={photos}
              onRemove={handleRemovePhoto}
              onSelect={setSelectedPhoto}
              selectedPhoto={selectedPhoto}
            />
            
            {renderUploadProgress()}
            
            <div className="flex flex-wrap gap-2 mt-4">
              <Button 
                variant="outline" 
                onClick={handleUploadPhotos}
                disabled={isUploading || photos.length === 0 || !photos.some(canUploadPhoto)}
              >
                {photos.every(photo => isPhotoInState(photo, PhotoState.UPLOADED) || isPhotoInState(photo, PhotoState.ANALYZED)) 
                  ? "Photos Uploaded" 
                  : "Upload Photos"}
              </Button>
              
              <Button 
                variant="outline"
                onClick={handleAnalyzePhotos}
                disabled={isAnalyzing || !uploadedPhotosExist || analyzeComplete}
              >
                {analyzeComplete ? "Analysis Complete" : "Analyze Photos with AI"}
              </Button>
            </div>
          </>
        )}
      </div>
      
      <div className="flex justify-between pt-6">
        <Button 
          variant="outline" 
          onClick={prevStep}
        >
          Back
        </Button>
        
        <Button 
          onClick={handleNext}
          disabled={isUploading || isAnalyzing}
        >
          {photos.length > 0 ? "Next: Review Report" : "Skip Photos"}
        </Button>
      </div>
    </div>
  );
};

export default PhotoUploadAnalysisStep; 