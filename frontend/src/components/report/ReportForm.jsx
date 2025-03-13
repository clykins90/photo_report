import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { createReport, updateReport, generateAISummary, generateReportPdf } from '../../services/reportService';
import { validateReportForm, getFormErrorMessage } from '../../utils/formValidation';
import { backupReportData, getBackupReportData, clearBackupReportData, hasBackupReportData } from '../../utils/reportBackup';
import AuthContext from '../../context/AuthContext';
import api from '../../services/api';

// Import components
import BasicInfoStep from './BasicInfoStep';
import PhotoUploadStep from './PhotoUploadStep';
import AIAnalysisStep from './AIAnalysisStep';
import ReviewStep from './ReviewStep';
import StepIndicator from './StepIndicator';

const ReportForm = ({ existingReport = null, initialData = null, isEditing = false }) => {
  // Get user and auth info from context
  const { user } = useContext(AuthContext);
  
  // Determine the report data to use - either existingReport or initialData
  const reportData = isEditing ? initialData : existingReport;
  
  const [formData, setFormData] = useState({
    title: '',
    clientName: '',
    propertyAddress: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'USA',
    },
    inspectionDate: new Date().toISOString().split('T')[0],
    weather: {
      temperature: '',
      conditions: '',
      windSpeed: '',
    },
    summary: '',
    damages: [],
    recommendations: '',
    materials: '',
    tags: []
  });
  
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1); // 1: Basic Info, 2: Photos Upload, 3: AI Analysis, 4: Review & Finalize
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [hasBackup, setHasBackup] = useState(false);
  
  const navigate = useNavigate();
  
  // If editing an existing report, populate the form
  useEffect(() => {
    if (reportData) {
      console.log('Initializing form with report data:', reportData);
      
      setFormData({
        title: reportData.title || '',
        clientName: reportData.clientName || '',
        propertyAddress: reportData.propertyAddress || {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'USA',
        },
        inspectionDate: reportData.inspectionDate 
          ? new Date(reportData.inspectionDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        weather: reportData.weather || {
          temperature: '',
          conditions: '',
          windSpeed: '',
        },
        summary: reportData.summary || '',
        damages: reportData.damages || [],
        recommendations: reportData.recommendations || '',
        materials: reportData.materials || '',
        tags: reportData.tags || []
      });
      
      if (reportData.photos && reportData.photos.length > 0) {
        // Process photos to ensure they have all the necessary fields
        const processedPhotos = reportData.photos.map((photo, index) => {
          // Base API URL from environment or default
          const baseApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
          
          // Ensure we have a filename
          const filename = photo.filename || 
            (photo.path ? photo.path.split('/').pop() : `photo-${index}`);
          
          // Build the photo URL
          const photoUrl = `${baseApiUrl}/api/photos/${filename}`;
          
          console.log(`Processing photo ${index}:`, { 
            original: photo,
            filename, 
            url: photoUrl
          });
          
          // Return a properly formatted photo object
          return {
            id: photo._id || photo.id || `temp-${index}`,
            name: photo.filename || filename,
            filename: filename,
            description: photo.description || photo.userDescription || '',
            url: photoUrl,
            preview: photoUrl,
            section: photo.section || 'Uncategorized',
            status: 'uploaded',
            analysis: photo.analysis || photo.aiAnalysis || null
          };
        });
        
        setUploadedPhotos(processedPhotos);
        console.log('Processed photos for editing:', processedPhotos);
      }
    }
  }, [reportData]);
  
  // Check for backup data on initial load
  useEffect(() => {
    const backupExists = hasBackupReportData();
    setHasBackup(backupExists);
    console.log('Backup report data exists:', backupExists);
  }, []);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData({
        ...formData,
        [parent]: {
          ...formData[parent],
          [child]: value,
        },
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };
  
  const handlePhotoUploadComplete = (photos) => {
    // Ensure all photos have the appropriate URL properties set
    const processedPhotos = photos.map(photo => {
      // Make sure we keep server-side URLs consistent
      if (photo.uploadedData) {
        // If uploaded but missing direct URLs, set them from uploadedData
        if (!photo.thumbnailUrl && photo.uploadedData.thumbnailUrl) {
          photo.thumbnailUrl = photo.uploadedData.thumbnailUrl;
        }
        if (!photo.optimizedUrl && photo.uploadedData.optimizedUrl) {
          photo.optimizedUrl = photo.uploadedData.optimizedUrl;
        }
        if (!photo.originalUrl && photo.uploadedData.originalUrl) {
          photo.originalUrl = photo.uploadedData.originalUrl;
        }
      }
      return photo;
    });
    
    console.log('Processed photos:', processedPhotos);
    setUploadedPhotos(processedPhotos);
    
    // Save to local storage backup
    if (processedPhotos.length > 0) {
      backupReportData({ ...formData, photos: processedPhotos });
      setHasBackup(true);
    }
  };

  // Restore data from backup
  const handleRestoreFromBackup = () => {
    try {
      const backup = getBackupReportData();
      if (!backup) {
        setError('No backup data found to restore');
        return;
      }
      
      // Restore form data
      if (backup.reportData) {
        setFormData(backup.reportData);
      }
      
      // Restore photos
      if (backup.photos && backup.photos.length > 0) {
        setUploadedPhotos(backup.photos);
      }
      
      setError(null);
      console.log('Restored data from backup saved on', backup.timestamp);
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      setError('Failed to restore from backup: ' + error.message);
    }
  };
  
  // Clear backup data
  const handleClearBackup = () => {
    if (clearBackupReportData()) {
      setHasBackup(false);
    }
  };

  // Generate AI summary based on analyzed photos
  const handleGenerateAISummary = async () => {
    // Check if we have analyzed photos
    const analyzedPhotos = uploadedPhotos.filter(photo => photo.analysis && photo.analysis.description);
    
    if (analyzedPhotos.length === 0) {
      setError('Please analyze photos before generating a summary. Use the "Analyze All Photos with AI" button.');
      return;
    }
    
    try {
      setGeneratingSummary(true);
      setError(null);
      
      // Prepare photos data to avoid circular references
      const preparedPhotos = analyzedPhotos.map(photo => ({
        id: photo.id,
        name: photo.name,
        description: photo.description,
        url: photo.url,
        preview: photo.preview,
        status: photo.status,
        analysis: photo.analysis ? {
          description: photo.analysis.description,
          tags: photo.analysis.tags,
          damageDetected: photo.analysis.damageDetected,
          confidence: photo.analysis.confidence,
          severity: photo.analysis.severity
        } : null
      }));
      
      // Call the API to generate a summary
      const result = await generateAISummary(preparedPhotos);
      
      // Update the form data with the generated summary, recommendations, materials, and tags
      setFormData(prev => ({
        ...prev,
        summary: result.data.summary || prev.summary,
        recommendations: result.data.recommendations || prev.recommendations,
        materials: result.data.materials || prev.materials,
        tags: result.data.tags || prev.tags,
      }));
      
      // Create damages entries from the analysis if not already present
      if (result.data.damages && result.data.damages.length > 0) {
        const existingDamageTypes = formData.damages.map(d => d.type.toLowerCase());
        
        // Add new damage types that aren't already in the list
        const newDamages = result.data.damages
          .filter(damage => !existingDamageTypes.includes(damage.type.toLowerCase()))
          .map(damage => ({
            type: damage.type,
            severity: damage.severity || 'minor',
            description: damage.description || '',
            affectedAreas: damage.affectedAreas || ''
          }));
        
        if (newDamages.length > 0) {
          setFormData(prev => ({
            ...prev,
            damages: [...prev.damages, ...newDamages],
          }));
        }
      }
      
      // After successful AI summary generation, backup the data
      backupReportData(formData, uploadedPhotos);
      setHasBackup(true);
      
    } catch (err) {
      console.error('Failed to generate AI summary:', err);
      setError(err.message || 'Failed to generate AI summary. Please try again.');
    } finally {
      setGeneratingSummary(false);
    }
  };
  
  // Generate PDF report
  const handleGeneratePdf = async () => {
    if (!formData.title || !formData.clientName) {
      setError('Report title and client name are required before generating a PDF.');
      return;
    }
    
    if (!user) {
      setError('You must be logged in to generate a PDF report');
      return;
    }
    
    // Check if user has a company
    if (!user.company) {
      setError('Your account is not associated with a company. Please contact your administrator.');
      return;
    }
    
    try {
      setGeneratingPdf(true);
      setError(null);
      
      // Prepare photos data to avoid circular references
      const preparedPhotos = uploadedPhotos.map(photo => ({
        id: photo.id,
        name: photo.name,
        description: photo.description,
        url: photo.url,
        preview: photo.preview,
        status: photo.status,
        // Add the filename from uploadedData if available
        filename: photo.uploadedData?.filename || photo.filename,
        analysis: photo.analysis ? {
          description: photo.analysis.description,
          tags: photo.analysis.tags,
          damageDetected: photo.analysis.damageDetected,
          confidence: photo.analysis.confidence,
          severity: photo.analysis.severity
        } : null
      }));
      
      // Build a simpler report object
      const reportData = {
        title: formData.title,
        clientName: formData.clientName,
        propertyAddress: formData.propertyAddress,
        inspectionDate: formData.inspectionDate,
        weather: formData.weather,
        summary: formData.summary,
        damages: formData.damages,
        recommendations: formData.recommendations,
        materials: formData.materials,
        tags: formData.tags,
        photos: preparedPhotos
      };
      
      // Create or update the report first
      let reportId;
      let response;
      
      if (reportData) {
        response = await updateReport(reportData._id, reportData);
        reportId = reportData._id;
      } else {
        response = await createReport(reportData);
        reportId = response.data._id;
      }
      
      // Generate PDF
      const pdfResponse = await generateReportPdf(reportId);
      
      // Set the PDF URL for download, ensuring it has the correct backend URL prefix
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const pdfUrl = pdfResponse.data.pdfUrl.startsWith('http') 
        ? pdfResponse.data.pdfUrl 
        : `${baseURL}${pdfResponse.data.pdfUrl}`;
      
      setPdfUrl(pdfUrl);
      
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setError(err.message || 'Failed to generate PDF. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  };
  
  const addDamage = () => {
    setFormData({
      ...formData,
      damages: [
        ...formData.damages,
        {
          type: '',
          severity: 'minor',
          description: '',
        },
      ],
    });
  };
  
  const updateDamage = (index, field, value) => {
    const updatedDamages = [...formData.damages];
    updatedDamages[index] = {
      ...updatedDamages[index],
      [field]: value,
    };
    
    setFormData({
      ...formData,
      damages: updatedDamages,
    });
  };
  
  const removeDamage = (index) => {
    const updatedDamages = [...formData.damages];
    updatedDamages.splice(index, 1);
    
    setFormData({
      ...formData,
      damages: updatedDamages,
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('=== REPORT SUBMISSION STARTED ===');
    console.log('Form Data:', formData);
    console.log('Uploaded Photos:', uploadedPhotos);
    console.log('Current User:', user);
    
    if (!user) {
      setError('You must be logged in to submit a report');
      return;
    }
    
    // First check for address validation explicitly
    const addressMissing = !formData.propertyAddress?.street?.trim() ||
                          !formData.propertyAddress?.city?.trim() ||
                          !formData.propertyAddress?.state?.trim() ||
                          !formData.propertyAddress?.zipCode?.trim();
    
    if (addressMissing) {
      setError('Please complete all property address fields before submitting (street, city, state, and zip code).');
      return;
    }
    
    // Create default company information if missing
    let companyData = null;
    
    if (!user.company) {
      console.warn('User has no company associated with their account. Using placeholder values.');
      // Create a placeholder company object instead of blocking submission
      companyData = {
        name: "[COMPANY NAME]",
        address: {
          street: "[STREET ADDRESS]",
          city: "[CITY]",
          state: "[STATE]",
          zipCode: "[ZIP]"
        },
        phone: "[PHONE]",
        email: "[EMAIL]",
        website: "[WEBSITE]",
        // Include any other required company fields with placeholder values
      };
    } else if (typeof user.company === 'string') {
      try {
        // Try to fetch company data from API
        console.log('Fetching company data from API...');
        const companyRes = await api.get('/api/company');
        if (companyRes.data.success && companyRes.data.data) {
          companyData = companyRes.data.data;
          console.log('Successfully fetched company data:', companyData);
        } else {
          // If API fetch fails, create a placeholder with the company ID
          console.warn('Company API returned no valid data. Using placeholder values.');
          companyData = {
            name: "[COMPANY NAME]",
            _id: user.company // Keep the ID
          };
        }
      } catch (err) {
        console.error('Failed to fetch company data:', err);
        // Create a placeholder with the company ID
        companyData = {
          name: "[COMPANY NAME]",
          _id: user.company // Keep the ID
        };
      }
    } else {
      // Company data is already embedded in the user object
      companyData = user.company;
    }
    
    console.log('Using company data:', companyData);
    
    // Validate required fields before submission
    const { isValid, errors } = validateReportForm(formData, 4);
    if (!isValid) {
      const errorMessage = getFormErrorMessage(errors);
      console.error('Form validation failed:', errors);
      setError(errorMessage);
      return;
    }
    
    try {
      console.log('Setting isSubmitting to true');
      setIsSubmitting(true);
      setError(null);
      
      // Prepare photos data - remove circular references and sanitize before backup
      const preparedPhotos = uploadedPhotos.map(photo => {
        // Extract only the properties we need, avoiding File objects with circular references
        const preparedPhoto = {
          id: photo.id,
          name: photo.name,
          filename: photo.filename || photo.name,
          description: photo.description || '',
          section: photo.section || 'Uncategorized',
          status: photo.status || 'pending',
        };
        
        // Only include URL properties if they're strings
        if (typeof photo.url === 'string') {
          preparedPhoto.url = photo.url;
        }
        if (typeof photo.preview === 'string') {
          preparedPhoto.preview = photo.preview;
        }
        
        // Add the filename from uploadedData if available - only include necessary properties
        if (photo.uploadedData) {
          preparedPhoto.uploadedData = {
            filename: photo.uploadedData.filename,
            thumbnailFilename: photo.uploadedData.thumbnailFilename,
            optimizedFilename: photo.uploadedData.optimizedFilename,
            thumbnailUrl: photo.uploadedData.thumbnailUrl,
            optimizedUrl: photo.uploadedData.optimizedUrl,
            originalUrl: photo.uploadedData.originalUrl,
            thumbnailPath: photo.uploadedData.thumbnailPath,
            optimizedPath: photo.uploadedData.optimizedPath,
          };
          
          // Ensure we have the correct filename
          if (photo.uploadedData.filename) {
            preparedPhoto.filename = photo.uploadedData.filename;
          }
        }
        
        // Include analysis data if it exists - create a clean copy
        if (photo.analysis) {
          preparedPhoto.aiAnalysis = {
            description: photo.analysis.description || '',
            tags: Array.isArray(photo.analysis.tags) ? photo.analysis.tags : [],
            damageDetected: photo.analysis.damageDetected || false,
            confidence: photo.analysis.confidence || 0,
            severity: photo.analysis.severity || 'unknown'
          };
        }
        
        return preparedPhoto;
      });
      
      // Backup safely after sanitizing photos
      const preparedFormData = { ...formData };
      backupReportData(preparedFormData, preparedPhotos);
      setHasBackup(true);
      
      // Check if the data size is very large and warn the user
      try {
        const dataSize = JSON.stringify({
          ...preparedFormData,
          photos: preparedPhotos
        }).length;
        
        if (dataSize > 5000000) { // 5MB
          console.warn(`Large report data detected: ${dataSize} bytes`);
          // Show warning but continue
        }
      } catch (sizeError) {
        console.warn('Could not determine exact data size due to:', sizeError.message);
      }
      
      // Build the report data with current form values
      const updatedReportData = {
        title: formData.title,
        clientName: formData.clientName,
        propertyAddress: formData.propertyAddress,
        inspectionDate: formData.inspectionDate,
        weather: formData.weather,
        summary: formData.summary,
        damages: formData.damages,
        recommendations: formData.recommendations,
        materials: formData.materials,
        tags: formData.tags,
        photos: preparedPhotos,
        // Include user ID and company data with placeholders if needed
        user: user._id,
        company: companyData
      };
      
      console.log('Sending updated report data with user and company info:', updatedReportData);
      
      // Create or update the report
      let response;
      const reportId = reportData?._id;
      
      if (isEditing && reportId) {
        console.log(`Updating report with ID: ${reportId}`);
        response = await updateReport(reportId, updatedReportData);
      } else {
        console.log('Creating new report');
        response = await createReport(updatedReportData);
      }
      
      console.log('Report saved successfully:', response);
      
      // On successful submission, clear the backup
      clearBackupReportData();
      setHasBackup(false);
      
      // Navigate to the report detail page
      navigate(`/reports/${response._id || response.data._id}`);
    } catch (err) {
      console.error('Report submission failed:', err);
      
      // Create a more helpful error message
      let errorMsg = 'Failed to save report. Please try again.';
      
      if (err.response) {
        console.error('Server response:', err.response.data);
        
        // Extract validation error message if available
        if (err.response.data && err.response.data.error) {
          // Handle validation error messages from MongoDB
          if (err.response.data.error.includes('Validation failed')) {
            errorMsg = 'Report validation failed: ';
            // Extract field names from the error message
            const fieldErrors = err.response.data.error.split(',')
              .filter(msg => msg.includes('Path'))
              .map(msg => {
                const field = msg.match(/Path `([^`]+)`/);
                return field ? field[1] : '';
              })
              .filter(Boolean);
            
            if (fieldErrors.length > 0) {
              errorMsg += fieldErrors.join(', ') + ' fields are required.';
            }
          } else {
            errorMsg = err.response.data.error || errorMsg;
          }
        }
        
        // Check specific status codes
        if (err.response.status === 413) {
          errorMsg = 'The report is too large to send. Try reducing the number of photos or the amount of text.';
        } else if (err.response.status === 400) {
          errorMsg = `Bad request: ${errorMsg}. Your data may contain invalid formats or values.`;
        } else if (err.response.status === 500) {
          errorMsg = 'Server error. The team has been notified. Please try again later or use the backup recovery feature.';
        } else if (err.response.status === 504) {
          errorMsg = 'The request timed out. The report may be too large or the server is busy.';
        }
      } else if (err.isPayloadTooLarge) {
        errorMsg = 'The report data is too large to send. Try reducing the number of photos or the amount of text.';
      } else if (err.message && err.message.includes('timeout')) {
        errorMsg = 'The request timed out. The report may be too large or the server is busy. Your data is backed up locally.';
      }
      
      // Add information about backup availability
      if (hasBackup) {
        errorMsg += ' Your report data has been backed up locally and can be recovered.';
      }
      
      setError(errorMsg);
    } finally {
      console.log('Setting isSubmitting to false');
      setIsSubmitting(false);
      console.log('=== REPORT SUBMISSION ENDED ===');
    }
  };
  
  const nextStep = () => {
    // Validate current step before proceeding
    const { isValid, errors } = validateReportForm(formData, step);
    
    if (!isValid) {
      setError(getFormErrorMessage(errors));
      return;
    }
    
    // Special validation for photo step
    if (step === 2 && uploadedPhotos.length === 0) {
      setError('Please upload at least one photo before proceeding.');
      return;
    }
    
    // Clear any previous errors
    setError(null);
    setStep(step + 1);
  };
  
  const prevStep = () => {
    setStep(step - 1);
  };
  
  // Function to navigate directly to a specific step
  const goToStep = (stepNumber) => {
    // Validate previous steps before allowing direct navigation
    let canNavigate = true;
    
    // Always validate basic info before allowing navigation to other steps
    if (stepNumber > 1) {
      const { isValid } = validateReportForm(formData, 1);
      if (!isValid) {
        setError('Please complete the Basic Info step before navigating to this step.');
        canNavigate = false;
      }
    }
    
    // For photo step (2) and beyond, ensure photos are uploaded
    if (stepNumber > 2 && uploadedPhotos.length === 0) {
      setError('Please upload photos before navigating to this step.');
      canNavigate = false;
    }
    
    if (canNavigate) {
      setError(null);
      setStep(stepNumber);
    }
  };
  
  // Render current step
  const renderCurrentStep = () => {
    switch (step) {
      case 1:
        return (
          <BasicInfoStep 
            formData={formData} 
            handleChange={handleChange} 
            nextStep={nextStep} 
          />
        );
      case 2:
        return (
          <PhotoUploadStep 
            uploadedPhotos={uploadedPhotos}
            onUploadComplete={handlePhotoUploadComplete}
            reportId={existingReport?._id || formData._id}
            prevStep={() => setStep(1)}
            nextStep={() => setStep(3)}
          />
        );
      case 3:
        return (
          <AIAnalysisStep 
            uploadedPhotos={uploadedPhotos} 
            formData={formData} 
            handlePhotoUploadComplete={handlePhotoUploadComplete} 
            handleGenerateAISummary={handleGenerateAISummary}
            generatingSummary={generatingSummary}
            addDamage={addDamage}
            updateDamage={updateDamage}
            removeDamage={removeDamage}
            prevStep={prevStep} 
            nextStep={nextStep} 
          />
        );
      case 4:
        return (
          <ReviewStep 
            formData={formData}
            handleChange={handleChange}
            uploadedPhotos={uploadedPhotos} 
            addDamage={addDamage}
            updateDamage={updateDamage}
            removeDamage={removeDamage}
            handleSubmit={handleSubmit}
            isSubmitting={isSubmitting} 
            pdfUrl={pdfUrl}
            error={error}
            prevStep={prevStep} 
          />
        );
      default:
        return <div>Unknown step</div>;
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto bg-card p-8 rounded-lg shadow-md">
      {hasBackup && (
        <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-300 px-4 py-3 rounded mb-4 flex justify-between items-center">
          <div>
            <p className="font-bold">Backed up report data available</p>
            <p className="text-sm">There is saved report data that you can restore if needed.</p>
          </div>
          <div className="flex space-x-2">
            <button 
              type="button"
              onClick={handleRestoreFromBackup}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Restore
            </button>
            <button 
              type="button"
              onClick={handleClearBackup}
              className="bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <StepIndicator currentStep={step} onStepClick={isEditing ? goToStep : null} />
      
      <form onSubmit={handleSubmit}>
        {renderCurrentStep()}
      </form>
    </div>
  );
};

export default ReportForm; 