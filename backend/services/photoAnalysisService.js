const fs = require('fs');
const fsPromises = fs.promises;
const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for photo analysis
const SYSTEM_PROMPT = `You are an expert inspector analyzing photos for a property inspection report. 
Analyze the image and provide a detailed description of what you see, focusing on:
1. What part of the property is shown
2. Any visible damage or issues
3. The severity of any problems
4. Recommendations for repair or further inspection

Format your response as JSON with the following structure: 
{
  "description": string, 
  "tags": [string], 
  "damageDetected": boolean,
  "severity": string,
  "confidence": number
}

For severity, use one of: "minor", "moderate", "severe", "critical", or "unknown".
For confidence, provide a number between 0 and 1.
For tags, include 3-5 relevant keywords that describe the key elements visible in the photo.`;

/**
 * Analyze a photo using OpenAI Vision
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} Analysis results
 */
const analyzePhoto = async (imagePath) => {
  try {
    logger.info(`Analyzing photo: ${imagePath}`);
    
    // Read image as base64
    const imageBuffer = await fsPromises.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this photo for a property inspection report." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });
    
    // Parse the response
    const content = response.choices[0].message.content;
    let analysisResult;
    
    try {
      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      logger.error(`Error parsing AI response: ${parseError.message}`);
      // Fallback to a simpler structure if JSON parsing fails
      analysisResult = {
        description: content,
        tags: [],
        damageDetected: false,
        severity: "unknown",
        confidence: 0
      };
    }
    
    logger.info(`Analysis complete for ${imagePath}`);
    return analysisResult;
  } catch (error) {
    logger.error(`Error analyzing photo: ${error.message}`);
    throw error;
  }
};

module.exports = {
  analyzePhoto
}; 