import React, { useState, useCallback, useRef, useEffect } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Spinner } from '../ui/spinner';

const PhotoUploadAnalysisStep = () => {
  const { user } = useAuth();
  
  // Get photo context
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

  // Local state for the dropzone and analysis UI
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [batchAnalysisMode, setBatchAnalysisMode] = useState(true);
  const fileInputRef = useRef(null);

  // Handle file drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    // Get files from event
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    // Add files to context - the context will handle creating blob URLs
    addPhotosFromFiles(files, report._id);
  }, [addPhotosFromFiles, report._id]);

  // Handle file selection via the file input
  const handleFileSelect = useCallback((e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    addPhotosFromFiles(files, report._id);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addPhotosFromFiles, report._id]);

  // Handle drag events
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Handle photo selection (for viewing details)
  const handlePhotoClick = useCallback((photo) => {
    setSelectedPhoto(photo);
  }, []);

  // Handle photo removal
  const handleRemovePhoto = useCallback((photoId) => {
    removePhoto(photoId);
    if (selectedPhoto && selectedPhoto.id === photoId) {
      setSelectedPhoto(null);
    }
  }, [removePhoto, selectedPhoto]);

  // Handle photo upload
  const handleUploadPhotos = useCallback(async () => {
    try {
      await uploadPhotosToServer(report._id);
    } catch (err) {
      console.error('Error uploading photos:', err);
      setPhotoError('Failed to upload photos. Please try again.');
    }
  }, [uploadPhotosToServer, report._id, setPhotoError]);

  // Handle photo analysis
  const handleAnalyzePhotos = useCallback(async () => {
    try {
      await analyzePhotos(report._id);
    } catch (err) {
      console.error('Error analyzing photos:', err);
      setPhotoError('Failed to analyze photos. Please try again.');
    }
  }, [analyzePhotos, report._id, setPhotoError]);

  // Handle AI summary generation
  const handleGenerateSummary = useCallback(async () => {
    try {
      await generateSummary(report._id);
    } catch (err) {
      console.error('Error generating summary:', err);
      setPhotoError('Failed to generate summary. Please try again.');
    }
  }, [generateSummary, report._id, setPhotoError]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Photo Upload & Analysis</h2>
      
      {(photoError || reportError) && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 rounded">
          <p>{photoError || reportError}</p>
        </div>
      )}
      
      {/* Photo Upload Area */}
      <Card className={`border-2 border-dashed p-6 text-center transition-colors ${
        isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-600'
      }`}>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className="w-full h-full flex flex-col items-center justify-center py-8"
        >
          {isUploading ? (
            <div className="text-center">
              <Spinner className="mx-auto h-8 w-8 text-primary mb-4" />
              <p className="text-gray-600 dark:text-gray-300">
                Uploading photos... {uploadProgress}%
              </p>
            </div>
          ) : (
            <>
              <svg 
                className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="1.5" 
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                Drag & drop your photos here
              </h3>
              
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                or click the button below to select files
              </p>
              
              <Button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mb-4"
              >
                Select Photos
              </Button>
              
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Supported formats: JPG, PNG, HEIC (max 10MB per file)
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          )}
        </div>
      </Card>
      
      {/* Photos Gallery */}
      {photos.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Uploaded Photos ({photos.length})
          </h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
            {photos.map((photo, index) => (
              <div 
                key={photo.id || index} 
                className={`relative overflow-hidden rounded-md border cursor-pointer transition ${
                  selectedPhoto && selectedPhoto.id === photo.id 
                    ? 'ring-2 ring-primary border-primary' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => handlePhotoClick(photo)}
              >
                {/* Analysis status indicator */}
                {photo.isAnalyzing && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
                    <Spinner className="h-6 w-6 text-white" />
                  </div>
                )}
                
                {/* Analysis completed indicator */}
                {photo.analysis && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1 z-10">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                
                {/* Image */}
                <img 
                  src={photo.url || photo.preview} 
                  alt={`Photo ${index + 1}`} 
                  className="w-full h-32 object-cover"
                />
                
                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemovePhoto(photo.id);
                  }}
                  className="absolute top-2 left-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                {/* Title overlay at bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white p-1 text-xs truncate">
                  {photo.name || `Photo ${index + 1}`}
                </div>
              </div>
            ))}
          </div>
          
          {/* Analysis Controls */}
          <div className="flex flex-wrap gap-3 mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={handleUploadPhotos}
              disabled={isUploading || photos.every(p => p.uploaded)}
            >
              {isUploading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Uploading...
                </>
              ) : 'Upload All Photos'}
            </Button>
            
            <Button
              type="button"
              variant="secondary"
              onClick={handleAnalyzePhotos}
              disabled={isAnalyzing || !photos.some(p => p.uploaded) || photos.every(p => p.analysis)}
            >
              {isAnalyzing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Analyzing... {analysisProgress}%
                </>
              ) : 'Analyze All Photos'}
            </Button>
            
            <Button
              type="button"
              variant="secondary"
              onClick={handleGenerateSummary}
              disabled={generatingSummary || !photos.some(p => p.analysis)}
            >
              {generatingSummary ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating Summary...
                </>
              ) : 'Generate AI Summary'}
            </Button>
          </div>
        </div>
      )}
      
      {/* Navigation */}
      <div className="flex justify-between pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="button"
          variant="outline"
          onClick={prevStep}
        >
          Previous Step
        </Button>
        
        <Button
          type="button"
          onClick={nextStep}
          disabled={!photos.length || photos.some(p => !p.uploaded)}
        >
          Next Step
        </Button>
      </div>
    </div>
  );
};

export default PhotoUploadAnalysisStep; 