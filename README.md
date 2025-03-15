# HeroReport Application

A web application that helps contractors create professional photo reports for insurance claims.

## Overview

This application allows contractors to:
- Upload large batches of inspection photos for immediate processing
- Automatically analyze photos using AI to identify damage types
- Edit AI-generated descriptions for accuracy
- Generate professional PDF reports with company branding and table of contents
- Create visually appealing reports with color-coded damage indicators
- Organize photos with detailed analysis in an easy-to-read format
- Share reports with clients and insurance adjusters via secure links

## Technology Stack

### Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- GridFS for MongoDB file storage
- Multer for file handling
- Sharp for image processing
- JWT for authentication
- PDFKit for PDF generation with enhanced styling
- OpenAI API for photo analysis

### Frontend
- React.js
- Vite
- TailwindCSS
- React Router
- React Query
- Axios
- React Hook Form with Zod validation
- React Dropzone
- Context API for state management
- LocalStorage for persistent authentication

### Deployment
- Vercel for hosting both frontend and backend
- Custom Vercel configuration for monorepo structure
- Static build process for frontend with optimized asset delivery
- Serverless functions for backend API endpoints
- Configured with vercel.json for proper path rewrites and build settings
- Optimized for Vercel's serverless environment using `/tmp` directory for temporary file storage

### Photo Storage and Processing
- MongoDB GridFS for efficient storage of large photo collections
- Optimized photo upload process with batch processing
- Chunked upload support for large files to prevent timeouts
- Concurrent uploads for both regular and chunked files
- Configurable batch sizes and concurrency levels
- Automatic thumbnail generation for faster loading
- Secure photo access with proper authentication
- AI-powered photo analysis using OpenAI's Vision API
- Detailed damage assessment with severity ratings and confidence scores
- Batch processing of photos to avoid API rate limits

### Photo Analysis Workflow
1. Photos are uploaded to MongoDB GridFS with metadata linking them to reports
2. The analysis process retrieves photos from GridFS and creates temporary files
3. OpenAI's Vision API with GPT-4o-mini analyzes each photo for damage, providing detailed descriptions
4. Analysis results are stored with the photo metadata in the report document
5. Users can review and edit AI-generated descriptions before finalizing reports

### Troubleshooting Common Issues
- **"No photos found to analyze"**: Ensure photos are properly uploaded to the database and associated with the correct report ID
- **API 404 errors**: Check that the API endpoints are being called with the correct parameters and no unnecessary query strings
- **Analysis timeout**: Large batches of photos may exceed API timeouts; use smaller batches
- **Missing analysis results**: Verify that the OpenAI API key is valid and has sufficient quota
- **Photo upload failures**: Check file size limits and supported image formats

## Photo Service Architecture

The photo service has been simplified to focus on the core functionality:

1. **Upload**: Photos are uploaded directly to MongoDB GridFS storage
   - Files are processed in memory without writing to disk
   - When temporary storage is needed, the `/tmp` directory is used (compatible with Vercel)
   - Photos are associated with a specific report
   - Temporary files are automatically cleaned up after processing
   - Client-generated IDs are used to reliably track files from frontend to backend

2. **Retrieval**: Photos can be retrieved in two formats:
   - Original: Full-resolution image for detailed viewing and PDF generation
   - Thumbnail: Smaller version for report previews and editing interface

3. **Analysis**: Photos are analyzed using OpenAI's Vision API with GPT-4o-mini
   - Memory-based processing is used whenever possible
   - AI generates descriptions, tags, and damage assessments
   - Analysis results are stored with the photo in the database
   - Analysis can be performed on individual photos, specific photo sets, or all photos in a report

4. **Deletion**: Photos can be deleted from both the report and GridFS storage

### API Endpoints

- `POST /api/photos/upload`: Upload multiple photos for a report
  - Accepts client-generated IDs for reliable file tracking
  - Returns a mapping of client IDs to server IDs
  - Automatically uses regular upload for small files (< 5MB)
- `POST /api/photos/upload-chunk/init`: Initialize a chunked upload session
  - Creates a new upload session for large files
  - Returns an upload ID for tracking chunks
- `POST /api/photos/upload-chunk`: Upload a single chunk of a file
  - Accepts chunk index, total chunks, and upload ID
  - Stores chunks temporarily until all are received
- `POST /api/photos/complete-upload`: Complete a chunked upload
  - Combines all chunks into the final file
  - Stores the file in GridFS and associates it with the report
