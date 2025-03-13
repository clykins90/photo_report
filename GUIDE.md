# Photo Report App - User Guide

## Test Credentials

```
Email: test@example.com
Password: password123
```

## Complete Flow Guide

Follow these steps to test the complete flow of the application:

### 1. Start the Application

Make sure both the backend and frontend servers are running:

```bash
# Terminal 1 - Start the backend
cd backend
npm run dev

# Terminal 2 - Start the frontend
cd frontend
npm run dev
```

### 2. Login

1. Open your browser and navigate to `http://localhost:3000/login`
2. Enter the test credentials:
   - Email: `test@example.com`
   - Password: `password123`
3. Click "Login"

### 3. Create a New Report

1. From the dashboard, click "Create New Report"
2. Fill in the basic information:
   - Title: e.g., "Roof Damage Inspection"
   - Client Name: e.g., "John Smith"
   - Property Address: Fill in all required fields
   - Inspection Date: Select today's date
   - Weather Conditions (optional)
3. Click "Next" to proceed to the Photos step

### 4. Upload and Analyze Photos

1. Drag and drop multiple photos or click to select files
   - You can use any JPEG, PNG, or HEIC photos (max 10MB each)
2. Click "Upload & Analyze"
3. Wait for the AI to analyze each photo
4. Review the AI-generated descriptions
5. Edit any descriptions if needed by clicking the "Edit" button
6. Click "Next" to proceed to the Damages step

### 5. Add Damage Information

1. Add damage entries based on the photos:
   - Type: e.g., "Roof Damage", "Water Damage"
   - Severity: Select from Minor, Moderate, or Severe
   - Description: Provide details about the damage
2. Click "Add Damage" to add more entries if needed
3. Click "Next" to proceed to the Summary step

### 6. Complete the Report

1. Add a summary of the inspection
2. Add recommendations for repairs or next steps
3. Review all information
4. Click "Create Report" to finalize

### 7. Generate PDF

1. From the report detail page, click "Generate PDF"
2. Wait for the PDF to be generated
3. Once complete, click "Download PDF" to view the generated report

### 8. Share the Report

1. Scroll down to the "Share Report" section
2. Click "Generate Sharing Link"
3. Copy the link
4. Open the link in a new browser window or incognito mode to see how clients will view the report

## Features to Test

- **Large Photo Upload**: Try uploading 10+ photos at once
- **AI Analysis**: Check if the AI correctly identifies damage in photos
- **AI Description Editing**: Edit the AI-generated descriptions to correct or enhance them
- **PDF Generation**: Verify the PDF includes all photos, descriptions, and a table of contents
- **Report Sharing**: Test that the shared link works and displays the report correctly

## Troubleshooting

- If you encounter any issues with the AI analysis, check that the OpenAI API key is correctly set in the backend `.env` file
- If photos fail to upload, ensure the temporary directory exists and has write permissions
- If the PDF generation fails, check the console logs for specific errors 