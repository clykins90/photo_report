import React, { useState, useCallback, useRef } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';
import PhotoDropzone from '../photo/components/PhotoDropzone';
import PhotoGrid from '../photo/components/PhotoGrid';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';

const PhotoUploadAnalysisStep = () => {
  const { user } = useAuth();
  
  // Get photo context with all the utilities we need
  const { 
    photos, 
    isUploading, 
    uploadProgress, 
    isAnalyzing, 
    analysisProgress, 
    error: photoError, 
    addPhotosFromFiles, 
    uploadPhotosToServer, 
    analyzePhotos,
    removePhoto,
    getPhotosByStatus,
    setError: setPhotoError
  } = usePhotoContext();

  // Get report context
  const {
    report,
    error: reportError,
    generateSummary,
    generatingSummary,
    prevStep,
    nextStep
  } = useReportContext();

  // Local state for selected photo (if needed for details view)
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Handle file drop from PhotoDropzone
  const handleDrop = useCallback((files) => {
    if (!files || files.length === 0) return;
    
    // Add files to context - the context will handle creating blob URLs
    addPhotosFromFiles(files, report?._id);
  }, [addPhotosFromFiles, report?._id]);

  // Handle photo removal
  const handleRemovePhoto = useCallback((photo) => {
    removePhoto(photo);
    
    // If this was the selected photo, clear selection
    if (selectedPhoto && (selectedPhoto.id === photo.id || selectedPhoto._id === photo._id)) {
      setSelectedPhoto(null);
    }
  }, [removePhoto, selectedPhoto]);

  // Handle individual photo analysis (if needed)
  const handleAnalyzePhoto = useCallback((photo) => {
    if (!report?._id || !photo?._id) {
      setPhotoError('Cannot analyze photo without report ID or photo ID');
      return;
    }
    
    analyzePhotos(report._id, [photo._id]);
  }, [analyzePhotos, report?._id, setPhotoError]);

  // Start analysis of all photos
  const handleAnalyzeAll = useCallback(() => {
    if (!report?._id) {
      setPhotoError('Report ID is required for analysis');
      return;
    }
    
    // Get uploaded photos using the context function
    const uploadedPhotos = getPhotosByStatus('uploaded');
    
    if (uploadedPhotos.length === 0) {
      setPhotoError('No uploaded photos to analyze');
      return;
    }
    
    analyzePhotos(report._id);
  }, [analyzePhotos, getPhotosByStatus, report?._id, setPhotoError]);

  // Generate AI summary from analyzed photos
  const handleGenerateSummary = useCallback(() => {
    // Get analyzed photos using the context function
    const analyzedPhotos = getPhotosByStatus('analyzed');
    
    if (analyzedPhotos.length === 0) {
      setPhotoError('Please analyze photos before generating a summary');
      return;
    }
    
    generateSummary();
  }, [generateSummary, getPhotosByStatus, setPhotoError]);

  // Navigation handlers
  const handleBack = useCallback(() => {
    prevStep();
  }, [prevStep]);

  const handleNext = useCallback(() => {
    nextStep();
  }, [nextStep]);

  // Render error messages
  const renderErrors = () => {
    const error = photoError || reportError;
    
    if (!error) {
      return null;
    }
    
    return (
      <div className="mt-4 p-3 bg-red-50 text-red-800 rounded-md border border-red-200">
        <p className="flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      </div>
    );
  };

  // Render the analysis controls
  const renderAnalysisControls = () => {
    // Only show if we have uploaded photos
    const uploadedPhotos = getPhotosByStatus('uploaded');
    
    if (uploadedPhotos.length === 0) {
      return null;
    }
    
    return (
      <div className="mt-6 p-4 border rounded-lg">
        <h3 className="text-lg font-medium mb-3">Photo Analysis</h3>
        
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">Analyze all photos</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Use AI to detect damage and analyze roof conditions
              </p>
            </div>
            
            <Button
              onClick={handleAnalyzeAll}
              disabled={isAnalyzing || uploadedPhotos.length === 0}
            >
              {isAnalyzing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Analyzing... {analysisProgress}%
                </>
              ) : (
                'Analyze All'
              )}
            </Button>
          </div>
          
          {/* Summary generation */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div>
              <p className="font-medium">Generate report summary</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Create AI-powered summary based on photo analysis
              </p>
            </div>
            
            <Button
              onClick={handleGenerateSummary}
              disabled={generatingSummary || getPhotosByStatus('analyzed').length === 0}
              variant="outline"
            >
              {generatingSummary ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating...
                </>
              ) : (
                'Generate Summary'
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Render navigation buttons
  const renderNavigation = () => (
    <div className="mt-8 flex justify-between">
      <Button onClick={handleBack} variant="outline">
        Previous
      </Button>
      
      <Button 
        onClick={handleNext}
        disabled={photos.length === 0}
      >
        Next Step
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Photo Upload & Analysis</h2>
      
      {renderErrors()}
      
      {/* Use the PhotoDropzone component instead of custom implementation */}
      <PhotoDropzone 
        onDrop={handleDrop} 
        disabled={isUploading} 
      />
      
      {/* Use PhotoGrid component for the photo gallery */}
      {photos.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Uploaded Photos ({photos.length})</h3>
          <PhotoGrid 
            photos={photos}
            onRemovePhoto={handleRemovePhoto}
            onAnalyzePhoto={handleAnalyzePhoto}
          />
        </div>
      )}
      
      {renderAnalysisControls()}
      {renderNavigation()}
    </div>
  );
};

export default PhotoUploadAnalysisStep; 