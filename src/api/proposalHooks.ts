/** Query hooks for intake proposals and record provenance (M13-18, M13-21). */
import { useQuery } from '@tanstack/react-query';
import * as api from './proposals';

/**
 * Bir ekran dolusu kaydın kökeni, tek okumada.
 *
 * Anahtar sıralanıp birleştiriliyor: aynı küme için ebeveyn her yeniden
 * çizildiğinde yeni bir dizi üretse de sorgu yeniden koşmuyor
 * (`useMachineMarks`'ta da aynı sebeple aynı şey).
 *
 * Dönen şey bir arama fonksiyonu, harita değil: satırı çizen bileşen tek bir
 * kaydı biliyor ve haritanın tamamını taşımasına gerek yok.
 */
export function useRecordOrigins(recordIds: string[]) {
  const key = [...recordIds].sort().join(',');
  const query = useQuery({
    queryKey: ['recordOrigins', key],
    queryFn: () => api.fetchProvenanceOfRecords(recordIds),
    enabled: recordIds.length > 0,
  });
  return {
    of: (recordId: string) => query.data?.get(recordId),
    /** Bu ekranda kaç kaydın kökeni kayıtlı. */
    count: query.data?.size ?? 0,
  };
}
