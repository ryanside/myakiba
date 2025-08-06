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

  export const createFetchOptions = (image: boolean = false): any => ({
    proxy: process.env.HTTP_PROXY,
    tls: {
      rejectUnauthorized: false,
    },
    headers: {
      ...(!image && { "Accept-Encoding": "gzip, deflate, br" }),
    },
    signal: AbortSignal.timeout(10000),
  });

  export const normalizeDateString = (dateStr: string): string => {
    const trimmed = dateStr.trim();
  
    // Handle year only (e.g., "2006")
    if (/^\d{4}$/.test(trimmed)) {
      return `${trimmed}-01-01`;
    }
  
    // Handle MM/YYYY format (e.g., "09/2010")
    if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
      const [month, year] = trimmed.split("/");
      const paddedMonth = month.padStart(2, "0");
      return `${year}-${paddedMonth}-01`;
    }
  
    // Try to parse as a regular date - if it fails, default to a fallback
    try {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }
      return date.toISOString().split("T")[0]; // Return YYYY-MM-DD format
    } catch {
      // If all else fails, return a default date or throw an error
      console.warn(`Unable to parse date: "${dateStr}". Using fallback date.`);
      return "1970-01-01"; // Fallback date
    }
  };