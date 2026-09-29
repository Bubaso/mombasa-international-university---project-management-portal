import os
import re

def fix_file(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for pattern, repl in replacements:
        content = re.sub(pattern, repl, content)
        
    with open(filepath, 'w') as f:
        f.write(content)

# 1. DashboardView
fix_file('src/views/DashboardView.tsx', [
    (r"const \{.*?deadlines\s*\} = useApp\(\);",
     "const { language, currentUser } = useApp();\n  const { data: legalCases = [] } = queries.useLegalCases();\n  const { data: constructionBlocks = [] } = queries.useConstructionBlocks();\n  const { data: documentVault = [] } = queries.useDocumentVault();\n  const { data: transactions = [] } = queries.useTransactions();\n  const { data: deadlines = [] } = queries.useDeadlines();\n  const FINANCIAL_SUMMARY: any = { breakdown: [] };"),
    (r"b\.progressPercent", "b.progressPercent"),
    (r"\(b\) =>", "(b: any) =>"),
    (r"\(item, idx\) =>", "(item: any, idx: number) =>"),
])

# 2. FinanceAccountingView
fix_file('src/views/FinanceAccountingView.tsx', [
    (r"const \{.*?isSyncingAccounting\s*\} = useApp\(\);",
     "const { language, accountingConfig, updateAccountingConfig, triggerAccountingSync, isSyncingAccounting, showToast } = useApp();\n  const { data: transactions = [] } = queries.useTransactions();\n  const { mutate: addTransaction } = queries.useAddTransaction();\n  const FINANCIAL_SUMMARY: any = { breakdown: [] };"),
    (r"\(item, idx\) =>", "(item: any, idx: number) =>"),
    (r"\(tx\) =>", "(tx: any) =>"),
])

# 3. CommunicationView
fix_file('src/views/CommunicationView.tsx', [
    (r"const \{.*?createThread\s*\} = useApp\(\);",
     "const { language, showToast } = useApp();\n  const { data: communicationThreads = [] } = queries.useCommunicationThreads();\n  const { mutate: addThreadMessage } = queries.useAddThreadMessage();\n  const { mutate: createThread } = queries.useCreateThread();"),
    (r"\(th\) =>", "(th: any) =>"),
    (r"\(msg\) =>", "(msg: any) =>"),
])

# 4. LegalAffairsView
fix_file('src/views/LegalAffairsView.tsx', [
    (r"\(item\) =>", "(item: any) =>"),
    (r"\(qa, idx\) =>", "(qa: any, idx: number) =>"),
])

# 5. GlobalSearchModal
fix_file('src/components/GlobalSearchModal.tsx', [
    (r"navigate\('", "navigate('/"), # Fix route paths
    (r"\(c\) =>", "(c: any) =>"),
    (r"\(d\) =>", "(d: any) =>"),
    (r"\(b\) =>", "(b: any) =>"),
    (r"\(t\) =>", "(t: any) =>"),
    (r"\(tx\) =>", "(tx: any) =>"),
])

# 6. ClarificationDrawer
fix_file('src/components/ClarificationDrawer.tsx', [
    (r"\(q\) =>", "(q: any) =>"),
    (r"\(item, idx\) =>", "(item: any, idx: number) =>"),
])

print("TS fixes 3 applied")
