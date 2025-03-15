/**
 * Script to create test data for upload testing
 * 
 * This script creates:
 * 1. A test user
 * 2. A test company
 * 3. A test report
 * 
 * Usage: node create-test-data.js
 */

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Import models
const User = require('../models/User');
const Company = require('../models/Company');
const Report = require('../models/Report');

// Test data
const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'password123',
  role: 'admin'
};

const testCompany = {
  name: 'Test Company',
  address: {
    street: '123 Test St',
    city: 'Test City',
    state: 'TS',
    zipCode: '12345'
  },
  phone: '555-123-4567',
  email: 'company@example.com'
};

const testReport = {
  title: 'Test Report for Upload Testing',
  description: 'This report is used for testing the chunked upload functionality',
  clientName: 'Test Client',
  propertyAddress: {
    street: '456 Client St',
    city: 'Client City',
    state: 'CS',
    zipCode: '54321'
  },
  status: 'draft',
  photos: []
};

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
}

// Create test data
async function createTestData() {
  try {
    // Create user
    let user = await User.findOne({ email: testUser.email });
    
    if (!user) {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(testUser.password, salt);
      
      user = await User.create({
        ...testUser,
        password: hashedPassword
      });
      console.log('Created test user:', user._id.toString());
    } else {
      console.log('Using existing test user:', user._id.toString());
    }
    
    // Create company
    let company = await Company.findOne({ name: testCompany.name });
    
    if (!company) {
      company = await Company.create({
        ...testCompany,
        user: user._id
      });
      console.log('Created test company:', company._id.toString());
    } else {
      console.log('Using existing test company:', company._id.toString());
    }
    
    // Create report
    let report = await Report.findOne({ 
      title: testReport.title,
      user: user._id
    });
    
    if (!report) {
      report = await Report.create({
        ...testReport,
        user: user._id,
        company: company._id
      });
      console.log('Created test report:', report._id.toString());
    } else {
      console.log('Using existing test report:', report._id.toString());
    }
    
    // Print test credentials
    console.log('\nTest Credentials:');
    console.log('Email:', testUser.email);
    console.log('Password:', testUser.password);
    console.log('\nTest IDs for Upload Testing:');
    console.log('User ID:', user._id.toString());
    console.log('Company ID:', company._id.toString());
    console.log('Report ID:', report._id.toString());
    
    return {
      user,
      company,
      report
    };
  } catch (error) {
    console.error('Error creating test data:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    await connectDB();
    await createTestData();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 