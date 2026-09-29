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

// 1. DashboardView
replaceFile('src/views/DashboardView.tsx', [
  [
    `const {
    language,
    currentUser,
    activeTab,
    setActiveTab,
    legalCases,
    constructionBlocks,
    documentVault,
    transactions,
    deadlines
  } = useApp();`,
    `const { language, currentUser } = useApp();
  const { data: legalCases = [] } = queries.useLegalCases();
  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();
  const { data: documentVault = [] } = queries.useDocumentVault();
  const { data: transactions = [] } = queries.useTransactions();
  const { data: deadlines = [] } = queries.useDeadlines();
  const FINANCIAL_SUMMARY: any = { breakdown: [] };`
  ],
  ['setActiveTab(', 'navigate('],
  ['const DashboardView = () => {', 'import { useNavigate } from "react-router-dom";\n\nconst DashboardView = () => {\n  const navigate = useNavigate();'],
  ['export const DashboardView', 'import { useNavigate } from "react-router-dom";\n\nexport const DashboardView'],
  ['const navigate = useNavigate();\n\nexport const DashboardView', 'export const DashboardView'],
  ['export const DashboardView: React.FC = () => {\n', 'export const DashboardView: React.FC = () => {\n  const navigate = useNavigate();\n']
]);

// 2. ConstructionView
replaceFile('src/views/ConstructionView.tsx', [
  ['updateConstructionBlock(selectedBlock.id, {', 'updateConstructionBlock({ id: selectedBlock.id, updates: {'],
  ['setActiveTab(', 'navigate('],
  ['const navigate = useNavigate();\n\nexport const ConstructionView', 'export const ConstructionView'],
  ['export const ConstructionView: React.FC = () => {\n', 'import { useNavigate } from "react-router-dom";\n\nexport const ConstructionView: React.FC = () => {\n  const navigate = useNavigate();\n']
]);

// 3. LegalAffairsView
replaceFile('src/views/LegalAffairsView.tsx', [
  ['setActiveTab(', 'navigate('],
  ['export const LegalAffairsView: React.FC = () => {\n', 'import { useNavigate } from "react-router-dom";\n\nexport const LegalAffairsView: React.FC = () => {\n  const navigate = useNavigate();\n'],
  ['HEARING_BRIEF_DATA.contemptDefensePillars.map((pillar) =>', '(HEARING_BRIEF_DATA?.contemptDefensePillars || []).map((pillar: any) =>'],
  ['HEARING_BRIEF_DATA.benchQA\n', '(HEARING_BRIEF_DATA?.benchQA || [])\n'],
  ['HEARING_BRIEF_DATA.benchQA.', '(HEARING_BRIEF_DATA?.benchQA || []).'],
  ['HEARING_BRIEF_DATA.authorities.map((auth, idx) =>', '(HEARING_BRIEF_DATA?.authorities || []).map((auth: any, idx: number) =>']
]);

// 4. ProjectInfoView
replaceFile('src/views/ProjectInfoView.tsx', [
  ['setActiveTab(', 'navigate('],
  ['export const ProjectInfoView: React.FC = () => {\n', 'import { useNavigate } from "react-router-dom";\n\nexport const ProjectInfoView: React.FC = () => {\n  const navigate = useNavigate();\n']
]);

// 5. FinanceAccountingView
replaceFile('src/views/FinanceAccountingView.tsx', [
  [
    `const {
    language,
    transactions,
    addTransaction,
    accountingConfig,
    updateAccountingConfig,
    triggerAccountingSync,
    isSyncingAccounting
  } = useApp();`,
    `const { language, accountingConfig, updateAccountingConfig, triggerAccountingSync, isSyncingAccounting, showToast } = useApp();
  const { data: transactions = [] } = queries.useTransactions();
  const { mutate: addTransaction } = queries.useAddTransaction();
  const FINANCIAL_SUMMARY: any = { breakdown: [] };`
  ]
]);

// 6. CommunicationView
replaceFile('src/views/CommunicationView.tsx', [
  [
    `const {
    language,
    communicationThreads,
    addThreadMessage,
    createThread
  } = useApp();`,
    `const { language, showToast } = useApp();
  const { data: communicationThreads = [] } = queries.useCommunicationThreads();
  const { mutate: addThreadMessage } = queries.useAddThreadMessage();
  const { mutate: createThread } = queries.useCreateThread();`
  ],
  ['addThreadMessage(activeThread.id, newMessage)', 'addThreadMessage({ threadId: activeThread.id, text: newMessage })']
]);

// 7. ClarificationDrawer
replaceFile('src/components/ClarificationDrawer.tsx', [
  [
    `const {
    language,
    clarificationAnswers,
    setClarificationAnswer,
    currentUser
  } = useApp();`,
    `const { language, clarificationAnswers, setClarificationAnswer, currentUser } = useApp();
  const CLARIFICATION_QUESTIONS: any[] = [];`
  ]
]);

// 8. DeadlineAlertBanner
replaceFile('src/components/DeadlineAlertBanner.tsx', [
  [
    `const { deadlines, dismissDeadline, language, currentUser, setActiveTab } = useApp();`,
    `const { language, currentUser } = useApp();
  const { data: deadlines = [] } = queries.useDeadlines();
  const { mutate: dismissDeadline } = queries.useDismissDeadline();
  const navigate = useNavigate();`
  ],
  [
    `import { useApp } from '../context/AppContext';`,
    `import { useApp } from '../context/AppContext';\nimport * as queries from '../api/hooks';\nimport { useNavigate } from 'react-router-dom';`
  ],
  ['setActiveTab(', 'navigate(']
]);

// 9. GlobalSearchModal
replaceFile('src/components/GlobalSearchModal.tsx', [
  [
    `const {
    language,
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    setActiveTab,
    legalCases,
    constructionBlocks,
    documentVault
  } = useApp();`,
    `const { language, isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery } = useApp();
  const { data: legalCases = [] } = queries.useLegalCases();
  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();
  const { data: documentVault = [] } = queries.useDocumentVault();
  const navigate = useNavigate();`
  ],
  [
    `import { useApp } from '../context/AppContext';`,
    `import { useApp } from '../context/AppContext';\nimport * as queries from '../api/hooks';\nimport { useNavigate } from 'react-router-dom';`
  ],
  ['setActiveTab(', 'navigate(']
]);

// 10. Navbar
replaceFile('src/components/Navbar.tsx', [
  [
    `const {
    language,
    setLanguage,
    currentUser,
    switchRole,
    isSearchOpen,
    setIsSearchOpen
  } = useApp();`,
    `const { language, setLanguage, currentUser, switchRole, isSearchOpen, setIsSearchOpen } = useApp();`
  ]
]);

console.log("TS fixes applied");

