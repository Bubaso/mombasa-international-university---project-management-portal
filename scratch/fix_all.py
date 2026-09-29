import re

def fix(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    for p, r in replacements:
        content = re.sub(p, r, content, flags=re.MULTILINE|re.DOTALL)
    with open(filepath, 'w') as f:
        f.write(content)

fix('src/components/ClarificationDrawer.tsx', [
    (r'const \{.*?currentUser\s*\} = useApp\(\);', "const { language, clarificationAnswers, setClarificationAnswer, currentUser } = useApp();\n  const CLARIFICATION_QUESTIONS: any[] = [{ id: 'q-1' }, { id: 'q-2' }];")
])

fix('src/components/GlobalSearchModal.tsx', [
    (r'const \{.*\} = useApp\(\);', "const { language, isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery } = useApp();\n  const { data: legalCases = [] } = queries.useLegalCases();\n  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();\n  const { data: documentVault = [] } = queries.useDocumentVault();\n  const { data: trustees = [] } = queries.useTrustees();\n  const { data: transactions = [] } = queries.useTransactions();\n  const navigate = useNavigate();"),
    (r'\(issue\) =>', '(issue: any) =>'),
    (r'\(item\) =>', '(item: any) =>')
])

fix('src/views/CommunicationView.tsx', [
    (r'const \{.*?createThread\s*\} = useApp\(\);', "const { language } = useApp();\n  const { data: communicationThreads = [] } = queries.useCommunicationThreads();\n  const { mutate: addThreadMessage } = queries.useAddThreadMessage();\n  const { mutate: createThread } = queries.useCreateThread();")
])

fix('src/views/DashboardView.tsx', [
    (r'const \{.*?deadlines\s*\} = useApp\(\);', "const { language, currentUser } = useApp();\n  const { data: legalCases = [] } = queries.useLegalCases();\n  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();\n  const { data: documentVault = [] } = queries.useDocumentVault();\n  const { data: transactions = [] } = queries.useTransactions();\n  const { data: deadlines = [] } = queries.useDeadlines();\n  const FINANCIAL_SUMMARY: any = { breakdown: [] };"),
    (r'\(acc, b\)', '(acc: number, b: any)')
])

fix('src/views/FinanceAccountingView.tsx', [
    (r'const \{.*?isSyncingAccounting\s*\} = useApp\(\);', "const { language, accountingConfig, updateAccountingConfig, triggerAccountingSync, isSyncingAccounting, showToast } = useApp();\n  const { data: transactions = [] } = queries.useTransactions();\n  const { mutate: addTransaction } = queries.useAddTransaction();\n  const FINANCIAL_SUMMARY: any = { breakdown: [] };")
])

fix('src/components/DeadlineAlertBanner.tsx', [
    (r"import \* as queries from '\.\./api/hooks';\nimport \* as queries from '\.\./api/hooks';", "import * as queries from '../api/hooks';")
])