- `GET /api/photos/:id`: Retrieve a photo (original or thumbnail)
- `POST /api/photos/analyze`: Analyze photos with AI
  - Can analyze by reportId (all unanalyzed photos in a report)
  - Can analyze by photoId (a single specific photo)
  - Can analyze by photoIds (a specific set of photos)
- `DELETE /api/photos/:id`: Delete a photo

### Frontend Integration

The photo service is integrated with the frontend through several key components:

1. **PhotoUploader**: A reusable component for uploading photos
   - Supports drag-and-drop and file selection
   - Shows upload progress and status indicators
   - Automatically associates photos with reports
   - Provides a grid view of uploaded photos with status indicators
   - Uses client-generated IDs to reliably track files during upload

2. **PhotoService**: A service layer that handles communication with the backend
   - `uploadBatchPhotos`: Uploads multiple photos to the server with client IDs
   - `analyzePhotos`: Analyzes photos for a report
   - `analyzePhoto`: Analyzes a single photo
   - `analyzeBatchPhotos`: Analyzes a specific set of photos
   - `getPhotoUrl`: Generates URLs for accessing photos
   - `deletePhoto`: Deletes a photo from the server

3. **AIAnalysisStep**: A component for analyzing photos and generating summaries
   - Processes photos in batches to avoid rate limiting
   - Shows analysis progress with status indicators
   - Allows editing of AI-generated descriptions
   - Generates a summary of all analyzed photos

### Client ID Tracking System

The application uses a client-generated ID system to reliably track files from frontend to backend:

1. **Client ID Generation**: When a file is selected for upload, a unique client ID is generated
   - Format: `client_[timestamp]_[random string]`
   - Example: `client_1623456789123_a1b2c3d4e5`

2. **Upload Process**:
   - Client IDs are sent with each file in the upload request
   - Backend stores these client IDs with the uploaded files in MongoDB
   - Backend returns a mapping of client IDs to server-generated MongoDB IDs

3. **ID Mapping**:
   - The frontend uses the ID mapping to update its state
   - This ensures that each file in the UI is correctly associated with its corresponding database record
   - No more complex filename matching or guesswork is needed

4. **Benefits**:
   - 100% reliable file tracking even with duplicate filenames
   - Simplified code with direct ID lookups
   - Resilient to filename transformations and encoding issues
   - Works with any number of files in a batch upload

### Data Model

Photos are stored in two places:
1. **GridFS**: The actual photo binary data
2. **Report Document**: Photo metadata and analysis results

```json
// Photo schema within Report model
{
  "_id": "ObjectId",
  "filename": "example.jpg",
  "section": "Exterior",
  "userDescription": "Front of house",
  "aiAnalysis": {
    "description": "The image shows the front exterior of a two-story house...",
    "tags": ["exterior", "siding", "roof", "entrance"],
    "damageDetected": true,
    "severity": "moderate",
    "confidence": 0.85
  }
}
```

## Features

- **User Authentication**: Secure login and registration system with JWT
- **User Profile Management**: User and company information management
- **Streamlined Workflow**: Multi-step process from photo upload to PDF generation
  - Automatic photo upload when files are attached
  - Efficient batch processing of photos in groups of 5
  - Automatic summary generation after photo analysis
  - Real-time upload progress tracking with accurate status indicators
- **Form Validation**: Comprehensive client-side validation for all report forms
  - Required field validation with clear error messages for all fields
  - Property address validation with field-specific error handling
  - Date validation to ensure inspection dates are within reasonable ranges
  - Input format validation (e.g., zip code format)
  - Visual indicators for all required fields
- **AI Analysis**: Automated analysis of damage with editable descriptions
  - Uses OpenAI Vision API with GPT-4o-mini model for detailed damage assessment
  - Identifies damage type, severity, and provides professional descriptions
  - Extracts key information like location, materials, and recommended actions
  - Uses roofing industry terminology for insurance adjuster-friendly reports
  - Generates relevant tags for each photo to improve searchability
  - Provides confidence scores for each analysis
- **MongoDB GridFS Integration**: Scalable file storage solution
  - Stores images and PDFs directly in MongoDB using GridFS
  - Efficient streaming of files to/from the database
  - Built-in file chunking for handling large files
  - Eliminates dependency on external file storage services
  - Metadata support for advanced file organization and retrieval
- **Comprehensive Report Generation**: AI-powered summary of all analyzed photos
  - Uses GPT-4o-mini model for efficient and cost-effective report generation
  - Automatically aggregates findings from individual photo analyses
  - Creates a structured summary of all damages found
  - Identifies common materials across the inspection
  - Generates prioritized repair recommendations
  - Extracts relevant tags for the entire report
