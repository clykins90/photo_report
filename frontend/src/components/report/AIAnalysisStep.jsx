import React, { useState, useEffect } from 'react';
import { analyzePhoto } from '../../services/photoService';
import AIDescriptionEditor from '../photo/AIDescriptionEditor';
import DamageForm from './DamageForm';

const AIAnalysisStep = ({ 
  uploadedPhotos, 
  formData, 
  handlePhotoUploadComplete, 
  handleGenerateAISummary,
  generatingSummary,
  addDamage,
  updateDamage,
  removeDamage,
  prevStep, 
  nextStep 
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Count how many photos have been analyzed
  const analyzedCount = uploadedPhotos.filter(p => p.analysis).length;
  const hasAnalyzedPhotos = analyzedCount > 0;
  const allPhotosAnalyzed = analyzedCount === uploadedPhotos.length && uploadedPhotos.length > 0;

  // Ensure photos with analysis data have status set to 'complete'
  useEffect(() => {
    if (uploadedPhotos.length > 0) {
      const needsStatusUpdate = uploadedPhotos.some(
        photo => photo.analysis && photo.status !== 'complete'
      );
      
      if (needsStatusUpdate) {
        const updatedPhotos = uploadedPhotos.map(photo => {
          if (photo.analysis && photo.status !== 'complete') {
            return { ...photo, status: 'complete' };
          }
          return photo;
        });
        
        handlePhotoUploadComplete(updatedPhotos);
      }
    }
  }, [uploadedPhotos, handlePhotoUploadComplete]);

  // Handle analyzing all photos
  const handleAnalyzeAllPhotos = async () => {
    if (analyzing) return;
    if (uploadedPhotos.length === 0) {
      setError('Please upload photos before analysis.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    
    const unanalyzedPhotos = uploadedPhotos.filter(photo => !photo.analysis);
    
    try {
      const updatedPhotos = [...uploadedPhotos];
      
      for (let i = 0; i < unanalyzedPhotos.length; i++) {
        const photo = unanalyzedPhotos[i];
        setCurrentPhotoIndex(uploadedPhotos.findIndex(p => p.id === photo.id));
        
        try {
          console.log(`Analyzing photo ${i + 1}/${unanalyzedPhotos.length}: ${photo.filename || photo.name}`);
          
          const result = await analyzePhoto(photo.filename || photo.name);
          
          // Find the photo in the updatedPhotos array and update its analysis
          const photoIndex = updatedPhotos.findIndex(p => p.id === photo.id);
          if (photoIndex !== -1) {
            updatedPhotos[photoIndex] = {
              ...updatedPhotos[photoIndex],
              analysis: result.data,
              status: 'complete'
            };
          }
        } catch (photoError) {
          console.error(`Failed to analyze photo ${photo.filename || photo.name}:`, photoError);
          
          // Find the photo in the updatedPhotos array and mark it as error
          const photoIndex = updatedPhotos.findIndex(p => p.id === photo.id);
          if (photoIndex !== -1) {
            updatedPhotos[photoIndex] = {
              ...updatedPhotos[photoIndex],
              status: 'error',
              error: photoError.message || 'Failed to analyze photo'
            };
          }
        }
      }
      
      // Update all photos with their new status
      handlePhotoUploadComplete(updatedPhotos);
      
    } catch (err) {
      console.error('Error during batch analysis:', err);
      setError('Failed to analyze photos. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Handle updating individual photo analysis
  const handleUpdateAnalysis = (photoId, analysis) => {
    const updatedPhotos = uploadedPhotos.map(photo => {
      if (photo.id === photoId) {
        return {
          ...photo,
          analysis,
          status: 'complete'
        };
      }
      return photo;
    });
    
    handlePhotoUploadComplete(updatedPhotos);
  };

  // Toggle between list and grid view
  const toggleViewMode = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
    setSelectedPhoto(null); // Clear selected photo when switching views
  };

  // Handle photo selection in grid view
  const handlePhotoSelect = (photo) => {
    setSelectedPhoto(photo);
  };

  // Close detail view
  const closeDetailView = () => {
    setSelectedPhoto(null);
  };

  // Render status badge
  const renderStatusBadge = (status, error, analysis) => (
    <span 
      className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${
        status === 'complete' || analysis ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
        status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
        status === 'analyzing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {status === 'complete' || analysis ? 'Analyzed' :
       status === 'error' ? 'Analysis Failed' :
       status === 'analyzing' ? 'Analyzing...' :
       'Pending Analysis'}
    </span>
  );

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">AI Photo Analysis & Summary</h3>
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-700 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-700 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              First, analyze all your photos with AI. Then, generate a comprehensive report summary.
            </p>
          </div>
        </div>
      </div>
      
      <div className="mb-8">
        <h4 className="font-semibold text-lg mb-2">Step 1: Analyze Photos</h4>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Have AI analyze each photo to identify damage types, severity, and technical details.
        </p>
        
        <div className="flex items-center mb-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
            <div 
              className="bg-blue-600 h-2 rounded-full" 
              style={{ width: `${uploadedPhotos.length ? (analyzedCount / uploadedPhotos.length) * 100 : 0}%` }}
            ></div>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {analyzedCount}/{uploadedPhotos.length} Analyzed
          </span>
        </div>
        
        <button
          onClick={handleAnalyzeAllPhotos}
          disabled={analyzing || uploadedPhotos.length === 0}
          className={`w-full py-3 px-4 rounded-md text-white font-medium mb-6 ${
            analyzing || uploadedPhotos.length === 0
              ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'
          }`}
        >
          {analyzing 
            ? `Analyzing Photo ${currentPhotoIndex + 1}/${uploadedPhotos.length}...` 
            : allPhotosAnalyzed 
              ? 'Re-Analyze All Photos' 
              : 'Analyze All Photos with AI'}
        </button>
        
        {/* View mode toggle */}
        {uploadedPhotos.length > 0 && (
          <div className="flex justify-end mb-4">
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${
                  viewMode === 'grid'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium rounded-r-lg border ${
                  viewMode === 'list'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        )}
        
        {/* Grid View */}
        {viewMode === 'grid' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {uploadedPhotos.map((photo, index) => (
                <div 
                  key={photo.id || index} 
                  className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handlePhotoSelect(photo)}
                >
                  <div className="relative pb-[100%]"> {/* 1:1 aspect ratio */}
                    <img 
                      src={photo.preview} 
                      alt={`Photo ${index + 1}`}
                      className="absolute w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2 text-center">
                    {renderStatusBadge(photo.status, photo.error, photo.analysis)}
                  </div>
                </div>
              ))}
            </div>

            {/* Photo Detail Modal */}
            {selectedPhoto && (
              <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-75 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-semibold">{selectedPhoto.name || `Photo ${uploadedPhotos.findIndex(p => p.id === selectedPhoto.id) + 1}`}</h3>
                    <button 
                      onClick={closeDetailView}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto">
                    <div className="flex flex-col md:flex-row">
                      <div className="md:w-1/3 p-4">
                        <img 
                          src={selectedPhoto.preview} 
                          alt={selectedPhoto.name || 'Selected photo'}
                          className="w-full h-auto object-contain rounded"
                        />
                        <div className="mt-2 text-center">
                          {renderStatusBadge(selectedPhoto.status, selectedPhoto.error, selectedPhoto.analysis)}
                        </div>
                      </div>
                      
                      <div className="md:w-2/3 border-t md:border-t-0 md:border-l dark:border-gray-700">
                        {selectedPhoto.analysis ? (
                          <AIDescriptionEditor 
                            photo={selectedPhoto} 
                            onUpdate={handleUpdateAnalysis}
                          />
                        ) : (
                          <div className="p-4 bg-gray-50 dark:bg-gray-800 h-full flex items-center justify-center">
                            <p className="text-gray-500 dark:text-gray-400">
                              {selectedPhoto.status === 'analyzing' 
                                ? 'Analyzing photo...' 
                                : selectedPhoto.status === 'error'
                                ? `Analysis failed: ${selectedPhoto.error}`
                                : 'Click "Analyze All Photos" to analyze this photo'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 border-t dark:border-gray-700 flex justify-between">
                    <button
                      onClick={closeDetailView}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md"
                    >
                      Close
                    </button>
                    
                    {/* Navigation buttons */}
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const currentIndex = uploadedPhotos.findIndex(p => p.id === selectedPhoto.id);
                          const prevIndex = (currentIndex - 1 + uploadedPhotos.length) % uploadedPhotos.length;
                          setSelectedPhoto(uploadedPhotos[prevIndex]);
                        }}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => {
                          const currentIndex = uploadedPhotos.findIndex(p => p.id === selectedPhoto.id);
                          const nextIndex = (currentIndex + 1) % uploadedPhotos.length;
                          setSelectedPhoto(uploadedPhotos[nextIndex]);
                        }}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        
        {/* List View (Original) */}
        {viewMode === 'list' && (
          <div className="grid grid-cols-1 gap-8 mt-4">
            {uploadedPhotos.map((photo, index) => (
              <div key={photo.id || index} className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="flex flex-col md:flex-row">
                  <div className="md:w-1/3 p-4">
                    <img 
                      src={photo.preview} 
                      alt={`Photo ${index + 1}`}
                      className="w-full h-auto object-contain rounded"
                    />
                    <div className="mt-2 text-center">
                      {renderStatusBadge(photo.status, photo.error, photo.analysis)}
                    </div>
                  </div>
                  
                  <div className="md:w-2/3 border-t md:border-t-0 md:border-l dark:border-gray-700">
                    {photo.analysis ? (
                      <AIDescriptionEditor 
                        photo={photo} 
                        onUpdate={handleUpdateAnalysis}
                      />
                    ) : (
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 h-full flex items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">
                          {photo.status === 'analyzing' 
                            ? 'Analyzing photo...' 
                            : photo.status === 'error'
                            ? `Analysis failed: ${photo.error}`
                            : 'Click "Analyze All Photos" to analyze this photo'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="mb-8">
        <h4 className="font-semibold text-lg mb-2">Step 2: Generate Report Summary</h4>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Once photos are analyzed, generate a comprehensive summary of findings, damages, and recommendations.
        </p>
        
        <button
          onClick={handleGenerateAISummary}
          disabled={!hasAnalyzedPhotos || generatingSummary}
          className={`w-full py-3 px-4 rounded-md text-white font-medium ${
            !hasAnalyzedPhotos || generatingSummary
              ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800'
          }`}
        >
          {generatingSummary 
            ? 'Generating Summary...' 
            : allPhotosAnalyzed 
              ? 'Generate Report Summary'
              : 'Analyze All Photos First'}
        </button>
        
        {formData.summary && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
            <h5 className="font-semibold">Generated Summary:</h5>
            <p className="mt-2 whitespace-pre-line text-foreground">{formData.summary}</p>
            
            {formData.materials && (
              <div className="mt-4">
                <h5 className="font-semibold">Materials Identified:</h5>
                <p className="mt-2 whitespace-pre-line text-foreground">{formData.materials}</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {formData.damages && formData.damages.length > 0 && (
        <div className="mb-8">
          <h4 className="font-semibold text-lg mb-2">Damages Identified</h4>
          <DamageForm
            damages={formData.damages}
            addDamage={addDamage}
            updateDamage={updateDamage}
            removeDamage={removeDamage}
          />
        </div>
      )}
      
      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={prevStep}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Back: Photo Upload
        </button>
        
        <button
          type="button"
          onClick={nextStep}
          disabled={!hasAnalyzedPhotos}
          className={`${
            !hasAnalyzedPhotos
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-700'
          } text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline`}
        >
          Next: Review & Finalize
        </button>
      </div>
    </div>
  );
};

export default AIAnalysisStep; 