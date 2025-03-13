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

## Features

- **User Authentication**: Secure login and registration system with JWT
- **User Profile Management**: User and company information management
- **Streamlined Workflow**: Multi-step process from photo upload to PDF generation
- **AI Analysis**: Automated analysis of damage with editable descriptions
  - Uses OpenAI Vision API for detailed damage assessment
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

## API Structure

The application follows a consistent RESTful API structure with the following endpoints:

### Authentication Endpoints
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login a user
- `GET /api/auth/profile` - Get the current user's profile (protected)
- `PUT /api/auth/password` - Change user password (protected)

### Company Endpoints
- `GET /api/company` - Get company information (protected)
- `PUT /api/company` - Update company information (protected)
- `POST /api/company/logo` - Upload company logo (protected)

### Report Endpoints
- `GET /api/reports` - Get all reports for the current user (protected)
- `POST /api/reports` - Create a new report (protected)
- `GET /api/reports/:id` - Get a report by ID (protected)
- `PUT /api/reports/:id` - Update a report (protected)
- `DELETE /api/reports/:id` - Delete a report (protected)
- `POST /api/reports/:id/generate-pdf` - Generate a PDF for a report (protected)
- `POST /api/reports/:id/share` - Generate a sharing link for a report (protected)
- `GET /api/reports/shared/:token` - Get a shared report using a token (public)

### Photo Endpoints
- `POST /api/photos/batch` - Upload multiple photos (protected)
- `POST /api/photos` - Upload a single photo (protected)
- `DELETE /api/photos/:id` - Delete a photo (protected)
- `POST /api/photos/:id/analyze` - Analyze a photo using AI (protected)
- `GET /api/photos/:id` - Get a photo by ID (protected)

All protected endpoints require a valid JWT token that must be included in the Authorization header as a Bearer token:
```
Authorization: Bearer [your-token]
```

### Authentication and User Experience
- Secure login/registration system with JWT tokens
- Persistent authentication that maintains user sessions across page refreshes
- Direct landing on the login page for improved user flow
- Automatic redirection to dashboard after successful login
- Password hashing using bcrypt for secure storage of user credentials
- User password change functionality integrated into the profile page

## Recent Improvements

### Performance and UX Improvements
- **Batch Photo Analysis with GPT-4o-mini**: Implemented a faster and more efficient photo analysis system
  - Uses OpenAI's GPT-4o-mini model for quicker processing while maintaining quality
  - Processes photos in batches of up to 20 at a time for improved speed
  - Handles parallel processing of large photo sets more efficiently
  - Reduces overall analysis time by 50-70% compared to the previous approach
  - Maintains the same high-quality damage detection and description capabilities
- **Marvel Superhero-Themed Loading Screen**: Added an engaging, fun loading experience
  - Displays entertaining Marvel-inspired messages during photo analysis
  - Provides real-time progress updates with a clean progress bar
  - Creates a more enjoyable user experience during longer processing times
  - Rotating messages maintain user engagement during waiting periods
  - Visual design matches superhero aesthetic with animated elements

### Vercel Serverless Deployment Fixes
- **Robust Serverless Environment Support**: Enhanced the application to work correctly in Vercel's serverless environment
  - Fixed filesystem access issues by conditionally creating directories based on environment
  - Properly handled temporary directories in serverless environments
  - Added environment detection to prevent filesystem operations when running on Vercel
  - Improved error handling for filesystem operations
  - Implemented memory storage for file uploads in Vercel environment
  - Used GridFS for all file storage in serverless environments
  - Added streaming support for serving files directly from GridFS
  - Implemented PDF generation with GridFS integration for serverless compatibility
- **API URL Handling Improvements**: Fixed issues with API URL paths in production
  - Resolved the double `/api` prefix issue in production URLs (`/api/api/auth/register`)
  - Implemented robust URL rewriting in the frontend API service
  - Enhanced environment variable handling for better deployment configuration
  - Added better logging for API request troubleshooting
  - **Fixed API Route Handling**: Resolved routing issues in the backend
    - Removed conflicting URL rewriting middleware that was causing registration errors
    - Preserved consistent API path prefixes across development and production
    - Ensured all API routes follow the `/api/[resource]` pattern consistently
    - Improved routing configuration in Vercel to correctly handle API requests

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