import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import PropTypes from 'prop-types';

/**
 * Component for handling file dropzone functionality
 */
const PhotoDropzone = ({ onDrop, disabled, maxSize = 20971520 }) => {
  // Handle file drop
  const handleDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles?.length > 0) {
      onDrop(acceptedFiles);
    }
  }, [onDrop]);

  // Initialize dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.heic', '.webp']
    },
    disabled,
    maxSize, // 20MB default max file size
    multiple: true
  });

  return (
    <div 
      {...getRootProps()} 
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'opacity-100'}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center gap-2">
        <svg 
          className="w-10 h-10 text-gray-400" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth="2" 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {isDragActive ? (
          <p className="text-blue-500 font-medium">Drop the files here...</p>
        ) : (
          <div>
            <p className="font-medium text-gray-700">Drag photos here or click to browse</p>
            <p className="text-sm text-gray-500 mt-1">Supports JPG, PNG, GIF, HEIC, WebP</p>
          </div>
        )}
      </div>
    </div>
  );
};

PhotoDropzone.propTypes = {
  onDrop: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  maxSize: PropTypes.number
};

export default PhotoDropzone; 