import fs from 'fs';
import path from 'path';

const files = [
  'src/views/LegalAffairsView.tsx',
  'src/views/ConstructionView.tsx',
  'src/views/DocumentVaultView.tsx',
  'src/views/FinanceAccountingView.tsx',
  'src/views/CommunicationView.tsx',
  'src/views/DashboardView.tsx',
  'src/views/GovernanceCharterView.tsx',
  'src/views/ProjectInfoView.tsx',
  'src/components/ClarificationDrawer.tsx',
  'src/components/DeadlineAlertBanner.tsx'
];

for (const file of files) {
  const filePath = path.join('/Users/BURHAN/mombasa-international-university---project-management-portal', file);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace mockData imports
  content = content.replace(/import\s+{.*}\s+from\s+'\.\.\/data\/mockData';\n/g, '');

  // Add hooks import if useApp is imported
  if (content.includes("useApp } from '../context/AppContext'")) {
    content = content.replace(
      /import\s*{\s*useApp\s*}\s*from\s*'(\.\.\/)*context\/AppContext';/,
      `import { useApp } from '$1context/AppContext';\nimport * as queries from '$1api/hooks';`
    );
  }

  // Refactor LegalAffairsView
  if (file.includes('LegalAffairsView')) {
    content = content.replace(
      /const {\s*legalCases,\s*language,\s*addLegalCase,\s*setActiveTab\s*} = useApp\(\);/,
      `const { language, t, showToast } = useApp();\n  const { data: legalCases = [] } = queries.useLegalCases();\n  const { mutate: addLegalCase } = queries.useAddLegalCase();\n  const HEARING_BRIEF_DATA: any = { benchQA: [], authorities: [], summary: '', keyArguments: [], risks: [] };`
    );
  }

  // Refactor ConstructionView
  if (file.includes('ConstructionView')) {
    content = content.replace(
      /const {\s*constructionBlocks,\s*language,\s*updateConstructionBlock,\s*setActiveTab\s*} = useApp\(\);/,
      `const { language, t } = useApp();\n  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();\n  const { mutate: updateConstructionBlock } = queries.useUpdateConstructionBlock();`
    );
  }

  // Refactor DocumentVaultView
  if (file.includes('DocumentVaultView')) {
    content = content.replace(
      /const {\s*documentVault,\s*addDocument,\s*language,\s*showToast\s*} = useApp\(\);/,
      `const { language, showToast } = useApp();\n  const { data: documentVault = [] } = queries.useDocumentVault();\n  const { mutate: addDocument } = queries.useAddDocument();`
    );
  }

  // Refactor GovernanceCharterView
  if (file.includes('GovernanceCharterView')) {
    content = content.replace(
      /const {\s*trustees,\s*language\s*} = useApp\(\);/,
      `const { language } = useApp();\n  const { data: trustees = [] } = queries.useTrustees();`
    );
  }

  // Refactor FinanceAccountingView
  if (file.includes('FinanceAccountingView')) {
    content = content.replace(
      /const {\n\s*language,\n\s*transactions,\n\s*addTransaction,\n\s*accountingConfig,\n\s*updateAccountingConfig,\n\s*triggerAccountingSync,\n\s*isSyncingAccounting\n\s*} = useApp\(\);/,
      `const { language, accountingConfig, updateAccountingConfig, triggerAccountingSync, isSyncingAccounting, showToast } = useApp();\n  const { data: transactions = [] } = queries.useTransactions();\n  const { mutate: addTransaction } = queries.useAddTransaction();\n  const FINANCIAL_SUMMARY: any = { totalBudget: 0, spent: 0, pending: 0 };`
    );
  }

  // Refactor CommunicationView
  if (file.includes('CommunicationView')) {
    content = content.replace(
      /const {\n\s*language,\n\s*communicationThreads,\n\s*addThreadMessage,\n\s*createThread\n\s*} = useApp\(\);/,
      `const { language, showToast } = useApp();\n  const { data: communicationThreads = [] } = queries.useCommunicationThreads();\n  const { mutate: addThreadMessage } = queries.useAddThreadMessage();\n  const { mutate: createThread } = queries.useCreateThread();`
    );
  }

  // Refactor DashboardView
  if (file.includes('DashboardView')) {
    content = content.replace(
      /const {\n\s*language,\n\s*currentUser,\n\s*activeTab,\n\s*setActiveTab,\n\s*legalCases,\n\s*constructionBlocks,\n\s*documentVault,\n\s*transactions,\n\s*deadlines\n\s*} = useApp\(\);/,
      `const { language, currentUser } = useApp();\n  const { data: legalCases = [] } = queries.useLegalCases();\n  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();\n  const { data: documentVault = [] } = queries.useDocumentVault();\n  const { data: transactions = [] } = queries.useTransactions();\n  const { data: deadlines = [] } = queries.useDeadlines();\n  const FINANCIAL_SUMMARY: any = { totalBudget: 0, spent: 0, pending: 0 };`
    );
  }

  // Refactor ProjectInfoView
  if (file.includes('ProjectInfoView')) {
    content = content.replace(
      /const {\s*language,\s*setActiveTab\s*} = useApp\(\);/,
      `const { language } = useApp();`
    );
  }

  // Refactor ClarificationDrawer
  if (file.includes('ClarificationDrawer')) {
    content = content.replace(
      /const {\n\s*language,\n\s*clarificationAnswers,\n\s*setClarificationAnswer,\n\s*currentUser\n\s*} = useApp\(\);/,
      `const { language, clarificationAnswers, setClarificationAnswer, currentUser } = useApp();\n  const CLARIFICATION_QUESTIONS: any[] = [];`
    );
  }

  fs.writeFileSync(filePath, content);
}

console.log("Refactoring complete.");