- **Photo Handling**: Photos are stored securely with multiple optimized versions:
  - Original: Preserves all original data and quality for archiving and detailed viewing
  - Optimized: Resized (1200px width) and compressed version for web display and PDF reports
  - Thumbnail: Small square version (300x300px) for galleries, previews, and listings
- **PDF Generation**: 
  - Creates professional, branded reports with company logo and colors
  - Automatically organizes photos with analysis in a structured format
  - Uses standard system fonts with a configurable font mapping system
  - Supports customizable layouts for different report types
- **Client Access**: Shareable links for clients to view reports without requiring an account
- **Multi-step Report Creation**: Intuitive form with steps for basic info, photos, damages, and review
- **Dashboard**: View and manage all your reports in one place
- **Report Details**: Comprehensive view of report information with options to edit, delete, and generate PDFs
- **Batch Photo Upload**: Support for uploading and processing large batches of photos at once
  - Handles multiple file uploads with proper field naming ('photos')
  - Processes images in parallel for efficiency
  - Extracts EXIF data when available
  - Generates optimized versions and thumbnails
  - Provides detailed progress feedback
- **Report Sharing**: Generate secure, time-limited links to share reports with clients

## Configuration

### Environment Variables

The application uses the following environment variables:

- `NODE_ENV`: Set to 'development', 'production', or 'test'
- `PORT`: The port the server will run on
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT token generation
- `JWT_EXPIRATION`: JWT token expiration time
- `OPENAI_API_KEY`: API key for OpenAI services
- `LOG_LEVEL`: Controls verbosity of server logs (ERROR, WARN, INFO, DEBUG)

### Logging System

The application includes a configurable logging system:

- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Environment-based defaults**: 
  - Production: INFO level (errors, warnings, and important information)
  - Development: DEBUG level (all logs including detailed debugging information)
- **Override via Environment**: Set LOG_LEVEL environment variable to change the logging level
- **Optimized Upload Logging**: Reduces noise by only logging the start and completion of file uploads
- **Photo Upload Logging Control**: 
  - Set `VITE_VERBOSE_PHOTO_LOGGING=true` in frontend environment to enable verbose logging
  - Use `localStorage.setItem('verbosePhotoLogging', 'true')` in browser console for temporary verbose logging
  - By default, batch photo uploads only log essential information (start/completion) to reduce console noise
  - Error logs are always preserved regardless of verbosity settings
  - For large batch uploads (40+ images), logs are reduced by ~95% in default mode

## Troubleshooting

### Photo Analysis Issues

#### Invalid File ID Format
If you encounter errors related to "Invalid file ID format" during photo analysis:

1. **MongoDB ObjectId Requirement**: The system requires all file IDs to be valid MongoDB ObjectIds (24-character hexadecimal strings).
2. **Temporary IDs**: Temporary IDs generated during the upload process are prefixed with `temp_` to distinguish them from MongoDB ObjectIds.
3. **ID Validation**: The system now validates file IDs before attempting to use them for analysis, providing clearer error messages.
4. **Automatic ID Conversion**: The frontend now attempts to extract valid MongoDB ObjectIds from photo objects before sending them for analysis.
5. **Enhanced File Lookup**: The backend now uses multiple strategies to find files in GridFS:
   - Direct ID lookup using the provided ID
   - Lookup by metadata.originalFileId
   - Lookup by metadata._id
   - Lookup by metadata.gridfsId
   - Fallback to searching all files for matching IDs

These improvements ensure that only valid MongoDB ObjectIds are used for photo analysis, preventing errors related to invalid ID formats, and provide robust fallback mechanisms for finding files in GridFS.

#### Handling FileSystemFileHandle Objects and Relative Paths
If you encounter errors like "Unable to determine photo URL from object" with FileSystemFileHandle objects:

1. **Enhanced Path Handling**: The system now properly handles file objects with FileSystemFileHandle properties:
   - Extracts filenames from path or relativePath properties
   - Removes leading ./ from paths to ensure proper URL construction
   - Uses the handle.name property as a fallback
   - Adds multiple fallback mechanisms for URL generation

2. **Improved URL Generation**: The getPhotoUrl function now has enhanced capabilities:
   - Prioritizes server-provided URLs (thumbnailUrl, optimizedUrl, originalUrl)
   - Falls back to path-based URL generation for FileSystemFileHandle objects
   - Handles relative paths with proper normalization
   - Provides clear debug information when URL generation fails

3. **API Path Handling**: The API entry point now properly handles paths with special characters:
   - Decodes URL components to handle special characters
   - Removes leading ./ from paths to prevent routing issues
   - Provides detailed logging for URL modifications

