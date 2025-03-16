import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { createReport, updateReport, generateAISummary, generateReportPdf } from '../../services/reportService';
import { uploadPhotos } from '../../services/photoService';
import { validateReportForm, getFormErrorMessage } from '../../utils/formValidation';
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
          const photoUrl = `${baseApiUrl}/photos/${filename}`;
          
          console.log(`Processing photo ${index}:`, { 
            original: photo,
            filename, 
            url: photoUrl
          });
          
          // Return a properly formatted photo object
          return {
            id: photo._id || photo.id || `temp-${index}`,
            name: photo.displayName || photo.name || filename,
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
      // Create a new object to avoid modifying the original
      const processedPhoto = { ...photo };
      
      // Ensure preview URL is preserved for local display
      if (photo.preview) {
        processedPhoto.preview = photo.preview;
      }
      
      // Make sure we have a URL for the photo
      if (!processedPhoto.url) {
        const baseApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        
        // Try to construct a URL from available identifiers
        if (processedPhoto._id) {
          processedPhoto.url = `${baseApiUrl}/photos/${processedPhoto._id}`;
        } else if (processedPhoto.fileId) {
          processedPhoto.url = `${baseApiUrl}/photos/${processedPhoto.fileId}`;
        } else if (processedPhoto.id) {
          processedPhoto.url = `${baseApiUrl}/photos/${processedPhoto.id}`;
        } else if (processedPhoto.filename) {
          processedPhoto.url = `${baseApiUrl}/photos/${processedPhoto.filename}`;
        }
      }
      
      return processedPhoto;
    });
    
    console.log('Processed photos:', processedPhotos);
    setUploadedPhotos(processedPhotos);
  };
  
  // Generate AI summary based on analyzed photos
  const handleGenerateAISummary = async (photosToAnalyze) => {
    // Use provided photos or fall back to uploadedPhotos
    const photosToUse = photosToAnalyze || uploadedPhotos;
    
    // Check if we have analyzed photos
    const analyzedPhotos = photosToUse.filter(photo => photo.analysis && photo.analysis.description);
    
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
        name: photo.displayName || photo.name,
        description: photo.description,
        url: photo.url,
        preview: photo.preview,
        status: photo.status,
        analysis: photo.analysis ? {
          description: photo.analysis.description,
          tags: photo.analysis.tags,
          damageDetected: photo.analysis.damageDetected,
          confidence: photo.analysis.confidence,
          severity: photo.analysis.severity,
          damageType: photo.analysis.damageType,
          location: photo.analysis.location,
          materials: photo.analysis.materials,
          recommendedAction: photo.analysis.recommendedAction
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
      
      // Return the result so it can be used by the caller
      return result;
      
    } catch (err) {
      console.error('Failed to generate AI summary:', err);
      setError(err.message || 'Failed to generate AI summary. Please try again.');
      throw err; // Re-throw to allow caller to handle the error
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
      const preparedPhotos = uploadedPhotos.map(photo => {
        // Get the best URL for the photo using the same logic as display
        const baseApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        let photoUrl;
        
        // Prioritize server-side URLs for PDF generation
        if (photo._id) {
          photoUrl = `${baseApiUrl}/photos/${photo._id}`;
        } else if (photo.filename) {
          photoUrl = `${baseApiUrl}/photos/${photo.filename}`;
        } else if (photo.url && photo.url.startsWith('http')) {
          photoUrl = photo.url;
        } else {
          // For local files, we need to use the preview URL
          photoUrl = photo.preview || '';
        }
        
        return {
          id: photo.id || photo._id,
          name: photo.displayName || photo.name,
          description: photo.description || '',
          url: photoUrl,
          preview: photoUrl,
          status: photo.status || 'uploaded',
          filename: photo.filename || photo.displayName || photo.name,
          analysis: photo.analysis ? {
            description: photo.analysis.description,
            tags: photo.analysis.tags,
            damageDetected: photo.analysis.damageDetected,
            confidence: photo.analysis.confidence,
            severity: photo.analysis.severity
          } : null
        };
      });
      
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
        // Fetch company data for branding
        const companyRes = await api.get('/company');
        
        // Handle nested data structure if present
        const companyResponseData = companyRes.data.data || companyRes.data;
        
        if (companyRes.data.success && companyResponseData) {
          companyData = companyResponseData;
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
      
      // Build the initial report data without photos
      const initialReportData = {
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
        // Include user ID and company data
        user: user._id,
        company: companyData
      };
      
      console.log('Creating initial report without photos');
      
      // Create or update the report
      let response;
      const reportId = reportData?._id || formData._id;
      
      if (isEditing && reportId) {
        console.log(`Updating report with ID: ${reportId}`);
        response = await updateReport(reportId, initialReportData);
      } else {
        console.log('Creating new report');
        response = await createReport(initialReportData);
      }
      
      // Get the report ID from the response
      const createdReportId = response._id || response.data._id;
      console.log('Report created/updated with ID:', createdReportId);
      
      // Check if we have photos with original file references that need to be uploaded
      const photosToUpload = uploadedPhotos.filter(photo => 
        photo.originalFile && 
        !photo._id && 
        photo.status !== 'complete'
      );
      
      if (photosToUpload.length > 0) {
        console.log(`Uploading ${photosToUpload.length} photos to the created report`);
        
        try {
          // Extract the original file objects
          const fileObjects = photosToUpload.map(photo => photo.originalFile);
          
          // Prepare metadata with client IDs
          const fileMetadata = photosToUpload.map(photo => ({
            clientId: photo.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          }));
          
          // Upload the photos to the report
          const uploadResponse = await uploadPhotos(
            fileObjects,
            createdReportId,
            (progress) => {
              // Only log every 10% to reduce noise
              if (progress % 10 === 0) {
                console.log(`Photo upload progress: ${progress}%`);
              }
            },
            fileMetadata // Pass the metadata with client IDs
          );
          
          if (!uploadResponse.success) {
            console.error('Photo upload failed:', uploadResponse.error);
            // Continue with navigation even if photo upload fails
            // The user can try uploading photos again later
          } else {
            const uploadedPhotos = uploadResponse.data?.photos || uploadResponse.photos || [];
            const idMapping = uploadResponse.data?.idMapping || uploadResponse.idMapping || {};
            console.log('Photos uploaded successfully:', uploadedPhotos.length);
            console.log('Client ID to Server ID mapping:', idMapping);
          }
        } catch (uploadErr) {
          console.error('Error during photo upload:', uploadErr.message);
          // Continue with navigation even if photo upload fails
        }
      }
      
      // Navigate to the report detail page
      navigate(`/reports/${createdReportId}`);
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
    
    // If moving from step 1 to step 2 and we don't have a reportId yet, create a draft report
    if (step === 1 && !existingReport?._id && !formData._id) {
      // Create a draft report to get an ID for photo uploads
      createDraftReport().then(() => {
        setStep(step + 1);
      }).catch(err => {
        console.error('Failed to create draft report:', err);
        setError('Failed to create draft report. Please try again.');
      });
    } else {
      // If moving from step 2 to step 3, ensure photos have usable identifiers
      if (step === 2) {
        // Filter to only photos with usable identifiers (url, preview, id, or fileId)
        const usablePhotos = uploadedPhotos.filter(photo => 
          photo.url || photo.preview || photo.id || photo._id || photo.fileId || photo.filename
        );
        
        if (usablePhotos.length === 0) {
          setError('No usable photos found. Please upload photos with valid identifiers.');
          return;
        }
        
        // Update state with usable photos
        setUploadedPhotos(usablePhotos);
      }
      
      setStep(step + 1);
    }
  };
  
  // Create a draft report to get an ID for photo uploads
  const createDraftReport = async () => {
    try {
      // Create a minimal report with just the basic info
      const draftData = {
        title: formData.title || 'Draft Report',
        clientName: formData.clientName || 'Draft Client',
        propertyAddress: formData.propertyAddress,
        inspectionDate: formData.inspectionDate,
        isDraft: true,
        user: user?._id
      };
      
      const response = await createReport(draftData);
      
      // Update formData with the new report ID
      setFormData(prev => ({
        ...prev,
        _id: response._id || response.data._id
      }));
      
      console.log('Created draft report with ID:', response._id || response.data._id);
      return response;
    } catch (err) {
      console.error('Error creating draft report:', err);
      throw err;
    }
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
            reportId={existingReport?._id || formData._id}
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