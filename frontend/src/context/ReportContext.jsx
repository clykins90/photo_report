import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import { createReport, updateReport, generateAISummary, generateReportPdf } from '../services/reportService';
import { usePhotoContext } from './PhotoContext';
import { validateReportForm, getFormErrorMessage } from '../utils/formValidation';
import api from '../services/api';
import { useAuth } from './AuthContext';

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
  // Get auth context
  const { user: currentUser } = useAuth();
  
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

  // Create a draft report to get an ID
  const createDraftReport = useCallback(async (user = null) => {
    try {
      // Create a minimal report with just the basic info
      const draftData = {
        title: report.title || 'Draft Report',
        clientName: report.clientName || 'Draft Client',
        propertyAddress: report.propertyAddress,
        inspectionDate: report.inspectionDate,
        isDraft: true,
        // Use user ID if available
        user: user?._id || null
      };
      
      const response = await createReport(draftData);
      const reportId = response._id || response.data._id;
      
      // Update report with the new ID
      setReport(prev => ({
        ...prev,
        _id: reportId
      }));
      
      return reportId;
    } catch (err) {
      setError('Error creating draft report: ' + err.message);
      throw err;
    }
  }, [report, setReport, setError]);

  // Generate PDF from report data
  const generatePdf = useCallback(async () => {
    if (!report._id) {
      // Auto-create a draft report if needed
      try {
        await createDraftReport(currentUser);
      } catch (err) {
        setError('Failed to create draft report before PDF generation');
        return;
      }
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
  }, [report._id, createDraftReport, currentUser]);

  // Submit the report
  const submitReport = useCallback(async (user) => {
    if (!user) {
      setError('You must be logged in to submit a report');
      return;
    }
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      // Build the report data
      const reportData = {
        ...report,
        user: user._id,
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

  // Simplified step navigation - these no longer need validation
  const nextStep = useCallback(async () => {
    // If we're on step 1 and don't have a report ID, we need to create a draft
    if (step === 1 && !report._id) {
      try {
        await createDraftReport(currentUser);
      } catch (err) {
        console.error("Failed to create draft report:", err);
        // Continue anyway - we'll handle missing ID in the next step
      }
    }
    setStep(prevStep => Math.min(prevStep + 1, 3));
  }, [step, report._id, createDraftReport, currentUser]);

  const prevStep = useCallback(() => {
    setStep(prevStep => Math.max(prevStep - 1, 1));
  }, []);

  const goToStep = useCallback((stepNumber) => {
    if (stepNumber >= 1 && stepNumber <= 3) {
      setStep(stepNumber);
    }
  }, []);

  // Reset the report state
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

  // Expose all needed values and functions
  const contextValue = {
    report,
    step,
    error,
    isSubmitting,
    generatingSummary,
    generatingPdf,
    pdfUrl,
    handleChange,
    loadReport,
    resetReport,
    addDamage,
    updateDamage,
    removeDamage,
    submitReport,
    generateSummary,
    generatePdf,
    nextStep,
    prevStep,
    goToStep,
  };

  return (
    <ReportContext.Provider value={contextValue}>
      {children}
    </ReportContext.Provider>
  );
};

export default ReportContext; 