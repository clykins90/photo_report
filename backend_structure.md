# Backend Structure for Roofing Photo Report Application

## Technology Stack
- **Node.js**: Runtime environment
- **Express.js**: Web server framework
- **MongoDB**: Database for storing report data and user information
- **Mongoose**: ODM for MongoDB
- **Multer**: Middleware for handling file uploads (temporary storage)
- **Sharp**: Image processing library
- **PDF-lib or PDFKit**: PDF generation
- **OpenAI API or Google Cloud Vision API**: For AI image analysis
- **JWT**: Authentication
- **Helmet**: Security middleware
- **Cors**: Cross-origin resource sharing middleware
- **dotenv**: Environment variable management

## Directory Structure
```
backend/
├── config/              # Configuration files
│   ├── db.js            # Database connection
│   └── config.js        # General configuration
├── controllers/         # Request handlers
│   ├── authController.js
│   ├── reportController.js
│   └── companyController.js
├── middleware/          # Custom middleware
│   ├── auth.js          # Authentication middleware
│   ├── tempUpload.js    # Temporary file upload middleware
│   └── errorHandler.js  # Error handling middleware
├── models/              # Database models
│   ├── User.js
│   ├── Company.js
│   └── Report.js
├── routes/              # API routes
│   ├── authRoutes.js
│   ├── reportRoutes.js
│   └── companyRoutes.js
├── services/            # Business logic
│   ├── photoAnalysisService.js  # AI photo analysis
│   ├── pdfGenerationService.js  # PDF generation
│   └── emailService.js          # Email notifications
├── utils/               # Utility functions
│   ├── logger.js
│   ├── validators.js
│   └── fileCleanup.js   # Temporary file cleanup utility
├── temp/                # Temporary storage for uploads (not in git)
├── .env                 # Environment variables
├── .gitignore
├── package.json
└── server.js            # Entry point
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile

### Company
- `POST /api/company` - Create company profile
- `GET /api/company/:id` - Get company details
- `PUT /api/company/:id` - Update company details

### Reports
- `POST /api/reports` - Create a new report
- `GET /api/reports` - Get all reports for a user
- `GET /api/reports/:id` - Get a specific report
- `PUT /api/reports/:id` - Update a report
- `DELETE /api/reports/:id` - Delete a report
- `GET /api/reports/:id/download` - Download report as PDF
- `POST /api/reports/:id/photos` - Upload and analyze photos for a report (temporary storage)
- `POST /api/reports/:id/generate` - Generate report PDF from analyzed photos

## Key Functionality
1. **Temporary File Processing**: Handle photo uploads for immediate processing
2. **AI Analysis**: Integrate with AI services to analyze roof photos
3. **PDF Generation**: Create professional, branded PDF reports with embedded photos
4. **User Authentication**: Secure user accounts and data
5. **Data Storage**: Store report metadata and PDF links

## Security Measures
- JWT-based authentication
- Input validation and sanitization
- HTTPS enforcement
- API rate limiting
- Secure file upload validation
- Automatic cleanup of temporary files
- Environment-based configuration 