4. **Image Loading Retries**: The image display components now use a multi-stage retry strategy:
   - First attempt: Uses the standard URL with a cache-busting parameter
   - Second attempt: Tries with the direct path if available
   - Final fallback: Uses a placeholder image
   - Limits retries to prevent infinite loops

5. **Read-only File Properties**: Fixed issues with trying to modify read-only properties of File objects:
   - Uses a separate `displayName` property instead of trying to modify the read-only `name` property
   - Creates new objects instead of modifying original File objects
   - Properly handles File objects during upload without attempting to modify them
   - Fixes "Cannot set property name of #<File> which has only a getter" errors

These improvements ensure that photos with FileSystemFileHandle objects and relative paths are properly displayed throughout the application.

### PDF Image Display Issues

If images aren't displaying in generated PDFs despite being stored in MongoDB:

1. **Blob URL Handling**: The application now properly handles blob URLs in photo objects by using the filename instead of the blob URL.
2. **GridFS Image Retrieval**: Enhanced error handling and logging for GridFS image retrieval ensures proper image data is loaded.
3. **Image Format Validation**: Added validation to check image data before embedding in PDFs to prevent format-related errors.
4. **Robust File Lookup**: Implemented a multi-stage file lookup process that tries several methods to find the correct file:
   - Direct ID lookup using the stored ID
   - Searching by metadata.originalFileId
   - Searching by reportId
   - Searching by filename with exact match
   - Searching by filename with timestamp prefix removed
   - Searching by core filename (without timestamps and prefixes)
   - Fuzzy filename matching with regex
5. **ID Reconciliation**: The system now reconciles photo IDs in reports with actual file IDs in GridFS, updating references as needed.
6. **Blob URL Resolution**: Fixed issue where blob URLs in the database couldn't be resolved by implementing filename-based lookups.
7. **Enhanced Logging**: Added detailed logging throughout the PDF generation process to help diagnose image loading issues.

These fixes ensure that images stored in MongoDB GridFS are properly retrieved and embedded in PDF reports, even when there are mismatches between the IDs stored in the report and the actual file IDs in MongoDB, or when blob URLs are stored in the database instead of proper file references.

#### Fixing 404 NOT_FOUND Errors
If you encounter a 404 NOT_FOUND error in your Vercel deployment, check the following:

1. **Verify vercel.json Configuration**:
   - Ensure the `outputDirectory` points to `frontend/dist`
   - Use the newer Vercel configuration format with `buildCommand` and `rewrites`
   - Make sure the API route uses the `:path*` parameter for proper path matching

2. **Check Frontend Build**:
   - Run `cd frontend && npm run build` locally to verify the build process works
   - Ensure the `dist` directory is created with all necessary files

3. **Use Vercel Serverless Functions for API**:
   - Create an `api/index.js` file at the root to handle API requests
   - Make sure your Express app is properly exported from `backend/server.js`
   - Set up the proper `rewrites` in vercel.json to direct API requests to your serverless function

4. **Avoid Duplicate API Path Prefixes**:
   - The API entry point now strips the leading `/api` from URLs to prevent duplicate paths
   - This fixes issues where URLs like `/api/api/photos/filename.jpeg` would return 404 errors
   - All internal routes are still mounted with `/api` prefixes in the Express app
   - The URL modification is handled transparently for all API requests

5. **Example of a Working Configuration**:
   ```json
   {
     "version": 2,
     "buildCommand": "npm run install-all && cd frontend && npm run build",
     "outputDirectory": "frontend/dist",
     "rewrites": [
       { "source": "/api/:path*", "destination": "/api" }
     ],
     "functions": {
       "api/index.js": {
         "memory": 1024,
         "maxDuration": 10
       }
     }
   }
   ```

6. **Resolve Nested Directory Issues**:
   - If you have a nested directory structure (e.g., `frontend/frontend`), make sure your build path is correct
   - Check the actual output location of your build files
   - Use proper path references in your vercel.json configuration

7. **Environment Variables**:
   - Confirm all required environment variables are set in the Vercel project settings
   - Check that MongoDB connection string and other critical variables are properly configured

8. **Deployment Logs**:
   - Review the Vercel deployment logs for any build or runtime errors
   - Look for issues with the build process or missing dependencies

### Data Model Changes
- **User Profile with Company Information**: Company information is now embedded directly in the user profile
  - Eliminated the need for separate Company collection
  - Simplified registration process by allowing users to provide company information during signup
  - Improved data access patterns by eliminating the need for joins/lookups
  - Maintains all company branding, contact info, and settings directly with the user
