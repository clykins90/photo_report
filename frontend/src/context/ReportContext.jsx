import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { createReport, updateReport, generateAISummary, generateReportPdf } from '../services/reportService';
import { usePhotoContext } from './PhotoContext';
import { validateReportForm, getFormErrorMessage } from '../utils/formValidation';
import api from '../services/api';

// Create context
const ReportContext = createContext();

// Custom hook for using the report context
export const useReportContext = () => {
  const context = useContext(ReportContext);
  if (!context) {
    throw new Error('useReportContext must be used within a ReportProvider');
  }
  return context;
};

export const ReportProvider = ({ children }) => {
  // Get photo context
  const { 
    photos, 
    uploadPhotosToServer, 
    analyzePhotos: analyzePhotosInContext 
  } = usePhotoContext();
  
  // Memoize the validation function to prevent it from being recreated on every render
  const memoizedValidateReportForm = useMemo(() => {
    return validateReportForm;
  }, []);

  // Report state
  const [report, setReport] = useState({
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

  // Additional state
  const [step, setStep] = useState(1);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);

  // Handle field changes
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setReport(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value,
        },
      }));
    } else {
      setReport(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  }, []);

  // Load existing report
  const loadReport = useCallback((reportData) => {
    if (!reportData) return;

    // Set report data
    setReport({
      _id: reportData._id,
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
  }, []);

  // Add a damage item
  const addDamage = useCallback(() => {
    setReport(prev => ({
      ...prev,
      damages: [
        ...prev.damages,
        {
          type: '',
          severity: 'minor',
          description: '',
        },
      ],
    }));
  }, []);

  // Update a damage item
  const updateDamage = useCallback((index, field, value) => {
    setReport(prev => {
      const updatedDamages = [...prev.damages];
      updatedDamages[index] = {
        ...updatedDamages[index],
        [field]: value,
      };
      
      return {
        ...prev,
        damages: updatedDamages,
      };
    });
  }, []);

  // Remove a damage item
  const removeDamage = useCallback((index) => {
    setReport(prev => {
      const updatedDamages = [...prev.damages];
      updatedDamages.splice(index, 1);
      
      return {
        ...prev,
        damages: updatedDamages,
      };
    });
  }, []);

  // Generate AI summary from analyzed photos
  const generateSummary = useCallback(async () => {
    // Check if we have analyzed photos
    const analyzedPhotos = photos.filter(photo => photo.analysis);
    
    if (analyzedPhotos.length === 0) {
      setError('Please analyze photos before generating a summary');
      return;
    }
    
    try {
      setGeneratingSummary(true);
      setError(null);
      
      // Prepare photos data for API
      const photoData = analyzedPhotos.map(photo => ({
        id: photo._id || photo.id,
        name: photo.name,
        description: photo.description || '',
        analysis: photo.analysis || null
      }));
      
      // Call the API to generate a summary
      const result = await generateAISummary(photoData);
      
      if (result.data) {
        // Update the report with the generated data
        setReport(prev => ({
          ...prev,
          summary: result.data.summary || prev.summary,
          recommendations: result.data.recommendations || prev.recommendations,
          materials: result.data.materials || prev.materials,
          tags: result.data.tags || prev.tags,
        }));
        
        // Add new damages if any
        if (result.data.damages && result.data.damages.length > 0) {
          const existingDamageTypes = report.damages.map(d => d.type.toLowerCase());
          
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
            setReport(prev => ({
              ...prev,
              damages: [...prev.damages, ...newDamages],
            }));
          }
        }
        
        return result;
      } else {
        throw new Error('No data returned from summary generation');
      }
    } catch (err) {
      setError(err.message || 'Failed to generate AI summary');
      throw err;
    } finally {
      setGeneratingSummary(false);
    }
  }, [photos, report.damages]);

  // Generate PDF from report data
  const generatePdf = useCallback(async (user) => {
    if (!report._id) {
      setError('Report must be saved before generating a PDF');
      return;
    }
    
    if (!user) {
      setError('You must be logged in to generate a PDF report');
      return;
    }
    
    try {
      setGeneratingPdf(true);
      setError(null);
      
      // Generate PDF
      const result = await generateReportPdf(report._id);
      
      // Set the PDF URL for download
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const pdfUrl = result.data.pdfUrl.startsWith('http') 
        ? result.data.pdfUrl 
        : `${baseURL}${result.data.pdfUrl}`;
      
      setPdfUrl(pdfUrl);
      return pdfUrl;
    } catch (err) {
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }, [report._id]);

  // Create a draft report to get an ID
  const createDraftReport = useCallback(async (user, reportData = null) => {
    // console.log("createDraftReport called with user:", user);
    try {
      // Use provided reportData or fall back to current report state
      // This prevents dependency on the report state which can cause infinite loops
      const currentReport = reportData || report;
      
      // Create a minimal report with just the basic info
      const draftData = {
        title: currentReport.title || 'Draft Report',
        clientName: currentReport.clientName || 'Draft Client',
        propertyAddress: currentReport.propertyAddress,
        inspectionDate: currentReport.inspectionDate,
        isDraft: true,
        user: user?._id
      };
      
      // console.log("Creating draft with data:", draftData);
      const response = await createReport(draftData);
      const reportId = response._id || response.data._id;
      // console.log("Draft report created with ID:", reportId);
      
      // Update report with the new ID
      setReport(prev => ({
        ...prev,
        _id: reportId
      }));
      
      return reportId;
    } catch (err) {
      // console.error("Error creating draft report:", err);
      setError('Error creating draft report: ' + err.message);
      throw err;
    }
  }, [setReport, setError, createReport]);

  // Submit the report
  const submitReport = useCallback(async (user) => {
    if (!user) {
      setError('You must be logged in to submit a report');
      return;
    }
    
    // First check for address validation explicitly
    const addressMissing = !report.propertyAddress?.street?.trim() ||
                          !report.propertyAddress?.city?.trim() ||
                          !report.propertyAddress?.state?.trim() ||
                          !report.propertyAddress?.zipCode?.trim();
    
    if (addressMissing) {
      setError('Please complete all property address fields');
      return;
    }
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      // Create default company information if missing
      let companyData;
      
      if (!user.company) {
        // Placeholder company data
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
          website: "[WEBSITE]"
        };
      } else if (typeof user.company === 'string') {
        try {
          // Fetch company data
          const companyRes = await api.get('/company');
          companyData = companyRes.data.data || companyRes.data;
        } catch (err) {
          // Fallback to ID
          companyData = {
            name: "[COMPANY NAME]",
            _id: user.company
          };
        }
      } else {
        // Company data is embedded in user
        companyData = user.company;
      }
      
      // Build the report data
      const reportData = {
        ...report,
        user: user._id,
        company: companyData
      };
      
      // Create or update the report
      let response;
      
      if (report._id) {
        response = await updateReport(report._id, reportData);
      } else {
        response = await createReport(reportData);
      }
      
      // Get the report ID
      const reportId = response._id || response.data._id;
      
      // Update the report state with the ID
      setReport(prev => ({
        ...prev,
        _id: reportId
      }));
      
      return reportId;
    } catch (err) {
      setError(err.message || 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  }, [report]);

  // Validate the current step without causing re-renders
  const validateStep = useCallback((currentStep = step) => {
    // Only perform validation if we have a report object
    if (!report) return false;
    
    // Perform validation without setting state unless necessary
    const { isValid, errors } = validateReportForm(report, currentStep);
    
    // Store validation result without triggering state updates
    if (!isValid) {
      // Only set error if there's actually an error message to show and it's different
      const errorMessage = getFormErrorMessage(errors);
      if (errorMessage && errorMessage !== error) {
        // Use a timeout to break the render cycle
        setTimeout(() => {
          setError(errorMessage);
        }, 0);
      }
      return false;
    }
    
    // Only clear error if it was previously set and we're valid
    if (error) {
      // Use a timeout to break the render cycle
      setTimeout(() => {
        setError(null);
      }, 0);
    }
    return true;
  // Using an empty dependency array to prevent infinite loops
  // We're capturing the values inside the function
  }, []);

  // Move to the next step - completely refactored to prevent infinite loops
  const nextStep = useCallback(async (user) => {
    // Prevent multiple calls to nextStep in the same render cycle
    if (isSubmitting) return null;
    
    // Create a local copy of all needed state to avoid dependencies
    const currentStep = step;
    const currentReport = {...report};
    const hasReportId = !!currentReport._id;
    
    // Set submitting immediately to prevent multiple calls
    setIsSubmitting(true);
    
    try {
      // Create a local copy of the validation function to avoid closures
      const validationResult = (() => {
        try {
          return validateReportForm(currentReport, currentStep);
        } catch (err) {
          console.error('Validation error:', err);
          return { isValid: false, errors: { general: 'Validation error' } };
        }
      })();
      
      if (!validationResult.isValid) {
        // Use timeout to break render cycle
        setTimeout(() => {
          setError(getFormErrorMessage(validationResult.errors));
          setIsSubmitting(false);
        }, 0);
        return null;
      }
      
      // For new reports at step 1, create a draft report
      if (currentStep === 1 && !hasReportId) {
        // Make sure user is an object and not treated as a function
        if (!user || typeof user !== 'object') {
          setTimeout(() => {
            setError('Authentication error: Please try logging in again');
            setIsSubmitting(false);
          }, 0);
          return null;
        }
        
        try {
          // Create draft report with the local copy of data
          const response = await createReport({
            title: currentReport.title || 'Draft Report',
            clientName: currentReport.clientName || 'Draft Client',
            propertyAddress: currentReport.propertyAddress,
            inspectionDate: currentReport.inspectionDate,
            isDraft: true,
            user: user._id
          });
          
          const reportId = response._id || response.data?._id;
          
          // Use timeout to break render cycle
          setTimeout(() => {
            // Update report with the new ID
            setReport(prev => ({...prev, _id: reportId}));
            setStep(currentStep + 1);
            setIsSubmitting(false);
          }, 0);
          
          return reportId;
        } catch (err) {
          setTimeout(() => {
            setError('Failed to create draft report: ' + (err.message || 'Unknown error'));
            setIsSubmitting(false);
          }, 0);
          return null;
        }
      } else {
        // For existing reports or other steps, just increment the step
        setTimeout(() => {
          setStep(currentStep + 1);
          setIsSubmitting(false);
        }, 0);
        return currentReport._id;
      }
    } catch (err) {
      setTimeout(() => {
        setError('Error proceeding to next step: ' + (err.message || 'Unknown error'));
        setIsSubmitting(false);
      }, 0);
      return null;
    }
  // Explicitly exclude report and step from dependencies to prevent infinite loops
  // We're using local copies inside the function
  }, []);

  // Move to the previous step
  const prevStep = useCallback(() => {
    setStep(Math.max(1, step - 1));
  }, [step]);

  // Go to a specific step
  const goToStep = useCallback((stepNumber) => {
    // Validate previous steps
    if (stepNumber > 1) {
      const isValid = validateStep(1);
      if (!isValid) return;
    }
    
    // If going past the photo step, ensure we have photos
    if (stepNumber > 2 && photos.length === 0) {
      setError('Please upload photos before proceeding');
      return;
    }
    
    setStep(stepNumber);
  }, [photos.length, validateStep, setError]);

  // Reset the report state for a new report
  const resetReport = useCallback(() => {
    setReport({
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
    setStep(1);
    setError(null);
    setPdfUrl(null);
  }, []);

  // Context value
  const contextValue = {
    report,
    step,
    error,
    isSubmitting,
    generatingSummary,
    generatingPdf,
    pdfUrl,
    setReport,
    handleChange,
    loadReport,
    addDamage,
    updateDamage,
    removeDamage,
    generateSummary,
    generatePdf,
    submitReport,
    validateStep,
    nextStep,
    prevStep,
    goToStep,
    resetReport,
    setError,
    createDraftReport
  };

  return (
    <ReportContext.Provider value={contextValue}>
      {children}
    </ReportContext.Provider>
  );
};

export default ReportContext; 