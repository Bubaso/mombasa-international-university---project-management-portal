import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import * as queries from '../api/hooks';
import { type CommunicationThread } from '../types';
import {
  MessagesSquare,
  Send,
  Plus,
  Pin,
  AlertTriangle,
  Inbox
} from 'lucide-react';

export const CommunicationView: React.FC = () => {
  const { currentUser, language } = useApp();
  const { data: communicationThreads = [] } = queries.useCommunicationThreads();
  const { mutate: addThreadMessage } = queries.useAddThreadMessage();
  const { mutate: createThread } = queries.useCreateThread();

  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);

  // New Thread Form
  const [newTitle, setNewTitle] = useState('');
  const [newChannel, setNewChannel] = useState<CommunicationThread['channel']>('legal');
  const [isUrgent, setIsUrgent] = useState(false);
  const [firstMessage, setFirstMessage] = useState('');

  const filteredThreads = communicationThreads.filter((th: any) => {
    if (activeChannel === 'all') return true;
    return th.channel === activeChannel;
  });

  const activeThread =
    communicationThreads.find((th: any) => th.id === selectedThreadId) || filteredThreads[0] || null;

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeThread) return;
    addThreadMessage({ threadId: activeThread.id, text: replyText.trim() });
    setReplyText('');
  };

  const handleCreateThread = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !firstMessage.trim()) return;

    createThread({
      title: newTitle,
      channel: newChannel,
      urgent: isUrgent,
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: currentUser.name,
          role: currentUser.role,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: firstMessage
        }
      ]
    });

    setNewTitle('');
    setFirstMessage('');
    setIsUrgent(false);
    setShowNewThreadModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 uppercase tracking-wider">
            <MessagesSquare className="w-4 h-4 text-amber-600" />
            <span>{language === 'tr' ? 'Paydaşlar Arası Güvenli İletişim' : 'Inter-Stakeholder Communication Gateway'}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {language === 'tr' ? 'İletişim' : 'Communications'}
          </h1>
        </div>

        <button
          onClick={() => setShowNewThreadModal(true)}
          className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer self-start md:self-auto shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{language === 'tr' ? 'Yeni Konu Aç / Duyuru Paylaş' : 'Start New Discussion'}</span>
        </button>
      </div>

      {/* Main Grid: Channels & Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[720px]">
        {/* Left Column: Thread List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-xs">
          {/* Channel Filter Bar */}
          <div className="p-3 border-b border-slate-200 bg-slate-50 overflow-x-auto flex gap-1 text-xs">
            {[
              { id: 'all', labelEn: 'All Channels', labelTr: 'Tüm Kanallar' },
              { id: 'legal', labelEn: '#legal', labelTr: '#hukuk' },
              { id: 'construction', labelEn: '#construction', labelTr: '#insaat' },
              { id: 'trustees', labelEn: '#trustees', labelTr: '#mutevelli' },
              { id: 'finance', labelEn: '#finance', labelTr: '#maliye' }
            ].map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors cursor-pointer text-xs ${
                  activeChannel === ch.id
                    ? 'bg-amber-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {language === 'tr' ? ch.labelTr : ch.labelEn}
              </button>
            ))}
          </div>

          {/* Threads List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredThreads.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <Inbox className="w-6 h-6 text-amber-600" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-800">
                    {language === 'tr' ? 'Bu Kanalda Mesaj Bulunmuyor' : 'No Messages in this Channel'}
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    {language === 'tr'
                      ? 'Paydaşlarla resmi veya teknik bir konu görüşmek için yukarıdaki butondan yeni konu başlatabilirsiniz.'
                      : 'Post an internal coordination message, legal dispatch or engineering query to begin.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowNewThreadModal(true)}
                  className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{language === 'tr' ? 'İlk Konuyu Aç' : 'Start First Thread'}</span>
                </button>
              </div>
            ) : (
              filteredThreads.map((th: any) => {
                const isSelected = activeThread?.id === th.id;
                const lastMsg = th.messages[th.messages.length - 1];

                return (
                  <div
                    key={th.id}
                    onClick={() => setSelectedThreadId(th.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <div className="flex items-center gap-1.5 font-mono text-amber-800 uppercase font-semibold">
                        {th.pinned && <Pin className="w-3 h-3 text-amber-600 rotate-45" />}
                        {th.urgent && (
                          <span className="flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 text-[10px]">
                            <AlertTriangle className="w-3 h-3" />
                            {language === 'tr' ? 'ACİL' : 'URGENT'}
                          </span>
                        )}
                        <span>#{th.channel}</span>
                      </div>
                      <span className="text-slate-400 text-[10px]">{th.timestamp}</span>
                    </div>

                    <h3 className="font-semibold text-slate-900 text-xs mt-1 line-clamp-1">{th.title}</h3>
                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                      {lastMsg ? `${lastMsg.sender.split(' ')[0]}: ${lastMsg.text}` : ''}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat View */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between shadow-xs">
          {activeThread ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-amber-800 font-bold uppercase">#{activeThread.channel}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">{activeThread.authorOrg}</span>
                  </div>
                  {activeThread.urgent && (
                    <span className="text-[10px] bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded font-mono font-bold">
                      {language === 'tr' ? 'ACİL EYLEM' : 'URGENT ACTION'}
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-bold text-slate-900 mt-1">{activeThread.title}</h2>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {activeThread.messages.map((msg: any) => {
                  const isMe = msg.sender.includes(currentUser.name.split(' ')[0]);

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col space-y-1 ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 px-1">
                        <span className="font-semibold text-slate-700">{msg.sender}</span>
                        <span className="font-mono text-slate-400">{msg.timestamp}</span>
                      </div>
                      <div
                        className={`p-3 rounded-xl text-xs max-w-[85%] leading-relaxed ${
                          isMe
                            ? 'bg-amber-600 text-white rounded-tr-none shadow-xs'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-xs'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-slate-200 bg-white flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Mesajınızı veya resmi yanıtınızı yazın...'
                      : 'Type a message or formal update...'
                  }
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{language === 'tr' ? 'Gönder' : 'Send'}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                <MessagesSquare className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-sm font-bold text-slate-800">
                  {language === 'tr'
                    ? 'Paydaşlar Arası İletişim Merkezi'
                    : 'Inter-Stakeholder Communication Hub'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {language === 'tr'
                    ? 'Mütevelli heyeti, avukatlar, şantiye müteahhitleri ve mali denetçiler arasında güvenli mesajlaşma başlatmak için yukarıdaki "Yeni Konu Aç / Duyuru Paylaş" butonuna tıklayın.'
                    : 'Start a secure discussion thread between the Board of Trustees, legal defense counsel, site contractors, and financial auditors.'}
                </p>
              </div>
              <button
                onClick={() => setShowNewThreadModal(true)}
                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'tr' ? 'Yeni Konu Aç' : 'Start New Discussion'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Thread Modal */}
      {showNewThreadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {language === 'tr' ? 'Yeni Paydaş İletişim Konusu Başlat' : 'Start New Stakeholder Thread'}
              </h3>
              <button
                onClick={() => setShowNewThreadModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateThread} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Konu Başlığı:' : 'Discussion Title:'}
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Örn: Şantiye Çevre Duvarı Güvenlik Raporu'
                      : 'e.g. Site Perimeter Security & Boundary Log'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    {language === 'tr' ? 'İletişim Kanalı:' : 'Channel:'}
                  </label>
                  <select
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                  >
                    <option value="legal">{language === 'tr' ? '#hukuk (Legal)' : '#legal'}</option>
                    <option value="construction">{language === 'tr' ? '#insaat (Construction)' : '#construction'}</option>
                    <option value="trustees">{language === 'tr' ? '#mutevelli (Trustees)' : '#trustees'}</option>
                    <option value="finance">{language === 'tr' ? '#maliye (Finance)' : '#finance'}</option>
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={isUrgent}
                      onChange={(e) => setIsUrgent(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 bg-white border-slate-300 focus:ring-0"
                    />
                    <span>{language === 'tr' ? 'Acil Eylem Bayrağı' : 'Flag as Urgent Action'}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {language === 'tr' ? 'Mesaj / Açıklama Metni:' : 'Initial Message / Briefing:'}
                </label>
                <textarea
                  rows={4}
                  required
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  placeholder={
                    language === 'tr'
                      ? 'Paydaşlara iletmek istediğiniz detaylı bilgi veya soruyu yazın...'
                      : 'Provide full background, questions or actionable directives...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewThreadModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs cursor-pointer font-medium"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  {language === 'tr' ? 'Konuyu Başlat' : 'Post Discussion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