- **Cascade Deletion for Reports**: Implemented automatic deletion of associated resources when reports are deleted
  - Photos associated with a report are now automatically deleted from GridFS when the report is deleted
  - PDF files generated for a report are also automatically removed when the report is deleted
  - Prevents orphaned files in the system, maintaining data integrity
  - Reduces storage usage by ensuring all unused resources are properly cleaned up
  - Ensures complete removal of all client data when a report is deleted

### Bug Fixes and Performance Improvements
- **GridFS Integration for File Storage**: Migrated photo and file storage to GridFS
  - Improved file storage capabilities by leveraging MongoDB's GridFS for scalable, reliable storage
  - Eliminated dependency on local filesystem, enabling better cloud deployment
  - Enhanced file metadata handling with robust querying capabilities
  - Added backward compatibility with filesystem storage for smooth migration
  - Implemented proper cleanup of files when no longer needed
  - Added dedicated API endpoints for file operations through GridFS
  - Improved error handling for file operations
- **Fixed API Path Prefix Issues**: Resolved problems with duplicate /api prefixes in URLs
  - Updated the API entry point to strip leading /api from incoming URLs to prevent routing issues
  - Centralized image URL handling using a consistent getPhotoUrl utility function
  - Fixed frontend components that were generating URLs with duplicate /api prefixes
  - Added specific handling for different base URL configurations across environments
  - Enhanced URL normalization to ensure correct paths in both development and production
  - Eliminated 404 errors caused by malformed URLs with duplicate /api segments
  - Improved debug logging to help identify URL-related issues
  - Fixed path normalization to only remove true duplicates (/api/api/) while preserving essential /api prefixes
  - Enhanced URL construction to ensure consistency across different API endpoints
- **Optimized GridFS Queries**: Implemented caching for frequently used GridFS operations
  - Added caching for empty queries to reduce database load
  - Implemented cache invalidation when files are added or deleted
  - Reduced excessive logging for repeated queries
  - Improved performance for PDF generation and photo analysis
  - Added TTL-based cache expiration to ensure data freshness
  - Reduced database queries by up to 90% for common operations
- **Fixed Report Deletion**: Updated report deletion to work with newer versions of Mongoose
  - Replaced deprecated `remove()` method with `findByIdAndDelete()`
  - Moved photo deletion logic from middleware to controller for more reliable execution
  - Improved photo deletion with more comprehensive file matching
  - Added additional logging for better debugging and verification
  - Enhanced error handling during the deletion process
  - Added support for finding related files by report ID
- **Resolved Circular Reference Issues**: Fixed JSON circular reference errors during report submission and backup
  - Added robust sanitization of photo data to remove circular references before storage
  - Implemented targeted cleanup to retain only essential properties in photo objects
  - Added type checking to ensure all values are properly serializable
  - Enhanced error handling for data size issues during backup and submission
- **Improved Company Information Handling**: Enhanced validation and processing of company data
  - Added better company data validation during authentication and report submission
  - Implemented automatic fetching of complete company information from API when only ID is available
  - Added fallback mechanisms for missing company information
  - Provided clear error messages for company-related validation issues
  - Enhanced error logging to identify company data inconsistencies
- **Improved User Experience for Company Information**: Made report creation more user-friendly
  - Added support for creating reports without requiring complete company information
  - Implemented placeholder values like "[COMPANY NAME]" when company data is missing
  - Enhanced PDF generation to properly handle placeholder values
  - Created visual indicators in reports to show where company information needs to be updated
  - Maintained data integrity while providing a smoother onboarding experience

### UI/UX Design Enhancements
- **Modern Design System**: Implemented shadcn/ui components for a cohesive, professional look
- **Improved Color Scheme**: Updated to a modern HSL-based color system with proper light/dark mode support
- **Enhanced Typography**: Improved font hierarchy and readability with consistent text styling
- **Responsive Navigation**: Added mobile-friendly navigation with animated dropdown menu
- **Interactive Components**: Implemented hover and focus states for better user feedback
- **Consistent Card Design**: Created reusable card components with proper spacing and shadows
- **Form Element Styling**: Enhanced inputs, buttons, and form elements for better usability
- **Dark Mode Support**: Added system-preference-based dark mode with ergonomic color adjustments
  - Reduced contrast for card and panel components in dark mode to prevent eye strain
  - Used HSL color variables for better readability and consistency across themes
  - Improved background/foreground color relationships for better accessibility
