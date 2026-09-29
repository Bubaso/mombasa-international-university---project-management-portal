import re

file_path = 'src/i18n/translations.ts'

with open(file_path, 'r') as f:
    content = f.read()

replacements = {
    # EN
    r"title: 'Legal Defense & Court Portfolio',": "title: 'Legal Affairs',",
    r"subtitle: 'Tracking Moli Family Land Dispute, Court of Appeal E062/2025 & Status Quo Enforcement',": "subtitle: '',",
    
    r"title: 'Campus Construction & Structural Preservation',": "title: 'Construction',",
    r"subtitle: '84-Acre Utange/Majaoni Campus · Phase 1 Academic Blocks & Weather Protection',": "subtitle: '',",
    
    r"title: 'Trustees, Charter & Institutional Governance',": "title: 'Governance',",
    r"subtitle: 'The African University Trust of Kenya \(Cap 164\) · Board of Trustees & Commission for University Education',": "subtitle: '',",
    
    r"title: 'Capital Investment & Accounting API Sync',": "title: 'Finance & Accounting',",
    r"subtitle: 'KShs 807,322,110.00 Disbursed · Live ERP/Accounting Software Integration',": "subtitle: '',",
    
    r"title: 'Secure Document Vault & Version Control',": "title: 'Document Vault',",
    r"subtitle: 'Secure Storage · Verification · Role-Based Access',": "subtitle: '',",
    
    r"title: 'Inter-Team Stakeholder Communications',": "title: 'Communications',",
    r"subtitle: 'Encrypted Communication Channels between Trustees, Legal Counsel, Contractors & Auditors',": "subtitle: '',",
    
    r"title: 'Integration Setup & Questions For You',": "title: 'Setup & Q&A',",
    r"subtitle: 'Specific parameters requested to tailor the application to your exact live setup',": "subtitle: '',",

    # TR
    r"title: 'Hukuki Savunma ve Dava Portföyü',": "title: 'Hukuk İşleri',",
    r"subtitle: 'Moli Ailesi Arazi Davası, E062/2025 Yargıtay Temyizi ve Mevcut Durum Takibi',": "subtitle: '',",
    
    r"title: 'Yerleşke İnşaatı ve Yapısal Koruma',": "title: 'İnşaat İşleri',",
    r"subtitle: '84 Dönüm Utange/Majaoni Kampüsü · 1. Aşama Fakülteler ve Hava Koşullarından Koruma',": "subtitle: '',",
    
    r"title: 'Mütevelliler, Üniversite Beratı ve Yönetişim',": "title: 'Yönetişim',",
    r"subtitle: 'Kenya Afrika Üniversitesi Vakfı \(Fasıl 164\) · Mütevelli Heyeti ve Üniversite Eğitim Komisyonu \(CUE\)',": "subtitle: '',",
    
    r"title: 'Sermaye Yatırımı ve Muhasebe API Entegrasyonu',": "title: 'Finans ve Muhasebe',",
    r"subtitle: 'Kullanılan 807.322.110 KShs Yatırım · Canlı ERP ve Muhasebe Yazılımı Bağlantısı',": "subtitle: '',",
    
    r"title: 'Güvenli Belge Kasası ve Versiyon Kontrolü',": "title: 'Belge Kasası',",
    r"subtitle: 'Güvenli Depolama · Belge Doğrulaması · Rol Bazlı Erişim',": "subtitle: '',",
    
    r"title: 'Paydaşlar Arası İletişim Kanalları',": "title: 'İletişim',",
    r"subtitle: 'Mütevelliler, Avukatlar, Müteahhitler ve Denetçiler Arasında Güvenli Mesajlaşma',": "subtitle: '',",
    
    r"title: 'Entegrasyon Kurulumu ve Size Yöneltilen Sorular',": "title: 'Sistem Kurulumu',",
    r"subtitle: 'Uygulamayı mevcut kurumsal sistemlerinize tam entegre etmek için gerekli parametreler',": "subtitle: '',",
}

for old, new in replacements.items():
    content = re.sub(old, new, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Simplified titles and removed subtitles.")
