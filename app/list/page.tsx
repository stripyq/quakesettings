import React from 'react';
import GearList from '@/components/gear-list';

const ListPage = () => {
  return (
    <div>
      <div className="mb-4">
        <GearList />
      </div>
      <div className="mt-4">
        <h2 className="text-2xl font-bold mb-2">Sensitivity Terms</h2>
        <p>This section contains important information about sensitivity terms.</p>
      </div>
    </div>
  );
};

export default ListPage;

