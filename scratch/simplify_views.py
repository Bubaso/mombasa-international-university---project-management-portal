import re
import glob

def process_file(filepath, new_title_tr, new_title_en):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # 1. Update the h1 block
    # We look for <h1 ...> ... </h1>
    h1_pattern = r'(<h1[^>]*>)(.*?)(</h1>)'
    
    # Replacement for H1
    new_h1_content = f"\n            {{language === 'tr' ? '{new_title_tr}' : '{new_title_en}'}}\n          "
    
    # If the view doesn't use {language}, we might need to make sure we don't break things, but all views import `language`.
    content = re.sub(h1_pattern, rf'\1{new_h1_content}\3', content, count=1, flags=re.DOTALL)
    
    # 2. Remove the subtitle <p> block right after </h1>
    # We look for </h1>\n\s*<p className="text-xs text-slate-[56]00 mt-0.5">.*?</p>
    p_pattern = r'(</h1>)\s*<p className="text-xs(?: sm:text-sm)? text-slate-[56]00 mt-[0-9.]+[^>]*>.*?</p>'
    content = re.sub(p_pattern, r'\1', content, count=1, flags=re.DOTALL)
    
    with open(filepath, 'w') as f:
        f.write(content)

views = [
    ('src/views/CommunicationView.tsx', 'İletişim', 'Communications'),
    ('src/views/ConstructionView.tsx', 'İnşaat İşleri', 'Construction'),
    ('src/views/DashboardView.tsx', 'Yönetici Gösterge Paneli', 'Executive Dashboard'),
    ('src/views/DocumentVaultView.tsx', 'Belge Kasası', 'Document Vault'),
    ('src/views/FinanceAccountingView.tsx', 'Finans ve Muhasebe', 'Finance & Accounting'),
    ('src/views/GovernanceCharterView.tsx', 'Yönetişim', 'Governance'),
    ('src/views/LegalAffairsView.tsx', 'Hukuk İşleri', 'Legal Affairs'),
    ('src/views/ProjectInfoView.tsx', 'Proje Künyesi', 'Project Overview'),
]

for view, tr, en in views:
    process_file(view, tr, en)

print("Done simplifying headings and removing subtitles.")
