const mongoose = require('mongoose');

// Photo subdocument schema
const PhotoSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  path: {
    type: String,
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  thumbnailUrl: {
    type: String,
  },
  optimizedUrl: {
    type: String,
  },
  section: {
    type: String,
    enum: ['Exterior', 'Interior', 'Roof', 'Attic', 'Other', 'Damage', 'Uncategorized'],
    default: 'Uncategorized'
  },
  userDescription: {
    type: String,
    default: ''
  },
  aiAnalysis: {
    description: String,
    tags: [String],
    damageDetected: Boolean,
    confidence: Number,
    severity: {
      type: String,
      enum: ['minor', 'moderate', 'severe', 'critical', 'unknown'],
      default: 'unknown'
    }
  }
});

const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
      maxlength: [100, 'Title cannot be more than 100 characters'],
    },
    clientName: {
      type: String,
      required: [true, 'Please add a client name'],
      trim: true,
      maxlength: [100, 'Client name cannot be more than 100 characters'],
    },
    propertyAddress: {
      street: {
        type: String,
        required: [true, 'Please add a street address'],
        trim: true,
      },
      city: {
        type: String,
        required: [true, 'Please add a city'],
        trim: true,
      },
      state: {
        type: String,
        required: [true, 'Please add a state'],
        trim: true,
      },
      zipCode: {
        type: String,
        required: [true, 'Please add a zip code'],
        trim: true,
      },
      country: {
        type: String,
        default: 'USA',
        trim: true,
      },
    },
    inspectionDate: {
      type: Date,
      required: [true, 'Please add an inspection date'],
      default: Date.now,
    },
    weather: {
      temperature: {
        type: String,
        trim: true,
      },
      conditions: {
        type: String,
        trim: true,
      },
      windSpeed: {
        type: String,
        trim: true,
      },
    },
    summary: {
      type: String,
      trim: true,
    },
    damages: [
      {
        type: {
          type: String,
          required: true,
          trim: true,
        },
        severity: {
          type: String,
          enum: ['minor', 'moderate', 'severe'],
          default: 'minor',
        },
        description: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],
    photos: [PhotoSchema],
    recommendations: {
      type: String,
      trim: true,
    },
    pdfPath: {
      type: String,
      trim: true,
    },
    shareToken: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    shareExpiry: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
reportSchema.index({ user: 1 });

// Note: Photo deletion is now handled explicitly in the reportController.js
// The pre-findOneAndDelete hook has been removed to avoid potential issues

const Report = mongoose.model('Report', reportSchema);

module.exports = Report; 