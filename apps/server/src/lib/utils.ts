export const sanitizeDate = (dateString: string): string | null => {
    if (dateString === "0000-00-00" || !dateString || dateString.trim() === "") {
      return null;
    }
  
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return null;
      }
      return dateString;
    } catch {
      return null;
    }
  };

  export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }