# Photo Upload and Retrieval Process (Step 2)

## Overview

Step 2 of the report creation process involves uploading photos to the server and retrieving them with valid MongoDB IDs. This document outlines the systems, APIs, components, and data flow involved in this process.

## Systems Involved

1. **Frontend Client**: React application that handles user interactions and file selection
2. **Backend Server**: Node.js/Express server that processes uploads and stores photos
3. **MongoDB/GridFS**: Database system used for storing photo metadata and binary data

## Key Components

### Frontend Components

1. **PhotoUploadStep**: Parent component that manages the photo upload step in the report creation flow
2. **PhotoUploader**: Core component that handles the photo upload UI and logic
3. **PhotoDropzone**: Component for drag-and-drop file selection
4. **PhotoGrid**: Component for displaying uploaded photos

### Custom Hooks

1. **usePhotoUploadState**: Manages the state of photos, including upload status and progress
2. **useUploadManager**: Handles the upload queue and chunked uploads for large files

### Backend Controllers

1. **photoController**: Handles photo upload requests, processes files, and stores them in GridFS
2. **reportController**: Associates uploaded photos with reports

## API Endpoints

1. **POST /api/photos/upload**: Uploads multiple photos in a single request
2. **POST /api/photos/upload-chunk**: Uploads a chunk of a large photo file
3. **POST /api/photos/complete-upload**: Completes a chunked upload
4. **GET /api/photos/:id**: Retrieves a photo by ID

## Data Flow

### Upload Process

1. User selects photos via drag-and-drop or file picker
2. `addFiles()` adds the files to the local state with client-generated IDs
3. `uploadFilesToServer()` is called with the selected files
4. For each file:
   - A client ID is generated (`client_${timestamp}_${randomString}`)
   - Files are categorized as large (>5MB) or small
   - Large files use chunked upload, small files use batch upload
5. `uploadBatchPhotos()` sends the files to the server with their client IDs
6. Server processes the files:
   - Uploads each file to GridFS
   - Generates MongoDB IDs for each file
   - Creates a mapping between client IDs and server IDs
   - Adds photos to the report
7. Server responds with:
   - Array of photo objects with MongoDB IDs
   - ID mapping object (clientId → serverId)
8. Frontend processes the response:
   - Updates local state with server data using `updatePhotoAfterUpload()`
   - Maintains a local array of updated photos with valid IDs
   - Calls `onUploadComplete()` with the updated photos

### ID Mapping and Retrieval

1. Server creates a mapping between client-generated IDs and MongoDB IDs:
   ```javascript
   {
     "client_1742008050588_1o51sc4": "67d4ef036ea20268be3c7473",
     "client_1742008050588_1vsjz3j": "67d4ef046ea20268be3c747d",
     ...
   }
   ```

2. Frontend uses this mapping to update the local photo objects:
   ```javascript
   updatePhotoAfterUpload(clientId, {
     _id: serverId,
     fileId: serverId,
     // other photo data
   });
   ```

3. `filterPhotosWithValidIds()` is used to ensure only photos with valid MongoDB IDs are passed to the next step

## Key Functions

### Frontend

- **uploadFilesToServer()**: Main function that handles the upload process
- **updatePhotoAfterUpload()**: Updates a photo in state with server data
- **getValidPhotos()**: Filters photos to only those with valid MongoDB IDs
- **filterPhotosWithValidIds()**: Utility function that checks for valid MongoDB IDs

### Backend

- **uploadPhotos()**: Controller function that handles photo uploads
- **uploadBuffer()**: Uploads a file buffer to GridFS
- **completeChunkedUpload()**: Finalizes a chunked upload

## Common Issues and Solutions

### Timing Issues with State Updates

**Problem**: React state updates are asynchronous, so calling `getValidPhotos()` immediately after updating the state may not reflect the latest changes.

**Solution**: Maintain a local array of updated photos and use it directly for callbacks instead of relying on state updates.

### Client-Server ID Synchronization

**Problem**: Ensuring that client-side photo objects are correctly updated with server-generated MongoDB IDs.

**Solution**: Use a client ID → server ID mapping to match uploaded files with their server counterparts.

### Large File Uploads

**Problem**: Uploading large photo files can cause timeouts or memory issues.

**Solution**: Implement chunked uploads for files larger than 5MB, breaking them into smaller pieces (500KB chunks) and uploading them concurrently.

## Data Structures

### Photo Object (Frontend)

```javascript
{
  _id: "67d4ef036ea20268be3c7473",      // MongoDB ID (after upload)
  fileId: "67d4ef036ea20268be3c7473",   // GridFS file ID
  clientId: "client_1742008050588_1o51sc4", // Client-generated ID
  filename: "report_1742008429174_photo.jpeg",
  originalName: "photo.jpeg",
  contentType: "image/jpeg",
  path: "/api/photos/67d4ef036ea20268be3c7473",
  status: "uploaded",                   // pending, uploading, uploaded, analyzed
  uploadProgress: 100,
  preview: "blob:https://example.com/26c223a4..." // Local blob URL
}
```

### Photo Object (Backend/Database)

```javascript
{
  _id: ObjectId("67d4ef036ea20268be3c7473"),
  fileId: ObjectId("67d4ef036ea20268be3c7473"),
  filename: "report_1742008429174_photo.jpeg",
  originalName: "photo.jpeg",
  contentType: "image/jpeg",
  path: "/api/photos/67d4ef036ea20268be3c7473",
  status: "pending",
  uploadDate: ISODate("2025-03-15T03:01:50.505Z"),
  clientId: "client_1742008050588_1o51sc4"
}
```

## Conclusion

The photo upload and retrieval process in Step 2 involves a complex interaction between frontend and backend systems. The key challenge is ensuring that photos uploaded by the user are properly stored on the server and that the frontend state is correctly updated with server-generated MongoDB IDs. By using client IDs, server ID mappings, and careful state management, the system ensures that photos are correctly tracked throughout the upload process and can be reliably retrieved for subsequent steps in the report creation flow. 