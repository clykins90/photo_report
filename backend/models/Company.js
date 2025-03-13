const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    logo: {
      type: String, // URL to stored logo for frontend
    },
    logoPath: {
      type: String, // Filesystem path for PDF generation
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    website: {
      type: String,
      trim: true,
    },
    licenseNumber: {
      type: String,
      trim: true,
    },
    insuranceInfo: {
      provider: String,
      policyNumber: String,
      expirationDate: Date,
    },
    branding: {
      primaryColor: {
        type: String,
        default: '#3B82F6', // Default blue color
      },
      secondaryColor: {
        type: String,
        default: '#1E3A8A',
      },
      fontFamily: {
        type: String,
        default: 'Inter',
      },
    },
  },
  {
    timestamps: true,
  }
);

const Company = mongoose.model('Company', companySchema);

module.exports = Company; 