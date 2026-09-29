import re

def inject_ai(filepath, import_stmt, component_jsx):
    with open(filepath, 'r') as f:
        content = f.read()

    # Inject import after the last import
    last_import_idx = content.rfind('import ')
    if last_import_idx != -1:
        end_of_last_import = content.find('\n', last_import_idx)
        content = content[:end_of_last_import] + '\n' + import_stmt + content[end_of_last_import:]

    # Inject component before the last closing div of the return statement
    # A bit naive but usually works: find the last '  </div>\n  );\n};' or similar.
    # To be safe, we replace the final '  </div>\n  );' or '</div>\n  );' or '</div>\n);'
    
    # Let's find the last occurrence of '</div>' before ');'
    matches = list(re.finditer(r'</\s*div\s*>\s*\)\s*;', content))
    if matches:
        last_match = matches[-1]
        start, end = last_match.span()
        replacement = component_jsx + '\n' + content[start:end]
        content = content[:start] + replacement + content[end:]
    else:
        print(f"Warning: could not find return block in {filepath}")

    with open(filepath, 'w') as f:
        f.write(content)

# 1. LegalAffairsView
inject_ai(
    'src/views/LegalAffairsView.tsx',
    "import { ContextualAIAssistant } from '../components/ContextualAIAssistant';",
    """
      <ContextualAIAssistant 
        contextData={JSON.stringify(activeCase)}
        systemInstruction="You are an expert legal AI assistant. Provide concise, legally sound analysis based ONLY on the provided case data."
        title={language === 'tr' ? 'Hukuk Asistanı' : 'Legal AI Assistant'}
      />
    """
)

# 2. ConstructionView
inject_ai(
    'src/views/ConstructionView.tsx',
    "import { ContextualAIAssistant } from '../components/ContextualAIAssistant';",
    """
      <ContextualAIAssistant 
        contextData={JSON.stringify({ blocks: constructionBlocks })}
        systemInstruction="You are an expert construction project management AI. Analyze block progress, identify bottlenecks, and suggest preservation actions based on the provided context."
        title={language === 'tr' ? 'İnşaat AI Asistanı' : 'Construction AI Assistant'}
      />
    """
)

# 3. FinanceAccountingView
inject_ai(
    'src/views/FinanceAccountingView.tsx',
    "import { ContextualAIAssistant } from '../components/ContextualAIAssistant';",
    """
      <ContextualAIAssistant 
        contextData={JSON.stringify({ transactions })}
        systemInstruction="You are an expert financial auditor AI. Analyze transactions, calculate totals, and identify suspicious spending or trends based ONLY on the provided financial data."
        title={language === 'tr' ? 'Finans AI Asistanı' : 'Finance AI Assistant'}
      />
    """
)

# 4. DocumentVaultView
inject_ai(
    'src/views/DocumentVaultView.tsx',
    "import { ContextualAIAssistant } from '../components/ContextualAIAssistant';",
    """
      <ContextualAIAssistant 
        contextData={JSON.stringify(documentVault)}
        systemInstruction="You are an expert document archivist AI. Help the user find specific document versions, clarify access roles, and summarize document categories based ONLY on the provided context."
        title={language === 'tr' ? 'Döküman AI Asistanı' : 'Document Vault AI'}
      />
    """
)

# 5. DashboardView
inject_ai(
    'src/views/DashboardView.tsx',
    "import { ContextualAIAssistant } from '../components/ContextualAIAssistant';",
    """
      <ContextualAIAssistant 
        contextData={JSON.stringify({ deadlines, legalCases, constructionBlocks, transactions })}
        systemInstruction="You are a Master Project Manager AI for the Mombasa International University Project Management Portal. Provide high-level executive summaries, prioritize upcoming deadlines, and identify overarching project risks based on the provided aggregated context."
        title={language === 'tr' ? 'Genel Yönetici AI (Executive)' : 'Executive AI Assistant'}
      />
    """
)

print("Done injecting AI assistants.")
