# Frontend Structure for Roofing Photo Report Application

## Technology Stack
- **React**: UI library
- **Vite**: Build tool and development server
- **TailwindCSS**: Utility-first CSS framework
- **React Router**: Navigation
- **React Query**: Server state management
- **Axios**: HTTP client
- **Formik or React Hook Form**: Form handling
- **Yup**: Form validation
- **React Dropzone**: File upload UI
- **React-PDF**: PDF preview
- **Headless UI**: Accessible UI components
- **Heroicons**: Icon set
- **ESLint & Prettier**: Code quality tools

## Directory Structure
```
frontend/
├── public/              # Static files
│   ├── favicon.ico
│   └── logo.png
├── src/
│   ├── assets/          # Static resources
│   │   ├── images/
│   │   └── styles/
│   ├── components/      # Reusable UI components
│   │   ├── common/      # Shared components
│   │   │   ├── Button.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Modal.jsx
│   │   │   └── Spinner.jsx
│   │   ├── layout/      # Layout components
│   │   │   ├── Header.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── MainLayout.jsx
│   │   ├── auth/        # Authentication components
│   │   │   ├── LoginForm.jsx
│   │   │   └── RegisterForm.jsx
│   │   ├── company/     # Company-related components
│   │   │   ├── CompanyProfile.jsx
│   │   │   └── CompanyForm.jsx
│   │   ├── photo/       # Photo-related components (temporary handling)
│   │   │   ├── PhotoUploader.jsx
│   │   │   ├── PhotoPreview.jsx
│   │   │   ├── PhotoAnalysisEditor.jsx
│   │   │   └── PhotoOrganizer.jsx
│   │   └── report/      # Report-related components
│   │       ├── ReportForm.jsx
│   │       ├── ReportList.jsx
│   │       ├── ReportDetail.jsx
│   │       └── ReportPreview.jsx
│   ├── context/         # React Context
│   │   ├── AuthContext.jsx
│   │   └── ThemeContext.jsx
│   ├── hooks/           # Custom hooks
│   │   ├── useAuth.js
│   │   ├── useForm.js
│   │   ├── useReport.js
│   │   └── usePhotoUpload.js  # Temporary photo upload hook
│   ├── pages/           # Top-level pages
│   │   ├── HomePage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── RegisterPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── ReportListPage.jsx
│   │   ├── ReportCreationPage.jsx
│   │   ├── ReportDetailPage.jsx
│   │   └── CompanyProfilePage.jsx
│   ├── services/        # API service calls
│   │   ├── api.js       # API client setup
│   │   ├── authService.js
│   │   ├── reportService.js
│   │   └── companyService.js
│   ├── utils/           # Utility functions
│   │   ├── formatters.js
│   │   ├── validators.js
│   │   └── helpers.js
│   ├── App.jsx          # Main component
│   ├── main.jsx         # Entry point
│   └── routes.jsx       # Route definitions
├── .env                 # Environment variables
├── .gitignore
├── index.html
├── package.json
├── tailwind.config.js   # Tailwind configuration
└── vite.config.js       # Vite configuration
```

## Key UI Screens

### Authentication
- **Login Screen**: User login form
- **Registration Screen**: New user registration form

### Dashboard
- **Home Dashboard**: Overview of recent reports, metrics, and quick actions
- **Company Profile**: Company details and branding options

### Report Management
- **Report List**: List of all reports with filtering and sorting
- **Report Creation**: Single-flow form for creating reports
  - Step 1: Basic information (date, location, client details)
  - Step 2: Photo upload, AI analysis, and organization
  - Step 3: Report preview and generation

### Report Viewing
- **Report Detail**: View a single report with its PDF
- **PDF Preview**: Preview the generated PDF
- **Download Options**: PDF download and sharing options

## Design System
- **Color Palette**: Professional, trustworthy color scheme with brand customization
- **Typography**: Clear, readable fonts for both headers and body text
- **Components**: Consistent, accessible UI components
- **Responsive Design**: Fully responsive layouts for all devices
- **Dark/Light Mode**: Support for user preference

## User Experience Features
- **Drag-and-drop** photo uploads
- **Progress indicators** for photo analysis and report generation
- **Inline editing** of AI-generated descriptions
- **Real-time preview** of photo analysis
- **Customizable templates** for different report styles
- **Shareable links** for clients and adjusters
- **One-shot workflow** for simplified report creation 