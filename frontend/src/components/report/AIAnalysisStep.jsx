import React, { useState, useEffect } from 'react';
import { analyzePhoto, analyzeBatchPhotos, getPhotoUrl } from '../../services/photoService';
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
  const [localGeneratingSummary, setLocalGeneratingSummary] = useState(false);
  const [heroLoadingMessage, setHeroLoadingMessage] = useState('');
  const [batchProgress, setBatchProgress] = useState(0);

  // Marvel-inspired loading messages
  const heroLoadingMessages = [
    "Avengers Assemble! Analyzing your roofing photos...",
    "Hulk SMASH! ...I mean, carefully examining shingle damage...",
    "With great power comes great roof analysis...",
    "Captain America's shield has nothing on your roof's protection...",
    "Thor is summoning lightning to illuminate every detail...",
    "Iron Man's AI is scanning for damage patterns...",
    "Doctor Strange is looking through 14,000,605 possible roof conditions...",
    "The Guardians of the Galaxy are detecting cosmic roof damage...",
    "Black Widow is infiltrating hard-to-see problem areas...",
    "Spider-Man is web-slinging across your roof to catch every detail...",
    "Wakanda Forever! Using vibranium-enhanced imaging technology...",
    "Ant-Man is shrinking down to inspect microscopic damage...",
    "Shazam! Electrifying your report with lightning-fast analysis...",
    "Black Panther is prowling your roof with heightened senses...",
    "Wonder Woman's lasso of truth is revealing hidden roof problems...",
    "Vision is using his synthetic intelligence to process images...",
    "Scarlet Witch is altering probability to find all damage points...",
    "Thanos would snap his fingers, but we're being more thorough...",
    "Captain Marvel is using cosmic powers to see through your roof layers...",
    "Hawkeye never misses a detail, and neither do we!",
  ];

  // Count how many photos have been analyzed
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const hasAnalyzedPhotos = analyzedCount > 0;
  const allPhotosAnalyzed = analyzedCount === uploadedPhotos.length && uploadedPhotos.length > 0;
  
  // Update analyzed count whenever photos change
  useEffect(() => {
    const count = uploadedPhotos.filter(p => p.analysis).length;
    setAnalyzedCount(count);
  }, [uploadedPhotos]);

  // Cycle through hero messages during loading
  useEffect(() => {
    let interval;
    if (analyzing || localGeneratingSummary) {
      // Pick initial random message
      setHeroLoadingMessage(heroLoadingMessages[Math.floor(Math.random() * heroLoadingMessages.length)]);
      
      // Change message every 4 seconds
      interval = setInterval(() => {
        const newMessage = heroLoadingMessages[Math.floor(Math.random() * heroLoadingMessages.length)];
        setHeroLoadingMessage(newMessage);
      }, 4000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [analyzing, localGeneratingSummary]);

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

  // Handle both analysis and summary in one step
  const handleBuildSummarizedReport = async () => {
    if (analyzing || generatingSummary || localGeneratingSummary) return;
    
    if (uploadedPhotos.length === 0) {
      setError('Please upload photos before analysis.');
      return;
    }

    // Step 1: Analyze all photos
    setAnalyzing(true);
    setError(null);
    setBatchProgress(0);
    
    const unanalyzedPhotos = uploadedPhotos.filter(photo => !photo.analysis);
    
    try {
      const updatedPhotos = [...uploadedPhotos];
      
      // Skip analysis if all photos are already analyzed
      if (unanalyzedPhotos.length > 0) {
        // Process in batches of 5 photos
        const BATCH_SIZE = 5;
        const batches = [];
        
        // Split unanalyzed photos into batches
        for (let i = 0; i < unanalyzedPhotos.length; i += BATCH_SIZE) {
          batches.push(unanalyzedPhotos.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`Processing ${unanalyzedPhotos.length} unanalyzed photos in ${batches.length} batches of up to ${BATCH_SIZE} each`);
        
        // Track overall photo completion
        let photosCompleted = uploadedPhotos.filter(p => p.analysis).length;
        const totalPhotos = uploadedPhotos.length;
        
        // Process each batch
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`Processing frontend batch ${batchIndex + 1}/${batches.length} with ${batch.length} photos`);
          
          // Mark all photos in this batch as analyzing
          batch.forEach(photo => {
            const photoIndex = updatedPhotos.findIndex(p => p.id === photo.id);
            if (photoIndex !== -1) {
              updatedPhotos[photoIndex] = {
                ...updatedPhotos[photoIndex],
                status: 'analyzing'
              };
            }
          });
          
          // Update photos state to show "analyzing" status
          handlePhotoUploadComplete(updatedPhotos);
          
          try {
            // Add a delay between batches to avoid rate limiting (except for the first batch)
            if (batchIndex > 0) {
              console.log(`Adding delay between frontend batches to avoid rate limiting...`);
              // Wait for 5 seconds between batches to avoid hitting rate limits
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            // Analyze the batch
            const batchResult = await analyzeBatchPhotos(batch);
            
            // Process results and update photos
            if (batchResult.success && batchResult.data) {
              batchResult.data.forEach(result => {
                if (result.success && result.fileId) {
                  // Find the photo that matches this result
                  const photoToUpdate = batch.find(photo => {
                    // Use the simplified ID extraction logic that matches the backend
                    const photoId = 
                      photo.uploadedData?.gridfs?.original || 
                      photo.uploadedData?.gridfs?.optimized || 
                      photo.uploadedData?.gridfsId || 
                      photo._id || 
                      (photo.id && typeof photo.id === 'string' && /^[0-9a-fA-F]{24}$/.test(photo.id) ? photo.id : null);
                    
                    return photoId === result.fileId;
                  });
                  
                  if (photoToUpdate) {
                    // Update the photo with analysis results
                    const photoIndex = updatedPhotos.findIndex(p => p.id === photoToUpdate.id);
                    if (photoIndex !== -1) {
                      updatedPhotos[photoIndex] = {
                        ...updatedPhotos[photoIndex],
                        analysis: result.data,
                        status: 'analyzed'
                      };
                    }
                  }
                }
              });
            } else {
              // Mark batch as failed
              batch.forEach(photo => {
                const photoIndex = updatedPhotos.findIndex(p => p.id === photo.id);
                if (photoIndex !== -1) {
                  updatedPhotos[photoIndex] = {
                    ...updatedPhotos[photoIndex],
                    status: 'error',
                    error: batchResult.error || 'Analysis failed'
                  };
                }
              });
            }
            
            // Update photos state with analysis results
            handlePhotoUploadComplete(updatedPhotos);
            
            // Update progress
            photosCompleted += batch.filter(p => {
              const updatedPhoto = updatedPhotos.find(up => up.id === p.id);
              return updatedPhoto && updatedPhoto.analysis;
            }).length;
            
            setBatchProgress(Math.round((photosCompleted / totalPhotos) * 100));
          } catch (batchError) {
            console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
            
            // Mark all photos in this batch as error
            batch.forEach(photo => {
              const photoIndex = updatedPhotos.findIndex(p => p.id === photo.id);
              if (photoIndex !== -1) {
                updatedPhotos[photoIndex] = {
                  ...updatedPhotos[photoIndex],
                  status: 'error',
                  error: batchError.message || 'Analysis failed'
                };
              }
            });
            
            // Update photos state with errors
            handlePhotoUploadComplete(updatedPhotos);
          }
        }
      }
      
      setAnalyzing(false);
      
      // Step 2: Generate summary after all photos are analyzed
      // This runs whether photos were just analyzed or were already analyzed
      const analyzedPhotos = updatedPhotos.filter(photo => photo.analysis && photo.analysis.description);
      
      if (analyzedPhotos.length > 0) {
        console.log(`Generating summary for ${analyzedPhotos.length} analyzed photos`);
        setLocalGeneratingSummary(true);
        try {
          // Make sure we're passing the updated photos to the summary generator
          const result = await handleGenerateAISummary(analyzedPhotos);
          console.log('Summary generation completed successfully:', result);
          
          // Show success message to user
          setError(null);
        } catch (summaryError) {
          console.error('Error generating summary:', summaryError);
          setError(`Failed to generate summary: ${summaryError.message || 'Unknown error'}`);
        } finally {
          setLocalGeneratingSummary(false);
        }
      } else {
        setError('No photos could be successfully analyzed. Please check your images and try again.');
      }
      
    } catch (err) {
      console.error('Error during batch processing:', err);
      setError('Failed to complete the analysis and summary. Please try again.');
    } finally {
      setAnalyzing(false);
      setLocalGeneratingSummary(false);
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
        analysis ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
        status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
        status === 'analyzing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {analysis ? 'Analyzed' :
       status === 'error' ? 'Analysis Failed' :
       status === 'analyzing' ? 'Analyzing...' :
       'Pending Analysis'}
    </span>
  );

  // Get the best available image URL for a photo
  const getBestImageUrl = (photo) => {
    // Use the centralized photo URL handler from photoService
    // which properly handles path prefixes to avoid duplicates
    return getPhotoUrl(photo);
  };

  // Render the superhero loading screen
  const renderHeroLoadingScreen = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-r from-blue-900 to-purple-900">
      <div className="max-w-xl p-8 text-center">
        <div className="mb-8 animate-pulse">
          <svg className="mx-auto h-24 w-24 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 22l-3.5-6h7L12 22zM5.5 8.5l1.5 2h10l1.5-2L12 2 5.5 8.5z"></path>
            <path d="M12 12c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
          </svg>
        </div>
        
        <h2 className="mb-4 text-3xl font-bold text-white">{heroLoadingMessage}</h2>
        
        <div className="mb-6">
          <div className="h-2 w-full rounded-full bg-gray-700">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ease-in-out ${
                analyzing 
                  ? (
                      batchProgress < 30 
                        ? 'bg-blue-400' 
                        : batchProgress < 70 
                          ? 'bg-yellow-400' 
                          : 'bg-green-400'
                    )
                  : 'bg-yellow-400'
              }`}
              style={{ 
                width: analyzing 
                  ? batchProgress > 0 
                    ? `${batchProgress}%` 
                    : `${uploadedPhotos.length > 0 ? (analyzedCount / uploadedPhotos.length) * 100 : 0}%`
                  : (localGeneratingSummary ? 100 : 0) + '%' 
              }}
            ></div>
          </div>
          <div className="mt-2 text-sm text-gray-300 flex justify-between">
            <div>
              {analyzing 
                ? batchProgress > 0
                  ? `Processing photos: ${batchProgress}%` 
                  : `Analyzing photos: ${analyzedCount} of ${uploadedPhotos.length}`
                : localGeneratingSummary 
                  ? "Generating your summary..." 
                  : "Starting analysis..."}
            </div>
            <div>
              {analyzing && uploadedPhotos.length > 0 && (
                `${Math.round((analyzedCount / uploadedPhotos.length) * 100)}% complete`
              )}
            </div>
          </div>
        </div>
        
        <p className="text-white">Our superhero AI is hard at work creating your report!</p>
        
        {uploadedPhotos.length > 0 && (
          <div className="mt-4 bg-purple-900/30 p-4 rounded-lg text-left">
            <h3 className="text-yellow-400 text-lg font-medium mb-2">Progress Details:</h3>
            <ul className="text-white text-sm">
              <li className="flex justify-between">
                <span>Total photos:</span> 
                <span className="font-semibold">{uploadedPhotos.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Analyzed:</span> 
                <span className="font-semibold">{analyzedCount}</span>
              </li>
              <li className="flex justify-between">
                <span>Remaining:</span> 
                <span className="font-semibold">{uploadedPhotos.length - analyzedCount}</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">AI Analysis</h3>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading state */}
      {(analyzing || localGeneratingSummary) && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 animate-pulse">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                {heroLoadingMessage}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {analyzing ? `Analyzing photos: ${batchProgress}% complete` : 'Generating summary...'}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Instructions */}
      {!analyzing && !localGeneratingSummary && !allPhotosAnalyzed && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Click the button below to analyze your photos with AI. This will identify damage, provide descriptions, and generate a summary report.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Success message */}
      {allPhotosAnalyzed && !analyzing && !localGeneratingSummary && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700">
                All photos have been analyzed and a summary has been generated. You can review and edit the results below.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Analysis button */}
      {!analyzing && !localGeneratingSummary && !allPhotosAnalyzed && (
        <div className="mb-6">
          <button
            type="button"
            onClick={handleBuildSummarizedReport}
            disabled={analyzing || localGeneratingSummary || uploadedPhotos.length === 0}
            className={`w-full py-3 px-4 rounded-md text-white font-medium ${
              analyzing || localGeneratingSummary || uploadedPhotos.length === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Analyze Photos with AI
          </button>
          
          {batchProgress > 0 && batchProgress < 100 && (
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${batchProgress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
      
      {/* Photo grid/list toggle */}
      {uploadedPhotos.length > 0 && (
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-lg font-medium">
            Photos ({uploadedPhotos.length})
            {analyzedCount > 0 && analyzedCount < uploadedPhotos.length && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                {analyzedCount} analyzed
              </span>
            )}
          </h4>
          
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
              aria-label="Grid view"
            >
              <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
              aria-label="List view"
            >
              <svg className="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      <div className="mb-8">
        <h4 className="font-semibold text-lg mb-2">Photo Browser</h4>
        
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
                      src={getBestImageUrl(photo)} 
                      alt={`Photo ${index + 1}`}
                      className="absolute w-full h-full object-cover"
                      onError={(e) => e.target.src = '/placeholder-image.png'}
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
                          src={getBestImageUrl(selectedPhoto)} 
                          alt={selectedPhoto.name || 'Selected photo'}
                          className="w-full h-auto object-contain rounded"
                          onError={(e) => e.target.src = '/placeholder-image.png'}
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
                                : 'Click "Analyze Photos with AI" to analyze this photo'}
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
                      src={getBestImageUrl(photo)} 
                      alt={`Photo ${index + 1}`}
                      className="w-full h-auto object-contain rounded"
                      onError={(e) => e.target.src = '/placeholder-image.png'}
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
                            : 'Click "Analyze Photos with AI" to analyze this photo'}
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
      
      <div className="flex flex-col mt-8 mb-8">
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
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Next: Review & Finalize
        </button>
      </div>
    </div>
  );
};

export default AIAnalysisStep;