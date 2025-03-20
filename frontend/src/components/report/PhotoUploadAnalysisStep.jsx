import React, { useState, useCallback, useEffect } from 'react';
import { usePhotoContext } from '../../context/PhotoContext';
import { useReportContext } from '../../context/ReportContext';
import { useAuth } from '../../context/AuthContext';
import PhotoDropzone from '../photo/components/PhotoDropzone';
import PhotoGrid from '../photo/components/PhotoGrid';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';

const PhotoUploadAnalysisStep = () => {
  const { user } = useAuth();
  
  // Get photo context
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
    setError: setPhotoError
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
  
  // Determine if there are photos ready for analysis
  const uploadedPhotosExist = photos.some(photo => {
    // Check that it has 'uploaded' status AND a valid MongoDB ObjectId
    const hasValidId = photo._id && typeof photo._id === 'string' && /^[0-9a-f]{24}$/i.test(photo._id);
    return photo.status === 'uploaded' && hasValidId;
  });

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
        // Try to get the current user
        const currentUser = user || {};
        // First create a draft report
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
    
    try {
      // Get photos that need to be uploaded (status is not 'uploaded' or 'analyzed')
      const photosToUpload = photos.filter(photo => 
        !['uploaded', 'analyzed'].includes(photo.status)
      );
      
      if (photosToUpload.length === 0) {
        console.log('No new photos to upload');
        return;
      }
      
      // Pass the entire photo objects to uploadPhotosToServer
      // This ensures the service has access to both file and preview properties
      const uploadResult = await uploadPhotosToServer(photosToUpload, report._id);
      
      // Safely check if we have a proper result
      if (!uploadResult) {
        setPhotoError("Upload failed - no response received");
        return;
      }
      
      if (uploadResult.success) {
        const uploadedPhotos = uploadResult.data?.photos || [];
        
        // Update the photos in context with the uploaded ones
        const updatedPhotos = photos.map(existingPhoto => {
          // Find matching uploaded photo by clientId or file name
          const uploadedPhoto = uploadedPhotos.find(up => 
            up.clientId === existingPhoto.clientId || 
            up.originalName === existingPhoto.file?.name
          );
          
          return uploadedPhoto || existingPhoto;
        });
        
        // Log the state update
        console.log('Updated photos after upload:', updatedPhotos.map(p => ({
          id: p._id || p.id,
          status: p.status,
          hasFile: !!p.file,
          hasPreview: !!p.preview
        })));
      } else {
        setPhotoError(uploadResult.error || "Failed to upload photos");
      }
    } catch (error) {
      console.error("Error uploading photos:", error);
      setPhotoError("Failed to upload photos. Please try again.");
    }
  }, [report._id, photos, uploadPhotosToServer, submitReport, user, setPhotoError]);

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
    
    // Check for photos with valid server IDs
    const photosWithValidIds = photos.filter(photo => {
      const hasValidId = photo._id && typeof photo._id === 'string' && /^[0-9a-f]{24}$/i.test(photo._id);
      return photo.status === 'uploaded' && hasValidId;
    });
    
    if (photosWithValidIds.length === 0) {
      setPhotoError("No photos with valid server IDs found. Please make sure photos are fully uploaded before analyzing.");
      return;
    }
    
    try {
      await analyzePhotos(report._id);
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
                disabled={isUploading || photos.length === 0 || photos.every(photo => photo.status === 'uploaded')}
              >
                {photos.every(photo => photo.status === 'uploaded') ? "Photos Uploaded" : "Upload Photos"}
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