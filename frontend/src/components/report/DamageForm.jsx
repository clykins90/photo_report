import React, { useState } from 'react';

const DamageForm = ({ damages = [], addDamage, updateDamage, removeDamage }) => {
  const [newDamage, setNewDamage] = useState({
    type: '',
    severity: 'minor',
    description: '',
    affectedAreas: ''
  });

  const handleAddDamage = () => {
    if (newDamage.type.trim() === '') return;
    
    addDamage(newDamage);
    
    // Reset form
    setNewDamage({
      type: '',
      severity: 'minor',
      description: '',
      affectedAreas: ''
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewDamage(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div>
      {damages.length > 0 && (
        <div className="mb-4 space-y-4">
          {damages.map((damage, index) => (
            <div key={index} className="border border-input rounded-md p-3 relative">
              <button
                onClick={() => removeDamage(index)}
                className="absolute top-2 right-2 text-destructive hover:text-destructive/80"
                aria-label="Remove damage"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    Damage Type
                  </label>
                  <input
                    type="text"
                    value={damage.type}
                    onChange={(e) => updateDamage(index, 'type', e.target.value)}
                    className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    Severity
                  </label>
                  <select
                    value={damage.severity}
                    onChange={(e) => updateDamage(index, 'severity', e.target.value)}
                    className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
                  >
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>
              </div>
              
              <div className="mb-2">
                <label className="block text-sm font-medium text-card-foreground mb-1">
                  Description
                </label>
                <textarea
                  value={damage.description}
                  onChange={(e) => updateDamage(index, 'description', e.target.value)}
                  rows={2}
                  className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
                ></textarea>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">
                  Affected Areas
                </label>
                <input
                  type="text"
                  value={damage.affectedAreas || ''}
                  onChange={(e) => updateDamage(index, 'affectedAreas', e.target.value)}
                  className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
                  placeholder="e.g., South roof slope, Chimney flashing, etc."
                />
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="border border-input rounded-md p-4 bg-muted/30">
        <h4 className="text-md font-medium mb-3">Add New Damage</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Damage Type
            </label>
            <input
              type="text"
              name="type"
              value={newDamage.type}
              onChange={handleChange}
              className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
              placeholder="e.g., Water Infiltration, Hail Damage, etc."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Severity
            </label>
            <select
              name="severity"
              value={newDamage.severity}
              onChange={handleChange}
              className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
            >
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </div>
        </div>
        
        <div className="mb-3">
          <label className="block text-sm font-medium text-card-foreground mb-1">
            Description
          </label>
          <textarea
            name="description"
            value={newDamage.description}
            onChange={handleChange}
            rows={2}
            className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
            placeholder="Describe the damage in detail"
          ></textarea>
        </div>
        
        <div className="mb-3">
          <label className="block text-sm font-medium text-card-foreground mb-1">
            Affected Areas
          </label>
          <input
            type="text"
            name="affectedAreas"
            value={newDamage.affectedAreas}
            onChange={handleChange}
            className="shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border border-input bg-background text-foreground rounded-md"
            placeholder="e.g., South roof slope, Chimney flashing, etc."
          />
        </div>
        
        <div className="mt-4">
          <button
            type="button"
            onClick={handleAddDamage}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            Add Damage
          </button>
        </div>
      </div>
    </div>
  );
};

export default DamageForm; 