const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const API_URL = 'http://localhost:5000/api/photos/batch';
const TOKEN = 'your-auth-token'; // Replace with a valid token
const TEST_IMAGE_PATH = path.join(__dirname, 'test-image.jpg'); // Path to a test image

// Create a test image if it doesn't exist
if (!fs.existsSync(TEST_IMAGE_PATH)) {
  console.log('Test image not found. Creating a simple test image...');
  
  // This will create a very simple 100x100 black JPEG image
  const { createCanvas } = require('canvas');
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, 100, 100);
  
  const buffer = canvas.toBuffer('image/jpeg');
  fs.writeFileSync(TEST_IMAGE_PATH, buffer);
  console.log(`Created test image at ${TEST_IMAGE_PATH}`);
}

async function testUpload() {
  try {
    console.log('Starting upload test...');
    
    // Create form data
    const formData = new FormData();
    
    // Add the test image to the form data with the field name 'photos'
    const fileStream = fs.createReadStream(TEST_IMAGE_PATH);
    formData.append('photos', fileStream, {
      filename: 'test-image.jpg',
      contentType: 'image/jpeg'
    });
    
    console.log('FormData created with field name "photos"');
    
    // Log the headers that will be sent
    console.log('Headers to be sent:');
    console.log(formData.getHeaders());
    
    // Make the request
    console.log(`Sending POST request to ${API_URL}...`);
    const response = await axios.post(API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    console.log('Upload successful!');
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Upload failed:');
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Response headers:', error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received. Request:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up request:', error.message);
    }
    
    throw error;
  }
}

// Run the test
testUpload()
  .then(() => {
    console.log('Test completed successfully');
  })
  .catch((error) => {
    console.error('Test failed:', error.message);
  }); 