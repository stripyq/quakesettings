import React from 'react';
import GearList from './GearList';

const MyComponent = () => {
  return (
    <div>
      <div className="mb-4"> {/* Reduced bottom margin */}
        <GearList />
      </div>
      <div className="mt-4"> {/* Adjusted top margin */}
        <h2 className="text-2xl font-bold mb-2">Sensitivity Terms</h2>
        <p>This section contains important information about sensitivity terms.</p>
      </div>
    </div>
  );
};

export default MyComponent;

