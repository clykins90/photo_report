import { useState } from 'react';

const AIDescriptionEditor = ({ photo, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedAnalysis, setEditedAnalysis] = useState(photo.analysis || {
    damageDetected: false,
    damageType: '',
    severity: 'minor',
    location: '',
    materials: '',
    description: '',
    tags: [],
    recommendedAction: '',
    confidenceScore: 0
  });

  // Extract structured information from description if available
  const extractRoofingInfo = (description) => {
    const info = {
      location: null,
      materials: null,
      primaryObservations: null,
      recommendedAction: null
    };
    
    if (!description) return info;
    
    // Try to extract location information
    const locationMatch = description.match(/Location:\s*([^\n]+)/i);
    if (locationMatch) info.location = locationMatch[1].trim();
    
    // Try to extract materials information
    const materialsMatch = description.match(/Materials:\s*([^\n]+)/i);
    if (materialsMatch) info.materials = materialsMatch[1].trim();
    
    // Try to extract primary observations
    const observationsMatch = description.match(/Primary Observations:\s*([^\n]+)/i);
    if (observationsMatch) info.primaryObservations = observationsMatch[1].trim();
    
    // Try to extract recommended action
    const actionMatch = description.match(/Recommended Action:\s*([^\n]+)/i);
    if (actionMatch) info.recommendedAction = actionMatch[1].trim();
    
    return info;
  };
  
  // Prioritize direct fields from analysis, fall back to extracted info if needed
  const location = editedAnalysis.location || extractRoofingInfo(editedAnalysis.description).location;
  const materials = editedAnalysis.materials || extractRoofingInfo(editedAnalysis.description).materials;
  const recommendedAction = editedAnalysis.recommendedAction || extractRoofingInfo(editedAnalysis.description).recommendedAction;
  const primaryObservations = extractRoofingInfo(editedAnalysis.description).primaryObservations;

  const handleChange = (field, value) => {
    setEditedAnalysis(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTagsChange = (e) => {
    const tagsString = e.target.value;
    const tagsArray = tagsString.split(',').map(tag => tag.trim()).filter(tag => tag);
    setEditedAnalysis(prev => ({
      ...prev,
      tags: tagsArray
    }));
  };

  const handleSave = () => {
    onUpdate(photo.id, editedAnalysis);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedAnalysis(photo.analysis || {
      damageDetected: false,
      damageType: '',
      severity: 'minor',
      location: '',
      materials: '',
      description: '',
      tags: [],
      recommendedAction: '',
      confidenceScore: 0
    });
    setIsEditing(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mt-2">
      {!isEditing ? (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-foreground">Roofing Analysis</h3>
            <button
              onClick={() => setIsEditing(true)}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Edit
            </button>
          </div>
          
          {/* Structured roofing information */}
          {location && (
            <div className="mb-2">
              <span className="font-medium text-foreground">Location: </span>
              <span className="text-gray-700 dark:text-gray-300">{location}</span>
            </div>
          )}
          
          {materials && (
            <div className="mb-2">
              <span className="font-medium text-foreground">Materials: </span>
              <span className="text-gray-700 dark:text-gray-300">{materials}</span>
            </div>
          )}
          
          {primaryObservations && (
            <div className="mb-2">
              <span className="font-medium text-foreground">Primary Observations: </span>
              <span className="text-gray-700 dark:text-gray-300">{primaryObservations}</span>
            </div>
          )}

          {/* Damage Information */}
          <div className="mb-2">
            <span className="font-medium text-foreground">Damage Detected: </span>
            <span className={`${editedAnalysis.damageDetected ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {editedAnalysis.damageDetected ? 'Yes' : 'No'}
            </span>
          </div>
          
          {editedAnalysis.damageDetected && (
            <>
              <div className="mb-2">
                <span className="font-medium text-foreground">Damage Type: </span>
                <span className="text-gray-700 dark:text-gray-300">{editedAnalysis.damageType || 'Not specified'}</span>
              </div>
              
              <div className="mb-2">
                <span className="font-medium text-foreground">Severity: </span>
                <span className={`${
                  editedAnalysis.severity === 'severe' ? 'text-red-600 dark:text-red-400' :
                  editedAnalysis.severity === 'moderate' ? 'text-orange-500 dark:text-orange-400' : 'text-yellow-600 dark:text-yellow-400'
                }`}>
                  {editedAnalysis.severity || 'Minor'}
                </span>
              </div>
            </>
          )}
          
          <div className="mb-2">
            <span className="font-medium text-foreground">Description: </span>
            <p className="mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-line">{editedAnalysis.description}</p>
          </div>
          
          {recommendedAction && (
            <div className="mb-2">
              <span className="font-medium text-foreground">Recommended Action: </span>
              <p className="mt-1 text-gray-700 dark:text-gray-300">{recommendedAction}</p>
            </div>
          )}
          
          {editedAnalysis.tags && editedAnalysis.tags.length > 0 && (
            <div className="mb-2">
              <span className="font-medium text-foreground">Tags: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {editedAnalysis.tags.map((tag, index) => (
                  <span 
                    key={index} 
                    className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {editedAnalysis.confidenceScore > 0 && (
            <div className="mt-3">
              <span className="font-medium text-foreground">AI Confidence: </span>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                <div 
                  className={`h-2 rounded-full ${
                    editedAnalysis.confidenceScore > 0.7 ? 'bg-green-500' :
                    editedAnalysis.confidenceScore > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${editedAnalysis.confidenceScore * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-semibold mb-3 text-foreground">Edit Analysis</h3>
          
          <div className="space-y-4">
            {/* Location field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                value={editedAnalysis.location || ''}
                onChange={(e) => handleChange('location', e.target.value)}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              />
            </div>
            
            {/* Materials field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Materials
              </label>
              <input
                type="text"
                value={editedAnalysis.materials || ''}
                onChange={(e) => handleChange('materials', e.target.value)}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              />
            </div>
            
            {/* Damage Detected */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Damage Detected
              </label>
              <select
                value={editedAnalysis.damageDetected ? 'true' : 'false'}
                onChange={(e) => handleChange('damageDetected', e.target.value === 'true')}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            
            {/* Damage Type */}
            {editedAnalysis.damageDetected && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Damage Type
                </label>
                <input
                  type="text"
                  value={editedAnalysis.damageType || ''}
                  onChange={(e) => handleChange('damageType', e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  placeholder="e.g., Hail Damage, Wind Damage, Water Infiltration"
                />
              </div>
            )}
            
            {/* Severity */}
            {editedAnalysis.damageDetected && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  value={editedAnalysis.severity || 'minor'}
                  onChange={(e) => handleChange('severity', e.target.value)}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                >
                  <option value="minor">Minor</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </div>
            )}
            
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={editedAnalysis.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={4}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Detailed description of the roof condition or damage..."
              ></textarea>
            </div>
            
            {/* Recommended Action */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recommended Action
              </label>
              <textarea
                value={editedAnalysis.recommendedAction || ''}
                onChange={(e) => handleChange('recommendedAction', e.target.value)}
                rows={2}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Recommended repair or next steps..."
              ></textarea>
            </div>
            
            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={editedAnalysis.tags ? editedAnalysis.tags.join(', ') : ''}
                onChange={handleTagsChange}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="roof, shingles, damage, etc."
              />
            </div>
            
            <div className="flex justify-end space-x-2 pt-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIDescriptionEditor; 