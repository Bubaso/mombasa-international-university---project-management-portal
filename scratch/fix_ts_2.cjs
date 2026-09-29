const fs = require('fs');

function replaceFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of replacements) {
    if (typeof search === 'string') {
        content = content.split(search).join(replace);
    } else {
        content = content.replace(search, replace);
    }
  }
  fs.writeFileSync(path, content);
}

// 1. Navbar.tsx
replaceFile('src/components/Navbar.tsx', [
  ['setActiveTab', ''],
]);

// 2. AppContext.tsx
replaceFile('src/context/AppContext.tsx', [
  [
    `export const INITIAL_USER: CurrentUser = {
  id: 'u-1',
  name: 'Simon Karina',
  role: 'legal_counsel',
  organization: 'Simon Karina & Khatib Advocates'
};`,
    `export const INITIAL_USER: CurrentUser = {
  id: 'u-1',
  name: 'Simon Karina',
  role: 'legal_counsel',
  organization: 'Simon Karina & Khatib Advocates',
  email: 'simon@example.com'
};`
  ],
  [
    `provider: 'QuickBooks',
    status: 'connected',
    lastSyncTimestamp: new Date().toISOString()`,
    `provider: 'QuickBooks',
    status: 'connected',
    lastSyncTimestamp: new Date().toISOString(),
    apiUrl: '',
    apiKeyMasked: '',
    syncFrequency: 'daily',
    autoSyncBills: false,
    autoSyncAssets: false`
  ]
]);

// 3. ClarificationDrawer.tsx
replaceFile('src/components/ClarificationDrawer.tsx', [
  ['CLARIFICATION_QUESTIONS: any[]', 'CLARIFICATION_QUESTIONS: any']
]);

// 4. GlobalSearchModal.tsx
replaceFile('src/components/GlobalSearchModal.tsx', [
  ['matchedTx.map((tx)', 'matchedTx.map((tx: any)'],
  ['navigate(', 'navigate('] // wait, it's already using navigate from useLocation/useNavigate
]);

console.log("TS fixes 2 applied");