- **Advanced Branding Color Picker**: Enhanced company profile with intelligent color selection tools
  - Added predefined professional color palettes for quick selection
  - Implemented color harmony suggestions based on color theory (complementary, analogous, triadic)
  - Included enhanced visual preview of colors in context (headers, buttons, text)
  - Built-in accessibility checker to ensure sufficient contrast for readability
  - Real-time visual feedback on color selections
  - Color utility functions for manipulating colors programmatically
  - Ensures brand consistency across all report templates
  - Automatic accessibility corrections with one-click contrast fixing
  - Hover preview of accessible color alternatives
  - WCAG 2.1 compliant color selection guidance
  - All pre-defined color palettes ensure sufficient contrast ratios
- **Micro-interactions**: Added subtle animations and transitions for a more polished feel
- **Improved Footer**: Enhanced footer with better organization and visual hierarchy
- **Grid View for Photos**: Added togglable grid/list view for photo display in the analysis step
  - Grid layout provides an efficient overview when handling large photo collections
  - Each photo is displayed in a square thumbnail with status indicator
  - Click on any thumbnail to open a detailed modal view with full analysis
  - Modal includes navigation controls to move between photos
  - Supports keyboard navigation for accessibility
  - Significantly improves user experience when working with 20+ photos
- **Unified Profile Page**: Combined user and company profile management in a single interface
  - Consolidated company profile settings
  - Added password change functionality
  - Improved user experience by centralizing profile management

### Enhanced Photo Handling
- **Direct Photo Serving API**: Added a dedicated endpoint to serve photos directly from storage
- **Improved Photo Path Resolution**: System now checks multiple possible storage locations for photos
- **Robust Fallback Mechanism**: UI components now have fallback mechanisms to ensure photos display correctly
- **Better Error Handling**: Enhanced logging and error handling for photo processing
- **PDF Photo Integration**: Improved how photos are embedded in PDF reports
- **Improved Thumbnail Display**: Fixed issue with thumbnails showing as grey boxes by implementing better fallback mechanisms
- **Optimized Image Loading**: Added multiple fallback sources for images to ensure proper display
- **Enhanced EXIF Data Extraction**: Improved extraction and display of photo metadata including date/time taken, camera information, and GPS coordinates
- **Improved File-to-Report Associations**: Added explicit reportId-based file relationship management
  - Files in GridFS now store the reportId in their metadata
  - Enables more accurate file management with duplicate filenames across different reports
  - Provides more precise cascade deletion of files when deleting a report
  - Maintains backward compatibility with files uploaded without reportId
  - Improves system reliability by preventing unintended file operations between reports

### PDF Generation Enhancements
- **Streamlined PDF Generation**: Simplified the PDF generation process to use buffers instead of files
- **Improved Photo Embedding**: Better handling of photo paths and embedding in PDFs
- **Enhanced Error Handling**: More robust error handling during PDF generation
- **Consistent Styling**: Improved layout and styling of PDF reports
- **Fixed Empty Pages**: Resolved issue with PDF documents generating unnecessary empty pages
- **Photo Metadata Display**: Added detailed metadata for each photo in reports including when the photo was taken, camera used, exposure settings, and location coordinates
- **Improved Photo Grid Layout**: Better organization of photos in the report with more consistent layout and spacing
- **Smart Page Management**: System now intelligently avoids creating empty pages when photos can't be found

### Frontend Improvements
- **Robust Image Display**: Added fallback mechanisms for image display in the UI
- **Better Error Feedback**: Enhanced error handling and user feedback for photo uploads
- **Placeholder Images**: Added placeholder images for when photos fail to load
- **Report Data Backup System**: Automatically saves report data to localStorage to prevent data loss during submission errors
  - Backs up AI-generated content and report data before submission attempts
  - Provides visual indicator in navigation when backup data is available
  - Dedicated recovery page to view and restore backed up report data
  - Option to copy backup data to clipboard for manual recovery
  - Helps prevent loss of expensive AI-generated content during server errors

### API and Data Handling Improvements
- **Enhanced Request Handling**: Improved handling of large payloads and complex data structures
  - Added robust data sanitization to prevent circular reference errors
  - Implemented consistent field name mapping between frontend and backend
  - Added payload size monitoring and warnings for large requests
  - Increased timeout limits for processing large reports
- **Improved Error Handling**: Better error messages and recovery options
  - Status-code specific error messages to help troubleshoot issues
  - Enhanced validation error extraction from MongoDB responses
  - Clear user feedback when requests are too large or timeout
  - Better handling of backend validation errors
