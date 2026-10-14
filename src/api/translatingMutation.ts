/**
 * The onSuccess a create mutation needs so the record does not stay
 * single-language (M3-10).
 *
 * One line per hook, and no change to the api layer: the table is all the
 * sweep needs. Create paths only — an update is somebody editing, and a
 * machine writing into the other language while a person works in this one is
 * the kind of help nobody asked for.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useAutoTranslate } from './translateHooks';

export function useTranslatingInvalidator(keys: string[], table: string): () => void {
  const client = useQueryClient();
  const translate = useAutoTranslate();
  return () => {
    for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
    void translate(table);
  };
}
