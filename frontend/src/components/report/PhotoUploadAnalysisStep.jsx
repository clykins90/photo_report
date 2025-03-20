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

  // Handle file drop - just add photos, no auto upload
  const handleDrop = useCallback((files) => {
    if (!files?.length) return;
    addPhotosFromFiles(files);
  }, [addPhotosFromFiles]);

  // Handle photo removal
  const handleRemovePhoto = useCallback((photo) => {
    removePhoto(photo);
    if (selectedPhoto && (selectedPhoto.id === photo.id || selectedPhoto._id === photo._id)) {
      setSelectedPhoto(null);
    }
  }, [removePhoto, selectedPhoto]);

  // Analyze photos - simplified
  const handleAnalyzePhotos = useCallback(async () => {
    if (!report._id) {
      setPhotoError("Please upload photos first.");
      return;
    }
    
    try {
      const result = await analyzePhotos(report._id);
      if (result.success) {
        setAnalyzeComplete(true);
        await generateSummary();
      }
    } catch (error) {
      setPhotoError("Analysis failed. Please try again.");
    }
  }, [report._id, analyzePhotos, generateSummary, setPhotoError]);

  // Upload photos
  const handleUploadPhotos = useCallback(async () => {
    if (!report._id) {
      try {
        const currentUser = user || {};
        const reportId = await submitReport(currentUser);
        if (!reportId) {
          setPhotoError("Could not create a report. Please try again.");
          return;
        }
      } catch (error) {
        setPhotoError("Failed to create report. Please try again.");
        return;
      }
    }
    
    // Get photos that can be uploaded
    const photosToUpload = photos.filter(canUploadPhoto);
    if (photosToUpload.length === 0) {
      setPhotoError("No photos ready to upload");
      return;
    }
    
    const result = await uploadPhotosToServer(photosToUpload, report._id);
    if (result.success) {
      setPhotoError(null);
    }
  }, [report._id, photos, uploadPhotosToServer, submitReport, user, setPhotoError, canUploadPhoto]);

  // Handle next step
  const handleNext = useCallback(() => {
    if (photos.length === 0) {
      setPhotoError("Please add at least one photo before continuing");
      return;
    }
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
        <Button variant="outline" onClick={prevStep}>Back</Button>
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