const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Company = require('../models/Company');
const config = require('../config/config');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/photo_report_app')
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const createTestUser = async () => {
  try {
    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@example.com' });
    
    if (existingUser) {
      console.log('Test user already exists');
      
      // Get the company
      const company = await Company.findOne({ user: existingUser._id });
      
      console.log('\n===== TEST CREDENTIALS =====');
      console.log('Email: test@example.com');
      console.log('Password: password123');
      if (company) {
        console.log('Company: ' + company.name);
      }
      console.log('============================\n');
      
      mongoose.disconnect();
      return;
    }
    
    // Create a new user
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const user = new User({
      email: 'test@example.com',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'admin'
    });
    
    await user.save();
    console.log('Test user created');
    
    // Create a company for the test user
    const company = new Company({
      name: 'Test Construction Co.',
      address: '123 Main St, Anytown, USA',
      phone: '555-123-4567',
      email: 'info@testconstruction.com',
      user: user._id
    });
    
    await company.save();
    console.log('Test company created');
    
    console.log('\n===== TEST CREDENTIALS =====');
    console.log('Email: test@example.com');
    console.log('Password: password123');
    console.log('Company: ' + company.name);
    console.log('============================\n');
    
    mongoose.disconnect();
  } catch (error) {
    console.error('Error creating test user:', error);
    mongoose.disconnect();
    process.exit(1);
  }
};

createTestUser(); 