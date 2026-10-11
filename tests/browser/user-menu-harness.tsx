import React from 'react';
import { createRoot } from 'react-dom/client';
import { UserMenu } from '../../src/components/UserMenu';

const record = (name: string) => () => {
  document.querySelector('#result')!.textContent += `${name},`;
};
createRoot(document.getElementById('root')!).render(<>
  <UserMenu user={null} userProfile={null} syncStatus="idle" lastSyncTime={null}
    onLogin={record('login')} onOpenSettings={record('settings')}
    onPricingClick={record('premium')} onSignOut={() => {}} onSync={() => {}} />
  <button id="outside">Outside</button>
  <div id="blank" style={{ height: 100 }}>Blank area</div>
  <output id="result" />
</>);
