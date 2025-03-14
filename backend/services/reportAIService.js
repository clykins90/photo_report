const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Report summary system prompt
const REPORT_SUMMARY_PROMPT = `You are an expert roofing inspector with decades of experience preparing comprehensive insurance reports. 
Your task is to analyze multiple roof photo analyses and create a professional, detailed summary report.

INSTRUCTIONS:
1. Review all provided photo analyses carefully
2. Generate a comprehensive summary of the findings
3. Create a detailed list of damages, categorized by type, severity, and location
4. Provide professional recommendations for repairs based on the observed damage
5. Use formal, technical language appropriate for insurance documentation
6. Include key observations about materials and conditions
7. Prioritize recommendations based on severity and urgency

IMPORTANT: For severity values, you MUST use ONLY one of these three exact values: "minor", "moderate", or "severe". 
Do NOT use any other values or combinations like "moderate to severe" or "minor to moderate". If a damage falls between two levels, choose the higher severity level.

FORMAT YOUR RESPONSE AS JSON:
{
  "summary": "A 2-3 paragraph comprehensive overview of the roof condition and damage findings",
  "damages": [
    {
      "type": "Damage type (e.g., Hail Impact, Wind Damage, Water Infiltration)",
      "severity": "minor|moderate|severe",
      "description": "Detailed description of this damage type, including locations and extent",
      "affectedAreas": "List of affected roof areas"
    }
  ],
  "materials": "A summary of the roofing materials observed across all photos",
  "recommendations": "A numbered list of repair recommendations as a single string with each recommendation on a new line (e.g., '1. Fix shingles\n2. Repair flashing'). Do not use an array format.",
  "tags": ["List", "of", "relevant", "keywords", "from", "all", "photos"]
}`;

/**
 * Generate a comprehensive report summary from multiple photo analyses
 * @param {Array} photoAnalyses - Array of photo analysis objects
 * @returns {Object} - Generated summary, damages list, and recommendations
 */
const generateReportSummary = async (photoAnalyses) => {
  try {
    logger.info(`Generating report summary from ${photoAnalyses.length} photo analyses`);
    
    // Validate input data
    if (!photoAnalyses || !Array.isArray(photoAnalyses) || photoAnalyses.length === 0) {
      logger.error('Invalid or empty photo analyses array provided');
      throw new Error('No valid photo analyses provided for summary generation');
    }
    
    // Log the first photo analysis to help with debugging
    if (photoAnalyses[0] && photoAnalyses[0].analysis) {
      logger.debug('First photo analysis sample:', JSON.stringify(photoAnalyses[0].analysis).substring(0, 200) + '...');
    } else {
      logger.warn('First photo analysis is missing or incomplete');
    }
    
    // Prepare the context from all photo analyses
    const analysisContext = photoAnalyses.map((photo, index) => {
      const analysis = photo.analysis || {};
      
      return `PHOTO ${index + 1}:
Location: ${analysis.location || 'Unknown'}
Damage Detected: ${analysis.damageDetected ? 'Yes' : 'No'}
Damage Type: ${analysis.damageType || 'None'}
Severity: ${analysis.severity || 'N/A'}
Materials: ${analysis.materials || 'Not specified'}
Description: ${analysis.description || 'No description available'}
Tags: ${analysis.tags?.join(', ') || 'None'}
Recommended Action: ${analysis.recommendedAction || 'No recommendation provided'}
Confidence: ${analysis.confidenceScore || 0}
`;
    }).join('\n\n');
    
    logger.debug(`Prepared analysis context with ${photoAnalyses.length} photos`);
    
    // Call OpenAI API to generate summary
    logger.info('Calling OpenAI API to generate summary');
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: REPORT_SUMMARY_PROMPT
        },
        {
          role: "user",
          content: `Generate a comprehensive roof inspection report summary based on these photo analyses:\n\n${analysisContext}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });
    
    // Parse the JSON response
    const summaryText = response.choices[0].message.content;
    logger.debug('Received response from OpenAI');
    let summary;
    
    try {
      summary = JSON.parse(summaryText);
      logger.debug('Successfully parsed OpenAI response as JSON');
      
      // Ensure we have all expected fields
      summary = {
        summary: summary.summary || "Failed to generate automatic summary. Please create a manual summary based on the photo analyses.",
        damages: summary.damages || [],
        materials: summary.materials || "Information about roofing materials is unavailable.",
        recommendations: Array.isArray(summary.recommendations) 
          ? summary.recommendations.join('\n\n') 
          : (summary.recommendations || "Please provide recommendations based on the visible damage in the photos."),
        tags: summary.tags || []
      };
      
      // Extract unique tags from all photos if none were provided
      if (!summary.tags || summary.tags.length === 0) {
        const allTags = new Set();
        photoAnalyses.forEach(photo => {
          if (photo.analysis && photo.analysis.tags) {
            photo.analysis.tags.forEach(tag => allTags.add(tag.toLowerCase()));
          }
        });
        summary.tags = Array.from(allTags);
      }
      
    } catch (parseError) {
      logger.error(`Failed to parse OpenAI response: ${parseError.message}`);
      logger.error(`Response content: ${summaryText.substring(0, 200)}...`);
      
      // Create a default summary in case of parsing error
      summary = {
        summary: "Failed to generate automatic summary. Please create a manual summary based on the photo analyses.",
        damages: [],
        materials: "Information about roofing materials is unavailable.",
        recommendations: "Please provide recommendations based on the visible damage in the photos.",
        tags: []
      };
      
      // Attempt to extract recommendations from the response if possible
      try {
        // Simple regex to check for an array-like structure in the response
        const recommendationsMatch = summaryText.match(/"recommendations"\s*:\s*(\[.*?\])/s);
        if (recommendationsMatch && recommendationsMatch[1]) {
          const recommendationsArray = JSON.parse(recommendationsMatch[1]);
          if (Array.isArray(recommendationsArray)) {
            summary.recommendations = recommendationsArray.join('\n\n');
          }
        }
      } catch (regexError) {
        // Silently fail, keep using the default recommendations
        logger.debug(`Could not extract recommendations with regex: ${regexError.message}`);
      }
    }
    
    logger.info('Successfully generated report summary');
    return summary;
  } catch (error) {
    logger.error(`Error generating report summary: ${error.message}`);
    throw new Error(`Failed to generate report summary: ${error.message}`);
  }
};

module.exports = {
  generateReportSummary,
}; 