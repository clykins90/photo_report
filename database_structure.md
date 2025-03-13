# Database Structure for Roofing Photo Report Application

## Technology
- **MongoDB**: NoSQL document database
- **Mongoose**: ODM for MongoDB

## Database Schema

### User Collection
```javascript
{
  _id: ObjectId,
  email: String,          // Unique, required
  password: String,       // Hashed, required
  firstName: String,
  lastName: String,
  role: String,           // admin, contractor, etc.
  companyId: ObjectId,    // Reference to Company
  createdAt: Date,
  updatedAt: Date,
  lastLogin: Date,
  isActive: Boolean
}
```

### Company Collection
```javascript
{
  _id: ObjectId,
  name: String,           // Required
  logo: String,           // URL to stored logo
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  phone: String,
  email: String,
  website: String,
  licenseNumber: String,
  insuranceInfo: {
    provider: String,
    policyNumber: String,
    expirationDate: Date
  },
  branding: {
    primaryColor: String, // Hex code
    secondaryColor: String,
    fontFamily: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Report Collection
```javascript
{
  _id: ObjectId,
  title: String,           // Required
  clientName: String,      // Required
  propertyAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  inspectionDate: Date,    // Required
  weather: {
    temperature: Number,
    conditions: String,    // Sunny, cloudy, rainy, etc.
    windSpeed: Number
  },
  companyId: ObjectId,     // Reference to Company
  createdBy: ObjectId,     // Reference to User
  summary: String,         // Overall summary of findings
  damages: [{
    type: String,          // Hail, wind, etc.
    severity: String,      // Minor, moderate, severe
    description: String
  }],
  photos: [{
    embeddedInPdfUrl: String, // URL of the photo as embedded in PDF
    order: Number,            // For ordering in the report
    section: String,          // Roof, interior, exterior, etc.
    aiAnalysis: {
      description: String,    // AI-generated description
      tags: [String],         // Keywords extracted from the image
      damageDetected: Boolean,
      damageType: String,     // AI classification of damage
      confidenceScore: Number // AI confidence in analysis
    },
    userDescription: String,  // Manual override/notes
    metadata: {
      fileName: String,
      fileSize: Number,
      width: Number,
      height: Number,
      takenAt: Date,          // From EXIF data if available
      location: {
        latitude: Number,
        longitude: Number
      }
    }
  }],
  recommendations: String,
  status: String,          // draft, complete, submitted
  pdfUrl: String,          // URL to generated PDF
  createdAt: Date,
  updatedAt: Date
}
```

## Relationships

1. **User to Company**: Many-to-One
   - Multiple users can belong to one company
   - User model has a `companyId` reference

2. **Report to Company**: Many-to-One
   - Multiple reports can belong to one company
   - Report model has a `companyId` reference

3. **Report to User**: Many-to-One
   - Multiple reports can be created by one user
   - Report model has a `createdBy` reference

## Indexing Strategy

1. User Collection:
   - Email (unique index)
   - CompanyId (for quick user lookup by company)

2. Company Collection:
   - Name (for searching)

3. Report Collection:
   - CompanyId + CreatedAt (for listing reports by company, sorted by date)
   - CreatedBy (for listing reports by creator)
   - Status (for filtering by status)

## Data Storage Considerations

1. **Simplified Photo Handling**:
   - Photos are only stored temporarily during processing
   - Images embedded in PDF reports only
   - No separate photo collection or permanent storage needed

2. **Generated PDFs**:
   - Stored in cloud storage or server file system
   - Database stores the URL for access

3. **Archiving**:
   - Completed reports archived after a configurable period
   - Automatic backup strategy for database 