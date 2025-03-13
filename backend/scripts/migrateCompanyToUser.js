/**
 * Migration script to move company data from the Company collection to the User model
 */
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const Company = require('../models/Company');
const Report = require('../models/Report');
const logger = require('../utils/logger');

// Get MongoDB URI from environment variables
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('MongoDB URI is not defined in environment variables');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

async function migrateData() {
  try {
    console.log('Starting migration of company data to user model...');
    
    // Get all companies
    const companies = await Company.find({});
    console.log(`Found ${companies.length} companies to migrate`);
    
    // For each company, find associated users and update them
    for (const company of companies) {
      console.log(`Processing company: ${company.name} (${company._id})`);
      
      // Find users associated with this company
      const users = await User.find({ companyId: company._id });
      console.log(`Found ${users.length} users for company ${company.name}`);
      
      // Update each user with embedded company data
      for (const user of users) {
        console.log(`Updating user ${user.email} with company data`);
        
        user.company = {
          name: company.name,
          logo: company.logo,
          logoPath: company.logoPath,
          address: company.address,
          phone: company.phone,
          email: company.email,
          website: company.website,
          licenseNumber: company.licenseNumber,
          insuranceInfo: company.insuranceInfo,
          branding: company.branding
        };
        
        // Remove the old companyId field
        user.companyId = undefined;
        
        await user.save();
        console.log(`Updated user ${user.email}`);
      }
    }
    
    // Update reports to remove company references
    console.log('Updating reports to reference user only...');
    const reports = await Report.find({});
    console.log(`Found ${reports.length} reports to update`);
    
    for (const report of reports) {
      // The company information will now be accessed through the user
      // so we don't need to update anything else in the report
      
      // Just handle any validation issues
      try {
        await report.save();
      } catch (e) {
        console.log(`Error saving report ${report._id}: ${e.message}`);
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close the connection when done
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the migration
migrateData(); 