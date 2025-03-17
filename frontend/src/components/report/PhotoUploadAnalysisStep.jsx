import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';
import PhotoDropzone from '../photo/components/PhotoDropzone';
import PhotoGrid from '../photo/components/PhotoGrid';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';

// Marvel quotes for loading screens
const MARVEL_QUOTES = [
  "With great power comes great responsibility.",
  "I can do this all day.",
  "I am Iron Man.",
  "We have a Hulk.",
  "That's my secret, Captain. I'm always angry.",
  "I'm the best there is at what I do, but what I do isn't very nice.",
  "Wakanda forever!",
  "The hardest choices require the strongest wills.",
  "You should have gone for the head.",
  "I am Groot.",
  "He may have been your father boy, but he wasn't your daddy.",
  "Dormammu, I've come to bargain.",
  "Avengers, assemble!"
];

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

  // Local state
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [currentQuote, setCurrentQuote] = useState('');
  const [showLoading, setShowLoading] = useState(false);
  
  // Quote rotation interval
  useEffect(() => {
    let quoteInterval;
    
    // Start quote rotation when analyzing or generating summary
    if (isAnalyzing || generatingSummary) {
      setShowLoading(true);
      setCurrentQuote(MARVEL_QUOTES[Math.floor(Math.random() * MARVEL_QUOTES.length)]);
      
      quoteInterval = setInterval(() => {
        setCurrentQuote(MARVEL_QUOTES[Math.floor(Math.random() * MARVEL_QUOTES.length)]);
      }, 5000);
    } else {
      setShowLoading(false);
    }
    
    return () => {
      if (quoteInterval) clearInterval(quoteInterval);
    };
  }, [isAnalyzing, generatingSummary]);

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

  // Handle individual photo analysis
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
    
    // Get uploaded photos
    const uploadedPhotos = getPhotosByStatus('uploaded');
    
    if (uploadedPhotos.length === 0) {
      setPhotoError('No uploaded photos to analyze');
      return;
    }
    
    analyzePhotos(report._id);
  }, [analyzePhotos, getPhotosByStatus, report?._id, setPhotoError]);

  // Generate AI summary from analyzed photos
  const handleGenerateSummary = useCallback(() => {
    // Get analyzed photos
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
  
  // Render loading overlay with Marvel quotes
  const renderLoadingOverlay = () => {
    if (!showLoading) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full text-center">
          <Spinner className="h-10 w-10 mx-auto mb-4" />
          
          <h3 className="text-xl font-bold mb-2">
            {isAnalyzing ? 'Analyzing Photos' : 'Generating Summary'}
          </h3>
          
          <div className="h-2 w-full bg-gray-200 rounded-full mb-4">
            <div 
              className="h-2 bg-blue-600 rounded-full transition-all duration-300"
              style={{ 
                width: `${isAnalyzing ? analysisProgress : (generatingSummary ? 70 : 0)}%` 
              }}
            ></div>
          </div>
          
          <blockquote className="italic text-gray-600 dark:text-gray-300 border-l-4 border-blue-500 pl-4 my-4">
            "{currentQuote}"
          </blockquote>
          
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isAnalyzing 
              ? "Our AI is analyzing your photos for damage patterns..." 
              : "Creating an intelligent summary based on the photo analysis..."}
          </p>
        </div>
      </div>
    );
  };

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
      <div className="mt-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
        <h3 className="text-lg font-medium mb-3">AI Photo Analysis</h3>
        
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
                  Analyzing...
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

  // Render upload progress
  const renderUploadProgress = () => {
    if (!isUploading && uploadProgress <= 0) return null;
    
    return (
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium text-blue-700">
            Uploading photos... {Math.round(uploadProgress)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${Math.min(Math.round(uploadProgress), 100)}%` }}
          />
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
        disabled={photos.length === 0 || isUploading}
      >
        Next Step
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Photo Upload & Analysis</h2>
      
      {renderErrors()}
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Upload photos of the property for inspection. You can upload multiple photos at once.
              <span className="block mt-1 font-medium">
                AI will analyze your photos to detect damage patterns and generate a summary report.
              </span>
            </p>
          </div>
        </div>
      </div>
      
      {renderUploadProgress()}
      
      {/* Use the PhotoDropzone component directly */}
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
      {renderLoadingOverlay()}
    </div>
  );
};

export default PhotoUploadAnalysisStep; 