- **Data Structure Normalization**: Ensures consistent data structures for backend processing
  - Normalizes photo object structures before sending to API
  - Handles missing or inconsistent fields gracefully
  - Preserves critical analysis data while eliminating unnecessary fields

### Unified Image Handling
The application now uses a consistent approach for image URL handling across all steps of the report creation process:

1. **Centralized Image URL Resolution**: 
   - Implemented a `getBestImageUrl` function that intelligently determines the best available image URL based on a priority list
   - This ensures thumbnails and images are displayed consistently throughout the application

2. **Robust Fallback Mechanism**:
   - The image display system now tries multiple possible sources in a specific order:
     1. Direct thumbnail URL from server response
     2. Thumbnail filename from server response
     3. Thumbnail path extraction
     4. Optimized image URL
     5. Original image URL
     6. Client-side preview blob
     7. Default placeholder image

3. **Simplified Error Handling**:
   - Added simple and reliable error handlers that display a placeholder when image loading fails
   - Removed complex cascading fallback logic in favor of a single, predictable approach

This unified approach ensures that images display properly throughout the entire report creation workflow, regardless of which stage the user is viewing.

### Vercel Deployment Optimizations

The application has been optimized for deployment in Vercel's serverless environment:

1. **Simplified Architecture**: The application now uses a single, consistent approach for file handling regardless of environment:
   - Memory-based file processing using Multer's memory storage
   - Direct uploads to GridFS from memory buffers
   - Temporary file storage in `/tmp` directory when needed
   - Automatic cleanup of temporary files

2. **Consistent Configuration**: The configuration has been simplified to use the same paths and settings in all environments:
   - All temporary files are stored in `/tmp` directory
   - All uploads use memory storage to avoid disk I/O
   - Directory creation is skipped in Vercel environment
   - GridFS is used for all file storage

3. **Improved Reliability**: The simplified architecture improves reliability by:
   - Eliminating environment-specific code paths
   - Reducing the number of file system operations
   - Using consistent file handling logic across all environments
   - Providing clear error messages for troubleshooting

4. **Enhanced Performance**: The memory-based approach improves performance by:
   - Eliminating disk I/O for most operations
   - Reducing the number of file system operations
   - Streamlining the file upload process
   - Minimizing the time spent in serverless functions

These optimizations ensure that the application runs reliably and efficiently in Vercel's serverless environment while maintaining compatibility with traditional hosting environments.

## Getting Started

### Prerequisites
- Node.js v16+
- MongoDB
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/photo-report-app.git
cd photo-report-app
```

2. Install dependencies for backend:
```bash
cd backend
npm install
```

3. Install dependencies for frontend:
```bash
cd ../frontend
npm install
```

4. Set up environment variables:
- Create a `.env` file in the backend directory
- Add the following variables:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/photo_report_app
JWT_SECRET=your_jwt_secret
TEMP_UPLOAD_DIR=./temp
OPENAI_API_KEY=your_openai_api_key
```

5. Start the development servers:

Backend:
```bash
cd backend
npm run dev
```

Frontend:
```bash
cd frontend
npm run dev
```

6. Access the application at `http://localhost:3000`

## File Upload Functionality

The application supports batch uploading of photos with the following features:

### Frontend Implementation
- Uses React Dropzone for drag-and-drop file selection
- Supports multiple file selection
- Validates file types (JPEG, PNG, HEIC)
- Limits file size to 10MB per file
- Shows upload progress and status for each file
- Provides visual feedback during upload and processing

### Backend Implementation
- Uses Multer middleware for handling multipart/form-data
- Expects files to be uploaded with the field name 'photos' for batch uploads
- Stores files temporarily in a configurable directory
- Processes images using Sharp for optimization and thumbnail generation
- Extracts EXIF data when available
- Cleans up temporary files automatically

### Troubleshooting File Uploads

If you encounter issues with file uploads, check the following:

1. **Field Name**: Ensure the frontend is using the field name 'photos' when appending files to FormData
2. **Content Type**: The request must include 'Content-Type: multipart/form-data'
3. **File Size**: Files must be under the configured limit (default: 10MB)
4. **File Type**: Only allowed file types are accepted (default: JPEG, PNG, HEIC)
5. **Temporary Directory**: Ensure the temporary upload directory exists and has proper permissions
6. **Network Requests**: Use browser developer tools to inspect the network request
7. **Server Logs**: Check the server logs for detailed error messages

For testing file uploads directly, you can use the browser developer tools to monitor network requests and server responses.

### Testing GridFS Implementation

The application uses MongoDB GridFS for storing images and PDFs.

