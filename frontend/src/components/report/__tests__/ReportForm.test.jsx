import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportForm from '../ReportForm';
import BasicInfoStep from '../BasicInfoStep';
import PhotoUploadStep from '../PhotoUploadStep';
import AIAnalysisStep from '../AIAnalysisStep';
import ReviewStep from '../ReviewStep';
import StepIndicator from '../StepIndicator';
import DamageForm from '../DamageForm';

// Mock services
jest.mock('../../../services/reportService', () => ({
  createReport: jest.fn().mockResolvedValue({ data: { _id: '123' } }),
  updateReport: jest.fn().mockResolvedValue({ data: { _id: '123' } }),
  generateAISummary: jest.fn().mockResolvedValue({
    data: {
      summary: 'Test summary',
      recommendations: 'Test recommendations',
      damages: [
        { type: 'Roof Damage', severity: 'moderate', description: 'Test description' }
      ]
    }
  }),
  generateReportPdf: jest.fn().mockResolvedValue({ data: { pdfUrl: 'http://test.pdf' } }),
}));

// Mock the PhotoUploader component
jest.mock('../../photo/PhotoUploader', () => {
  return function DummyPhotoUploader({ onUploadComplete }) {
    return (
      <div data-testid="photo-uploader">
        <button 
          onClick={() => onUploadComplete([
            { id: '1', preview: 'test.jpg', analysis: { damageType: 'Roof', severity: 'Moderate' } }
          ])}
        >
          Mock Upload
        </button>
      </div>
    );
  };
});

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Report Form Components', () => {
  describe('ReportForm', () => {
    it('renders the form with step indicator', () => {
      render(
        <MemoryRouter>
          <ReportForm />
        </MemoryRouter>
      );
      
      expect(screen.getByText('Create New Report')).toBeInTheDocument();
      // First step should be visible
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
    });
  });
  
  describe('StepIndicator', () => {
    it('renders the correct step indicators', () => {
      render(<StepIndicator currentStep={2} totalSteps={4} />);
      
      // Step 1 should be completed
      const step1 = screen.getByText('Basic Info').parentElement;
      expect(step1).toHaveClass('text-green-500');
      
      // Step 2 should be active
      const step2 = screen.getByText('Upload Photos').parentElement;
      expect(step2).toHaveClass('text-blue-500');
      
      // Steps 3 and 4 should be inactive
      const step3 = screen.getByText('AI Analysis').parentElement;
      expect(step3).toHaveClass('text-gray-400');
      
      const step4 = screen.getByText('Review & Finalize').parentElement;
      expect(step4).toHaveClass('text-gray-400');
    });
  });
  
  describe('BasicInfoStep', () => {
    it('renders the form fields correctly', () => {
      const mockFormData = {
        title: '',
        clientName: '',
        propertyAddress: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'USA',
        },
        inspectionDate: '2023-01-01',
        weather: {
          temperature: '',
          conditions: '',
          windSpeed: '',
        },
      };
      
      const mockHandleChange = jest.fn();
      const mockNextStep = jest.fn();
      
      render(
        <BasicInfoStep 
          formData={mockFormData}
          handleChange={mockHandleChange}
          nextStep={mockNextStep}
        />
      );
      
      expect(screen.getByLabelText('Report Title')).toBeInTheDocument();
      expect(screen.getByLabelText('Client Name')).toBeInTheDocument();
      expect(screen.getByText('Property Address')).toBeInTheDocument();
      expect(screen.getByLabelText('Inspection Date')).toBeInTheDocument();
      expect(screen.getByText('Weather Conditions')).toBeInTheDocument();
      
      // Next button should work
      fireEvent.click(screen.getByText('Next: Upload Photos'));
      expect(mockNextStep).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('DamageForm', () => {
    it('renders damage entries and allows adding new ones', () => {
      const mockDamages = [
        { type: 'Roof Damage', severity: 'moderate', description: 'Test description' }
      ];
      
      const mockAddDamage = jest.fn();
      const mockUpdateDamage = jest.fn();
      const mockRemoveDamage = jest.fn();
      
      render(
        <DamageForm 
          damages={mockDamages}
          addDamage={mockAddDamage}
          updateDamage={mockUpdateDamage}
          removeDamage={mockRemoveDamage}
        />
      );
      
      // Should display existing damage
      expect(screen.getByDisplayValue('Roof Damage')).toBeInTheDocument();
      expect(screen.getByDisplayValue('moderate')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test description')).toBeInTheDocument();
      
      // Click add damage button
      fireEvent.click(screen.getByText('Add Damage'));
      expect(mockAddDamage).toHaveBeenCalledTimes(1);
    });
  });
}); 