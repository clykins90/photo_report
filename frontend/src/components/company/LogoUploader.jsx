import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const LogoUploader = ({ currentLogo, onLogoUpdate, hidePreview = false }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentLogo ? `${api.defaults.baseURL}${currentLogo}` : null);
  const fileInputRef = useRef(null);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.match('image.*')) {
      toast.error('Please upload an image file (JPG, PNG, etc.)');
      return;
    }

    // Preview selected image
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target.result);
    reader.readAsDataURL(file);

    // Create form data for upload
    const formData = new FormData();
    formData.append('logo', file);

    try {
      setIsUploading(true);
      
      // Upload logo to backend
      const response = await api.post(
        '/api/company/logo',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Handle nested data structure if present
      const responseData = response.data.data || response.data;
      
      // Update with the URL from server (adds cache busting)
      setPreviewUrl(`${api.defaults.baseURL}${responseData.logo}?t=${Date.now()}`);
      
      if (onLogoUpdate) {
        onLogoUpdate(responseData.logo);
      }
      
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error(error.response?.data?.message || 'Failed to upload logo');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-4">
        {!hidePreview && (
          <label className="block text-card-foreground text-sm font-bold mb-2">
            Company Logo
          </label>
        )}
        
        <div className="flex items-center space-x-4">
          {/* Logo preview - only shown when hidePreview is false */}
          {!hidePreview && (
            <div 
              className="w-32 h-32 border-2 border-dashed border-input rounded-lg flex items-center justify-center bg-muted/20 overflow-hidden cursor-pointer"
              onClick={triggerFileInput}
            >
              {previewUrl ? (
                <img 
                  src={previewUrl} 
                  alt="Company Logo" 
                  className="max-w-full max-h-full object-contain" 
                />
              ) : (
                <div className="text-center p-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2 text-sm text-muted-foreground">No logo</p>
                </div>
              )}
            </div>
          )}
          
          <div className="flex flex-col">
            <button
              type="button"
              onClick={triggerFileInput}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 mb-2"
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload Logo'}
            </button>
            
            {previewUrl && (
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  fileInputRef.current.value = '';
                  if (onLogoUpdate) onLogoUpdate(null);
                }}
                className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-muted focus:ring-opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleLogoUpload}
          className="hidden"
          accept="image/*"
        />
        
        {!hidePreview && (
          <p className="text-sm text-muted-foreground mt-2">
            Upload a logo that will appear on your PDF reports. For best results, use a PNG with transparent background.
          </p>
        )}
      </div>
    </div>
  );
};

export default LogoUploader; 