1. Ensure MongoDB is connected and running
2. Use the API endpoints to confirm GridFS operations are working correctly

### GridFS API Endpoints

The following API endpoints are available for GridFS operations:

- `GET /api/files/:fileId` - Stream a file from GridFS
- `GET /api/files/info/:fileId` - Get file information (requires authentication)
- `DELETE /api/files/:fileId` - Delete a file from GridFS (requires authentication)
- `GET /api/files/search` - Search for files by metadata (requires authentication)

File uploads are handled through the middleware system, which automatically stores uploaded files in GridFS.

## Photo Upload and Management System

The application uses a consolidated approach for handling photos throughout the lifecycle of reports:

### Features

- **Unified Photo Upload API** - Single endpoint `/api/photos/upload` handles both single and batch uploads
- **Automatic Report Association** - Photos can be directly linked to reports during upload
- **Thumbnail Generation** - System automatically creates optimized and thumbnail versions
- **AI Analysis Integration** - Photos can be analyzed for damage assessment
- **GridFS Support** - Optional storing of images in MongoDB GridFS for improved scalability
- **Cascading Deletion** - When a report is deleted, all associated photos are automatically removed

### API Endpoints

- `POST /api/photos/upload` - Upload one or more photos (with optional report association)
- `POST /api/photos/analyze/:id` - Analyze a photo using AI
- `POST /api/photos/analyze-batch` - Analyze multiple photos at once
- `DELETE /api/photos/:id` - Delete a photo

### Photo Lifecycle

1. **Upload**: Photos are uploaded via the PhotoUploader component
2. **Processing**: System generates optimized and thumbnail versions
3. **Storage**: Photos are stored either in the filesystem or GridFS
4. **Association**: Photos are linked to a report if a reportId is provided
5. **Display**: Photos are displayed in the report edit interface and PDF
6. **Analysis**: AI can analyze photos for damage assessment
7. **Deletion**: Photos are automatically deleted when a report is removed

### Deployment
- Vercel for hosting both frontend and backend
- Custom Vercel configuration for monorepo structure
- Static build process for frontend with optimized asset delivery
- Serverless functions for backend API endpoints

## Project Structure and Build Process

### Build Process
- The project uses a monorepo structure with separate frontend and backend directories
- Root-level `npm run build` executes the frontend build process for Vercel deployment
- Frontend build is handled by Vite (configured in frontend/package.json)
- Build output is generated in frontend/dist directory
- Vercel configuration routes all requests to the SPA for client-side routing

### Vercel Deployment
- The application is configured for seamless deployment on Vercel
- Key configuration files:
  - `vercel.json`: Defines build command, output directory, and URL rewrites
  - `package.json`: Contains scripts for installation and build processes
- The build process avoids recursive loops by using separate script names
  - Root package.json uses `"build": "cd frontend && npm run vercel-build"`
  - Frontend package.json uses `"vercel-build": "vite build"` and `"build": "vite build"`

### Vercel Serverless Environment Issues

#### Enhanced MongoDB and GridFS Connection Handling

If you encounter database connection issues in Vercel's serverless environment, particularly with GridFS file retrieval:

1. **Robust Database Connection**:
   - The application now implements a more robust database connection strategy for Vercel's serverless environment
   - Ensures MongoDB connection is fully established before handling file requests
   - Implements connection state checking and reconnection logic
   - Uses a connection timeout to prevent hanging requests
   - Provides detailed logging of connection states for troubleshooting

2. **Improved GridFS Initialization**:
   - Enhanced GridFS initialization with retry logic and proper error handling
   - Prevents multiple simultaneous initialization attempts with a locking mechanism
   - Implements a cooldown period between initialization attempts to prevent overloading
   - Provides detailed logging of initialization attempts and failures
   - Forces GridFS usage in Vercel environment for consistent behavior

3. **Robust File Streaming**:
   - Improved file streaming with multiple fallback mechanisms
   - Implements retry logic for file retrieval with exponential backoff
   - Provides detailed error messages for troubleshooting
   - Handles edge cases like invalid file IDs and missing files gracefully
   - Uses direct streaming as a fallback when file info retrieval fails

4. **Temporary Directory Handling**:
   - Uses `/tmp` directory in Vercel's serverless environment for temporary file storage
   - Configures the application to use the appropriate directories based on the environment
   - Prevents attempts to create directories that are not allowed in Vercel's environment
   - Forces GridFS usage in Vercel environment to avoid filesystem dependencies

These improvements ensure that the application can handle file requests reliably in Vercel's serverless environment, even when faced with connection issues or initialization failures.